import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, createSchema, introspectSchema } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';
import { generateTasks } from '../src/tasks/generate.js';
import { createMockClient } from '../src/llm/mock.js';
import { POLICIES, FLOORS } from '../src/config.js';
import { runEval, type RunRow } from '../src/eval/run.js';
import { percentile, summarize, checkFloors } from '../src/eval/metrics.js';
import { renderMarkdown, renderHtml, appendExperimentLog } from '../src/eval/report.js';

const tiers = { small: 'anthropic/claude-haiku-5.5', large: 'anthropic/claude-sonnet-5.5' };
const row = (over: Partial<RunRow>): RunRow => ({ runId: 'r', policy: 'P0', policyFlags: POLICIES.P0, models: tiers, thresholds: { routerHi: 4, verifyConfidence: 0.75, verifyComplexity: 3, maxRepairs: { small: 1, large: 2 } }, taskId: 'a', templateId: 't', tier: 1, lang: 'en', correct: true, answer: 1, gold: 1, sql: 'SELECT 1', route: 'large', escalated: false, verified: false, verifyReasons: [], verdict: null, corrected: false, verifierRejected: false, tablesSent: [], calls: [], promptTokens: 100, completionTokens: 10, costUsd: 0.01, latencyMs: 1000, repairs: 0, routerScore: 0, error: null, ts: 'now', ...over });

describe('metrics', () => {
  it('percentile is nearest-rank', () => {
    expect(percentile([5, 1, 4, 2, 3], 95)).toBe(5); expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3); expect(percentile([], 50)).toBe(0);
  });
  it('summarize aggregates accuracy, cost per success and rates', () => {
    const s = summarize([row({ correct: true, route: 'small', tier: 1 }), row({ correct: false, route: 'small', tier: 2, escalated: true }), row({ correct: true, tier: 3, verified: true }), row({ correct: false, tier: 3, repairs: 1, error: 'x' })]);
    expect(s.n).toBe(4); expect(s.accuracy).toBeCloseTo(0.5); expect(s.costTotal).toBeCloseTo(0.04); expect(s.costPerTask).toBeCloseTo(0.01); expect(s.costPerSuccess).toBeCloseTo(0.02);
    expect(s.pctSmall).toBeCloseTo(0.5); expect(s.pctEscalated).toBeCloseTo(0.25); expect(s.pctVerified).toBeCloseTo(0.25); expect(s.pctRepaired).toBeCloseTo(0.25); expect(s.errors).toBe(1);
    expect(s.accuracyByTier[1]).toBe(1); expect(s.accuracyByTier[2]).toBe(0); expect(s.accuracyByTier[3]).toBe(0.5);
    expect(s.promptTokensPerTask).toBe(100); expect(s.p95LatencyMs).toBe(1000);
  });
  it('checkFloors applies the configured floors', () => {
    const base = summarize([row({}), row({}), row({}), row({ correct: false })]); // 0.75
    const ok = { ...base, accuracy: base.accuracy - 0.019, p95LatencyMs: base.p95LatencyMs * 1.2 };
    const bad = { ...base, accuracy: base.accuracy - 0.021, p95LatencyMs: base.p95LatencyMs * 1.3 };
    expect(checkFloors(base, ok, FLOORS)).toEqual({ accuracyOk: true, latencyOk: true });
    expect(checkFloors(base, bad, FLOORS)).toEqual({ accuracyOk: false, latencyOk: false });
  });
});

describe('runEval', () => {
  it('scores tasks, writes jsonl, and resumes without duplicates', async () => {
    const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 100, tickets: 10 });
    const schema = introspectSchema(db); const tasks = generateTasks(db, { seed: 1, n: 6, holdout: false, lang: 'en' });
    const byQ = new Map(tasks.map(t => [t.question, t.goldSql]));
    const client = createMockClient((_m, msgs) => JSON.stringify({ sql: byQ.get(msgs.at(-1)!.content) ?? 'SELECT 0', answer_shape: 'list', confidence: 0.9 }));
    const out = join(mkdtempSync(join(tmpdir(), 'lc-')), 'run.jsonl');
    const rows = await runEval({ runId: 'r1', policyName: 'P0', policy: POLICIES.P0, tasks, client, db, schema, tiers, outPath: out, concurrency: 2 });
    expect(rows.length).toBe(6); expect(rows.filter(r => r.correct).length).toBe(6); expect(readFileSync(out, 'utf8').trim().split('\n').length).toBe(6);
    expect(rows[0]).toMatchObject({ policy: 'P0', route: 'large' }); expect(rows.every(r => r.costUsd > 0 && r.promptTokens > 0)).toBe(true);
    const strict = createMockClient(() => { throw new Error('must not be called'); });
    const again = await runEval({ runId: 'r1', policyName: 'P0', policy: POLICIES.P0, tasks, client: strict, db, schema, tiers, outPath: out });
    expect(again.length).toBe(6); expect(strict.calls.length).toBe(0);
  });
  it('rows carry audit fields: sql, per-call records, model ids', async () => {
    const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 100, tickets: 10 });
    const schema = introspectSchema(db); const tasks = generateTasks(db, { seed: 1, n: 3, holdout: false, lang: 'en' });
    const client = createMockClient(() => JSON.stringify({ sql: 'SELECT COUNT(*) FROM customers', answer_shape: 'scalar', confidence: 0.9 }));
    const out = join(mkdtempSync(join(tmpdir(), 'lc-')), 'run.jsonl');
    const rows = await runEval({ runId: 'r3', policyName: 'P0', policy: POLICIES.P0, tasks, client, db, schema, tiers, outPath: out });
    expect(rows[0]!.sql).toBe('SELECT COUNT(*) FROM customers'); expect(rows[0]!.calls.length).toBe(1); expect(rows[0]!.calls[0]!.model).toBe(tiers.large);
    expect(rows[0]!.models).toEqual(tiers); expect(rows[0]!.policyFlags).toEqual(POLICIES.P0); expect(rows[0]!.thresholds.routerHi).toBeGreaterThan(0);
  });
  it('refuses to resume a log written by a different policy, and skips a partial last line', async () => {
    const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 100, tickets: 10 });
    const schema = introspectSchema(db); const tasks = generateTasks(db, { seed: 1, n: 2, holdout: false, lang: 'en' });
    const client = createMockClient(() => JSON.stringify({ sql: 'SELECT 1' }));
    const out = join(mkdtempSync(join(tmpdir(), 'lc-')), 'run.jsonl');
    await runEval({ runId: 'r4', policyName: 'P0', policy: POLICIES.P0, tasks, client, db, schema, tiers, outPath: out });
    await expect(runEval({ runId: 'r4', policyName: 'P3', policy: POLICIES.P3, tasks, client, db, schema, tiers, outPath: out })).rejects.toThrow(/policy/);
    const { appendFileSync } = await import('node:fs'); appendFileSync(out, '{"runId":"r4","taskId":"br');
    const rows = await runEval({ runId: 'r4', policyName: 'P0', policy: POLICIES.P0, tasks, client, db, schema, tiers, outPath: out });
    expect(rows.length).toBe(2);
  });
  it('aborts the whole run on a fatal (billing) client error without writing rows for it', async () => {
    const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 100, tickets: 10 });
    const schema = introspectSchema(db); const tasks = generateTasks(db, { seed: 1, n: 4, holdout: false, lang: 'en' });
    const client = createMockClient(() => { throw Object.assign(new Error('OpenRouter HTTP 402: credits'), { fatal: true }); });
    const out = join(mkdtempSync(join(tmpdir(), 'lc-')), 'run.jsonl');
    await expect(runEval({ runId: 'r5', policyName: 'S', policy: POLICIES.S, tasks, client, db, schema, tiers, outPath: out })).rejects.toThrow(/402/);
    expect(existsSync(out) ? readFileSync(out, 'utf8').trim() : '').toBe('');
  });
  it('refuses to resume a log run with different thresholds or a different used model', async () => {
    const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 100, tickets: 10 });
    const schema = introspectSchema(db); const tasks = generateTasks(db, { seed: 1, n: 2, holdout: false, lang: 'en' });
    const client = createMockClient(() => JSON.stringify({ sql: 'SELECT 1' }));
    const out = join(mkdtempSync(join(tmpdir(), 'lc-')), 'run.jsonl');
    const base = { runId: 'r6', policyName: 'P1', policy: POLICIES.P1, tasks, client, db, schema, tiers, outPath: out };
    await runEval(base);
    await expect(runEval({ ...base, thresholds: { routerHi: 6, verifyConfidence: 0.75, verifyComplexity: 3, maxRepairs: { small: 1, large: 2 } } })).rejects.toThrow(/thresholds/);
    await expect(runEval({ ...base, tiers: { ...tiers, small: 'qwen/qwen3.7-flash' } })).rejects.toThrow(/small=/);
    // P0 does not use the small tier, so a different small model is not a different P0 experiment
    const out2 = join(mkdtempSync(join(tmpdir(), 'lc-')), 'run.jsonl');
    await runEval({ ...base, policyName: 'P0', policy: POLICIES.P0, outPath: out2 });
    expect((await runEval({ ...base, policyName: 'P0', policy: POLICIES.P0, outPath: out2, tiers: { ...tiers, small: 'other' } })).length).toBe(2);
  });
  it('redactRow strips task content but keeps what the report needs', async () => {
    const { redactRow } = await import('../src/eval/run.js');
    const r = redactRow(row({ gold: 42, answer: 42, sql: 'SELECT 42' }));
    expect(r).not.toHaveProperty('gold'); expect(r).not.toHaveProperty('answer'); expect(r).not.toHaveProperty('sql');
    expect(r.redacted).toBe(true); expect(r.correct).toBe(true); expect(r.costUsd).toBe(0.01); expect(r.calls).toEqual([]);
  });
  it('records a client failure as an error row instead of aborting the run', async () => {
    const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 100, tickets: 10 });
    const schema = introspectSchema(db); const tasks = generateTasks(db, { seed: 1, n: 3, holdout: false, lang: 'en' });
    const client = createMockClient(() => { throw new Error('HTTP 500'); });
    const out = join(mkdtempSync(join(tmpdir(), 'lc-')), 'run.jsonl');
    const rows = await runEval({ runId: 'r2', policyName: 'S', policy: POLICIES.S, tasks, client, db, schema, tiers, outPath: out });
    expect(rows.length).toBe(3); expect(rows.every(r => !r.correct && /HTTP 500/.test(r.error ?? ''))).toBe(true);
  });
});

describe('report', () => {
  it('renders markdown with the baseline and floor marks, html, and appends the experiment log once-headed', () => {
    const base = summarize([row({}), row({}), row({ correct: false })]);
    const cand = summarize([row({ route: 'small', costUsd: 0.001 }), row({ route: 'small', costUsd: 0.001 }), row({ correct: false, costUsd: 0.001 })]);
    const md = renderMarkdown([{ name: 'P0', label: 'baseline', s: base }, { name: 'P3', label: 'full', s: cand }], 'P0');
    expect(md).toContain('P0'); expect(md).toMatch(/✅/); expect(md).toMatch(/cost \/ success/i); expect(md).toMatch(/-90%/);
    const html = renderHtml([{ name: 'P0', label: 'baseline', s: base }, { name: 'P3', label: 'full', s: cand }], 'P0');
    expect(html).toContain('<table'); expect(html).toContain('P3');
    const log = join(mkdtempSync(join(tmpdir(), 'lc-')), 'EXPERIMENTS.md');
    appendExperimentLog(log, { runId: 'a', policy: 'P0', taskset: 'dev', n: 3, summary: base, notes: 'first' });
    appendExperimentLog(log, { runId: 'b', policy: 'P3', taskset: 'dev', n: 3, summary: cand, notes: 'second' });
    appendExperimentLog(log, { runId: 'b', policy: 'P3', taskset: 'dev', n: 3, summary: cand, notes: 'duplicate' });
    const text = readFileSync(log, 'utf8');
    expect(existsSync(log)).toBe(true); expect((text.match(/\| run id/gi) ?? []).length).toBe(1); expect(text).toContain('first'); expect(text).toContain('second');
    expect(text).not.toContain('duplicate'); expect((text.match(/^\| b \|/gm) ?? []).length).toBe(1);
  });
});
