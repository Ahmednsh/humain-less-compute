import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { isSafeSelect, runReadOnly, type QueryResult } from './db.js';

/** Executes model-written SQL. The pooled variant enforces a wall-clock deadline (spec §3.1/§3.10). */
export interface SqlExec {
  run(sql: string, opts?: { rowCap?: number }): Promise<QueryResult>;
  close(): void;
}

/** In-process execution on an open connection (tests, :memory: databases). No timeout. */
export function syncExec(db: DatabaseSync): SqlExec {
  return { run: async (sql, opts) => runReadOnly(db, sql, opts), close() { /* caller owns db */ } };
}

const WORKER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'sqlworker.cjs');

interface Job { sql: string; rowCap: number; resolve: (r: QueryResult) => void }
interface Slot { child: ChildProcess; busy: boolean; id: number; pending: { resolve: (r: QueryResult) => void; timer: NodeJS.Timeout } | null }

/**
 * A small pool of read-only child processes. A statement that exceeds `timeoutMs` has its process killed
 * (a synchronous SQLite call cannot be interrupted otherwise) and replaced; the caller gets an error result.
 * `close()` resolves every queued or in-flight job with an error and leaves no process behind.
 */
export function createWorkerExec(dbPath: string, opts: { timeoutMs?: number; poolSize?: number } = {}): SqlExec {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const size = Math.max(1, opts.poolSize ?? 2);
  const queue: Job[] = [];
  const slots: Slot[] = [];
  let closed = false;
  let respawns = 0;

  const finish = (s: Slot, result: QueryResult) => {
    if (!s.pending) return;
    clearTimeout(s.pending.timer);
    const { resolve } = s.pending;
    s.pending = null; s.busy = false;
    resolve(result);
  };

  const spawn = (slot: Slot | null): Slot => {
    // execArgv: [] — do not inherit the parent's loader flags (tsx, --input-type); the worker is plain CommonJS.
    const child = fork(WORKER_PATH, [dbPath], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], execArgv: [] });
    const s: Slot = slot ?? { child, busy: false, id: 0, pending: null };
    s.child = child; s.busy = false; s.pending = null;
    child.on('message', (m: { id?: number; result?: QueryResult; ready?: boolean }) => {
      if (m.ready || !m.result || m.id !== s.id) return;
      finish(s, m.result); pump();
    });
    child.on('exit', () => {
      if (closed) return;
      // crashed or killed mid-job: fail that job and replace the process (bounded)
      if (s.pending) finish(s, { ok: false, error: 'sql worker exited unexpectedly' });
      if (respawns++ < 50) spawn(s); else s.busy = true; // retire the slot after too many crashes
      pump();
    });
    child.unref();
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
        if (closed || !s.pending || s.id !== id) return;
        const { resolve } = s.pending; s.pending = null;
        s.child.removeAllListeners('exit');
        s.child.kill('SIGKILL');
        resolve({ ok: false, error: `statement timeout after ${timeoutMs} ms` });
        spawn(s);
        pump();
      }, timeoutMs);
      s.pending = { resolve: job.resolve, timer };
      s.child.send({ id, sql: job.sql, rowCap: job.rowCap });
    }
  };

  return {
    run(sql, o = {}) {
      const guard = isSafeSelect(sql);
      if (guard) return Promise.resolve({ ok: false, error: guard });
      if (closed) return Promise.resolve({ ok: false, error: 'executor closed' });
      return new Promise<QueryResult>(resolve => { queue.push({ sql: sql.trim().replace(/;\s*$/, ''), rowCap: o.rowCap ?? 200, resolve }); pump(); });
    },
    close() {
      if (closed) return;
      closed = true;
      for (const job of queue.splice(0)) job.resolve({ ok: false, error: 'executor closed' });
      for (const s of slots) {
        if (s.pending) finish(s, { ok: false, error: 'executor closed' });
        s.child.removeAllListeners('exit');
        s.child.kill('SIGKILL');
      }
    },
  };
}
