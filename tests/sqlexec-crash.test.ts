import { describe, it, expect, vi, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';

// Wrap the real fork so the test can reach the worker processes the executor spawns.
const spawned = vi.hoisted(() => [] as unknown[]);
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  return { ...real, fork: (...a: Parameters<typeof real.fork>) => { const c = real.fork(...a); spawned.push(c); return c; } };
});

const { openDb, createSchema } = await import('../src/data/db.js');
const { createWorkerExec } = await import('../src/data/sqlexec.js');

const dir = mkdtempSync(join(tmpdir(), 'lc-sqlcrash-'));
const path = join(dir, 'x.sqlite');
{ const db = openDb(path); createSchema(db); db.exec("INSERT INTO regions(name) VALUES ('a')"); db.close(); }
const RUNAWAY = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c';
const children = () => spawned as ChildProcess[];
const ex = createWorkerExec(path, { timeoutMs: 10_000, poolSize: 1 });
afterAll(() => ex.close());

describe('sql worker crashes', () => {
  it('a worker that dies mid-statement fails that job and is replaced', async () => {
    const before = children().length;
    const job = ex.run(RUNAWAY);
    await new Promise(r => setTimeout(r, 150));
    children().at(-1)!.kill('SIGKILL');
    const r = await job;
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/exited/);
    const again = await ex.run('SELECT COUNT(*) AS n FROM regions');
    expect(again.ok && again.rows[0]).toEqual({ n: 1 });
    expect(children().length).toBe(before + 1);
  });
  it("an 'error' event on the worker fails the in-flight job instead of crashing the process", async () => {
    const job = ex.run(RUNAWAY);
    await new Promise(r => setTimeout(r, 150));
    const child = children().at(-1)!;
    expect(() => child.emit('error', new Error('ERR_IPC_CHANNEL_CLOSED'))).not.toThrow();
    child.kill('SIGKILL'); // the real runaway statement is still running in it
    const r = await job;
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/worker error|exited/);
    expect((await ex.run('SELECT 1 AS one')).ok).toBe(true);
  });
});
