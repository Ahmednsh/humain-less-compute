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
const row = (over: Partial<RunRow>): RunRow => ({ runId: 'r', policy: 'P0', taskId: 'a', templateId: 't', tier: 1, lang: 'en', correct: true, answer: 1, gold: 1, route: 'large', escalated: false, verified: false, verifyReasons: [], verdict: null, corrected: false, tablesSent: [], promptTokens: 100, completionTokens: 10, costUsd: 0.01, latencyMs: 1000, repairs: 0, routerScore: 0, error: null, ts: 'now', ...over });

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
    const text = readFileSync(log, 'utf8');
    expect(existsSync(log)).toBe(true); expect((text.match(/\| run id/gi) ?? []).length).toBe(1); expect(text).toContain('first'); expect(text).toContain('second');
  });
});
