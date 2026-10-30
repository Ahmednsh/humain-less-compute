import { describe, it, expect } from 'vitest';
import { openDb, createSchema, introspectSchema } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';
import { createMockClient } from '../src/llm/mock.js';
import { buildContext } from '../src/agent/context.js';
import { freeChecks, sqlComplexity, shouldVerify, llmVerify, applyCorrection } from '../src/agent/verifier.js';
import { THRESHOLDS } from '../src/config.js';
import { syncExec } from '../src/data/sqlexec.js';
import type { AttemptResult } from '../src/agent/trace.js';

const setup = () => { const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 50, tickets: 10 }); return { db, schema: introspectSchema(db) }; };
const attempt = (over: Partial<AttemptResult>): AttemptResult => ({ tier: 'small', sql: 'SELECT 1', answerShape: 'scalar', confidence: 0.9, rows: [{ n: 1 }], answer: 1, error: null, repairs: 0, calls: [], ...over });

describe('verifier', () => {
  it('sqlComplexity counts joins, subselects, windows and ctes', () => {
    expect(sqlComplexity('SELECT 1')).toBe(0);
    expect(sqlComplexity('SELECT a FROM x JOIN y ON 1 JOIN z ON 1')).toBe(2);
    // cte 1 + its parenthesised body 1 + scalar subselect 1 + window 1 + join 1
    expect(sqlComplexity('WITH t AS (SELECT 1) SELECT (SELECT 2), ROW_NUMBER() OVER (ORDER BY 1) FROM t JOIN u ON 1')).toBe(5);
  });
  it('shouldVerify triggers on low confidence, complexity or money', () => {
    const T = THRESHOLDS;
    expect(shouldVerify({ confidence: 0.6, sql: 'SELECT 1', money: false, thresholds: T })).toEqual({ verify: true, reasons: ['low_confidence'] });
    expect(shouldVerify({ confidence: 0.95, sql: 'SELECT a FROM a JOIN b ON 1 JOIN c ON 1 JOIN d ON 1', money: false, thresholds: T }).reasons).toEqual(['complex_sql']);
    expect(shouldVerify({ confidence: 0.95, sql: 'SELECT 1', money: true, thresholds: T }).reasons).toEqual(['money']);
    expect(shouldVerify({ confidence: 0.95, sql: 'SELECT a FROM a JOIN b ON 1', money: false, thresholds: T })).toEqual({ verify: false, reasons: [] });
  });
  it('freeChecks flags errors, empties and shape mismatches', () => {
    expect(freeChecks(attempt({}), 'How many?')).toEqual({ ok: true, reason: null });
    expect(freeChecks(attempt({ error: 'boom', answer: null }), 'q').ok).toBe(false);
    expect(freeChecks(attempt({ rows: [], answer: null }), 'q').reason).toMatch(/empty/);
    expect(freeChecks(attempt({ answerShape: 'scalar', rows: [{ n: 1 }, { n: 2 }] }), 'q').reason).toMatch(/scalar/);
    expect(freeChecks(attempt({ answerShape: 'scalar', rows: [{ n: 1 }, { n: 1 }] }), 'q').ok).toBe(true);
    expect(freeChecks(attempt({ answer: -3, rows: [{ n: -3 }] }), 'How many orders?').reason).toMatch(/negative/);
    expect(freeChecks(attempt({ answer: -3, rows: [{ n: -3 }] }), 'What is the growth?').ok).toBe(true);
  });
  it('llmVerify returns the verdict and a correction that can be applied', async () => {
    const { db, schema } = setup();
    const client = createMockClient(() => JSON.stringify({ verdict: 'incorrect', corrected_sql: 'SELECT COUNT(*) FROM customers', reason: 'wrong table' }));
    const v = await llmVerify({ client, model: 'm', question: 'How many customers?', ctx: buildContext('How many customers?', schema, 'pruned'), sql: 'SELECT COUNT(*) FROM products', rows: [{ c: 10 }] });
    expect(v.verdict).toBe('incorrect'); expect(v.correctedSql).toBe('SELECT COUNT(*) FROM customers'); expect(v.call.purpose).toBe('verify');
    const prompt = client.calls[0]!.messages.at(-1)!.content; expect(prompt).toContain('SELECT COUNT(*) FROM products'); expect(prompt).toContain('How many customers?');
    const fixed = await applyCorrection(syncExec(db), v.correctedSql!, 'scalar');
    expect(fixed.ok && fixed.answer).toBe(20);
    expect((await applyCorrection(syncExec(db), 'DELETE FROM customers', 'scalar')).ok).toBe(false);
  });
  it('llmVerify reports unparseable output distinctly and still records the call', async () => {
    const { schema } = setup(); const client = createMockClient(() => 'hmm');
    const v = await llmVerify({ client, model: 'm', question: 'q', ctx: buildContext('q', schema, 'pruned'), sql: 'SELECT 1', rows: [] });
    expect(v.verdict).toBe('unparseable'); expect(v.correctedSql).toBeNull(); expect(v.call.purpose).toBe('verify');
  });
});
