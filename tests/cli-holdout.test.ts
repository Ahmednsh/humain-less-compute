import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDb, createSchema } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';
import { generateTasks } from '../src/tasks/generate.js';
import { isInsideRepo } from '../src/util/args.js';

// The OS temp directory stands in for the real held-out location: anywhere outside the repository.
const outside = mkdtempSync(join(tmpdir(), 'lc-holdout-'));
const dbPath = join(outside, 'company.sqlite');
const tasksPath = join(outside, 'holdout.jsonl');
{
  const db = openDb(dbPath); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 100, tickets: 10 });
  const tasks = generateTasks(db, { seed: 1, n: 4, holdout: true, lang: 'en' }); db.close();
  writeFileSync(tasksPath, tasks.map(t => JSON.stringify(t)).join('\n') + '\n');
}
const repoCopy = resolve('results/runs', `test-holdout-${process.pid}.jsonl`);
afterAll(() => { rmSync(repoCopy, { force: true }); rmSync(outside, { recursive: true, force: true }); });

describe('eval on a task file outside the repository (held-out protocol)', () => {
  it('keeps the full log beside the tasks, writes only a redacted copy into the repo, prints no task content', () => {
    expect(isInsideRepo(tasksPath, resolve('.'))).toBe(false);
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'eval', '--policy', 'P0', '--tasks', tasksPath, '--db', dbPath, '--mock', '--out', repoCopy], { cwd: resolve('.'), encoding: 'utf8', timeout: 60_000 });

    const full = join(outside, 'runs', basename(repoCopy));
    expect(existsSync(full)).toBe(true);
    const fullRows = readFileSync(full, 'utf8').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>);
    expect(fullRows.length).toBe(4); expect(fullRows[0]).toHaveProperty('gold'); expect(fullRows[0]).toHaveProperty('sql');

    const redacted = readFileSync(repoCopy, 'utf8').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>);
    expect(redacted.length).toBe(4);
    for (const r of redacted) {
      expect(r.redacted).toBe(true);
      expect(r).not.toHaveProperty('gold'); expect(r).not.toHaveProperty('answer'); expect(r).not.toHaveProperty('sql');
      expect(typeof r.correct).toBe('boolean'); expect(typeof r.costUsd).toBe('number');
    }

    const tasks = readFileSync(tasksPath, 'utf8').trim().split('\n').map(l => JSON.parse(l) as { question: string; goldSql: string });
    for (const t of tasks) { expect(stdout).not.toContain(t.question); expect(stdout).not.toContain(t.goldSql); }
    expect(stdout).toMatch(/redacted copy/);
  });
});
