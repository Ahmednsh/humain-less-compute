import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDb, createSchema } from '../src/data/db.js';
import { createWorkerExec, syncExec } from '../src/data/sqlexec.js';

const dir = mkdtempSync(join(tmpdir(), 'lc-sql-'));
const path = join(dir, 'x.sqlite');
{ const db = openDb(path); createSchema(db); db.exec("INSERT INTO regions(name) VALUES ('a'),('b')"); db.close(); }
const exec = createWorkerExec(path, { timeoutMs: 300, poolSize: 2 });
afterAll(() => exec.close());
const RUNAWAY = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c';

describe('sql exec with timeout', () => {
  it('runs queries out of process with the same result shape', async () => {
    const r = await exec.run('SELECT name FROM regions ORDER BY id');
    expect(r.ok && r.rows).toEqual([{ name: 'a' }, { name: 'b' }]);
    expect((await exec.run('DELETE FROM regions')).ok).toBe(false);
    expect((await exec.run('SELECT nope FROM regions')).ok).toBe(false);
  });
  it('kills a runaway statement at the deadline and keeps serving afterwards', async () => {
    const t0 = Date.now();
    const r = await exec.run(RUNAWAY);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/timeout/);
    expect(Date.now() - t0).toBeLessThan(5000);
    const again = await exec.run('SELECT COUNT(*) AS n FROM regions');
    expect(again.ok && again.rows[0]).toEqual({ n: 2 });
  });
  it('close() resolves queued and in-flight jobs and leaves nothing running', async () => {
    const ex = createWorkerExec(path, { timeoutMs: 5000, poolSize: 1 });
    const inflight = ex.run(RUNAWAY);
    const queued = ex.run('SELECT 1 AS one');
    await new Promise(r => setTimeout(r, 100));
    ex.close();
    const [a, b] = await Promise.all([inflight, queued]);
    expect(a.ok).toBe(false); expect(b.ok).toBe(false);
    if (!a.ok) expect(a.error).toMatch(/closed/);
    expect((await ex.run('SELECT 1')).ok).toBe(false);
  });
  it('a node process can exit after a timed-out statement (the worker is a killable child process)', () => {
    const script = `
      import { createWorkerExec } from ${JSON.stringify(new URL('../src/data/sqlexec.ts', import.meta.url).href)};
      const ex = createWorkerExec(${JSON.stringify(path)}, { timeoutMs: 200, poolSize: 1 });
      const r = await ex.run(${JSON.stringify(RUNAWAY)});
      ex.close();
      console.log(r.ok ? 'ok?!' : r.error);
    `;
    const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: join(import.meta.dirname, '..'), timeout: 15000, encoding: 'utf8' });
    expect(out).toMatch(/timeout/);
  });
  it('syncExec wraps an open connection for tests', async () => {
    const db = openDb(':memory:'); createSchema(db);
    expect((await syncExec(db).run('SELECT 1 AS one')).ok).toBe(true);
  });
});
