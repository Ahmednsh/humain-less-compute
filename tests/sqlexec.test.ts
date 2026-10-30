import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, createSchema } from '../src/data/db.js';
import { createWorkerExec, syncExec } from '../src/data/sqlexec.js';

const dir = mkdtempSync(join(tmpdir(), 'lc-sql-'));
const path = join(dir, 'x.sqlite');
{ const db = openDb(path); createSchema(db); db.exec("INSERT INTO regions(name) VALUES ('a'),('b')"); db.close(); }
const exec = createWorkerExec(path, { timeoutMs: 300, poolSize: 2 });
afterAll(() => exec.close());

describe('sql exec with timeout', () => {
  it('runs queries off the main thread with the same result shape', async () => {
    const r = await exec.run('SELECT name FROM regions ORDER BY id');
    expect(r.ok && r.rows).toEqual([{ name: 'a' }, { name: 'b' }]);
    expect((await exec.run('DELETE FROM regions')).ok).toBe(false);
    expect((await exec.run('SELECT nope FROM regions')).ok).toBe(false);
  });
  it('aborts a runaway statement at the deadline and keeps serving afterwards', async () => {
    const t0 = Date.now();
    const r = await exec.run('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c');
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/timeout/);
    expect(Date.now() - t0).toBeLessThan(5000);
    const again = await exec.run('SELECT COUNT(*) AS n FROM regions');
    expect(again.ok && again.rows[0]).toEqual({ n: 2 });
  });
  it('syncExec wraps an open connection for tests', async () => {
    const db = openDb(':memory:'); createSchema(db);
    expect((await syncExec(db).run('SELECT 1 AS one')).ok).toBe(true);
  });
});
