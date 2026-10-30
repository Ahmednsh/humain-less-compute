import { Worker } from 'node:worker_threads';
import type { DatabaseSync } from 'node:sqlite';
import { isSafeSelect, runReadOnly, type QueryResult } from './db.js';

/** Executes model-written SQL. The worker variant enforces a wall-clock deadline (spec §3.1/§3.10). */
export interface SqlExec {
  run(sql: string, opts?: { rowCap?: number }): Promise<QueryResult>;
  close(): void;
}

/** In-process execution on an open connection (tests, :memory: databases). No timeout. */
export function syncExec(db: DatabaseSync): SqlExec {
  return { run: async (sql, opts) => runReadOnly(db, sql, opts), close() { /* caller owns db */ } };
}

// Plain JS so it runs in a worker without the TypeScript loader.
const WORKER_SRC = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(workerData.path, { readOnly: true });
parentPort.on('message', ({ id, sql, rowCap }) => {
  try {
    const stmt = db.prepare(sql);
    const rows = []; let truncated = false;
    for (const row of stmt.iterate()) { if (rows.length >= rowCap) { truncated = true; break; } rows.push(row); }
    const columns = rows[0] ? Object.keys(rows[0]) : stmt.columns().map(c => c.name);
    parentPort.postMessage({ id, result: { ok: true, rows, columns, truncated } });
  } catch (e) {
    parentPort.postMessage({ id, result: { ok: false, error: String(e && e.message || e) } });
  }
});
`;

interface Pending { resolve: (r: QueryResult) => void; timer: NodeJS.Timeout }
interface Slot { worker: Worker; busy: boolean; pending: Pending | null; id: number }

/**
 * A small pool of read-only worker connections. A statement that exceeds `timeoutMs` has its worker
 * terminated (the only way to interrupt a synchronous SQLite call) and replaced; the caller gets an error result.
 */
export function createWorkerExec(dbPath: string, opts: { timeoutMs?: number; poolSize?: number } = {}): SqlExec {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const size = Math.max(1, opts.poolSize ?? 2);
  const queue: { sql: string; rowCap: number; resolve: (r: QueryResult) => void }[] = [];
  const slots: Slot[] = [];
  let closed = false;

  const spawn = (slot: Slot | null): Slot => {
    const worker = new Worker(WORKER_SRC, { eval: true, workerData: { path: dbPath } });
    const s: Slot = slot ?? { worker, busy: false, pending: null, id: 0 };
    s.worker = worker; s.busy = false; s.pending = null;
    worker.on('message', (m: { id: number; result: QueryResult }) => {
      if (!s.pending || m.id !== s.id) return;
      clearTimeout(s.pending.timer);
      const { resolve } = s.pending; s.pending = null; s.busy = false;
      resolve(m.result); pump();
    });
    worker.on('error', (e) => {
      if (s.pending) { clearTimeout(s.pending.timer); const { resolve } = s.pending; s.pending = null; resolve({ ok: false, error: `worker error: ${e.message}` }); }
      if (!closed) spawn(s); pump();
    });
    worker.unref();
    return s;
  };
  for (let i = 0; i < size; i++) slots.push(spawn(null));

  const pump = () => {
    if (closed) return;
    for (const s of slots) {
      if (s.busy || queue.length === 0) continue;
      const job = queue.shift()!;
      s.busy = true; s.id++;
      const id = s.id;
      const timer = setTimeout(() => {
        if (!s.pending || s.id !== id) return;
        const { resolve } = s.pending; s.pending = null;
        void s.worker.terminate();
        spawn(s);
        resolve({ ok: false, error: `statement timeout after ${timeoutMs} ms` });
        pump();
      }, timeoutMs);
      s.pending = { resolve: job.resolve, timer };
      s.worker.postMessage({ id, sql: job.sql, rowCap: job.rowCap });
    }
  };

  return {
    run(sql, o = {}) {
      const guard = isSafeSelect(sql);
      if (guard) return Promise.resolve({ ok: false, error: guard });
      if (closed) return Promise.resolve({ ok: false, error: 'executor closed' });
      return new Promise<QueryResult>(resolve => { queue.push({ sql: sql.trim().replace(/;\s*$/, ''), rowCap: o.rowCap ?? 200, resolve }); pump(); });
    },
    close() { closed = true; for (const s of slots) void s.worker.terminate(); },
  };
}
