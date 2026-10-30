import { describe, it, expect } from 'vitest';
import { openDb, createSchema, introspectSchema } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';
import { createMockClient } from '../src/llm/mock.js';
import { buildContext } from '../src/agent/context.js';
import { runAttempt, parseModelJson } from '../src/agent/executor.js';

const setup = () => { const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 50, tickets: 10 }); return { db, schema: introspectSchema(db) }; };
const J = (o: unknown) => JSON.stringify(o);

describe('executor', () => {
  it('parses fenced json', () => {
    expect(parseModelJson('Here you go:\n```json\n{"sql":"SELECT 1","answer_shape":"scalar","confidence":0.9}\n```')).toMatchObject({ sql: 'SELECT 1', confidence: 0.9 });
    expect(parseModelJson('{"sql":"SELECT 1"}')).toMatchObject({ sql: 'SELECT 1', answer_shape: 'scalar', confidence: 0.5 });
    expect(parseModelJson('{"sql":"SELECT 1","confidence":7}')).toMatchObject({ confidence: 1 });
    expect(parseModelJson('no json here')).toBeNull();
    expect(parseModelJson('{"answer_shape":"list"}')).toBeNull();
  });
  it('runs sql and extracts the answer', async () => {
    const { db, schema } = setup();
    const client = createMockClient(() => J({ sql: 'SELECT COUNT(*) FROM customers', answer_shape: 'scalar', confidence: 0.95 }));
    const r = await runAttempt({ client, model: 'm', tier: 'small', db, question: 'How many customers?', ctx: buildContext('How many customers?', schema, 'pruned'), maxRepairs: 1 });
    expect(r.answer).toBe(20); expect(r.error).toBeNull(); expect(r.repairs).toBe(0);
    expect(r.calls.length).toBe(1); expect(r.calls[0]!.purpose).toBe('generate'); expect(r.confidence).toBe(0.95); expect(r.sql).toBe('SELECT COUNT(*) FROM customers');
    const sys = client.calls[0]!.messages[0]!.content;
    expect(sys).toContain('CREATE TABLE customers'); expect(sys).not.toContain('CREATE TABLE payments');
  });
  it('repairs after an sql error and feeds the error back', async () => {
    const { db, schema } = setup(); let n = 0;
    const client = createMockClient((_m, msgs) => {
      if (++n === 1) return J({ sql: 'SELECT nope FROM customers' });
      expect(msgs.at(-1)!.content).toMatch(/no such column/); return J({ sql: 'SELECT COUNT(*) FROM customers' });
    });
    const r = await runAttempt({ client, model: 'm', tier: 'large', db, question: 'q', ctx: buildContext('q', schema, 'full'), maxRepairs: 2 });
    expect(r.answer).toBe(20); expect(r.repairs).toBe(1); expect(r.calls.map(c => c.purpose)).toEqual(['generate', 'repair']);
  });
  it('gives up after maxRepairs and reports the error without touching the data', async () => {
    const { db, schema } = setup(); const client = createMockClient(() => J({ sql: 'DELETE FROM customers' }));
    const r = await runAttempt({ client, model: 'm', tier: 'small', db, question: 'q', ctx: buildContext('q', schema, 'pruned'), maxRepairs: 1 });
    expect(r.answer).toBeNull(); expect(r.error).toMatch(/only SELECT/); expect(r.calls.length).toBe(2);
    expect((db.prepare('SELECT COUNT(*) c FROM customers').get() as { c: number }).c).toBe(20);
  });
  it('treats unparseable output as a repair', async () => {
    const { db, schema } = setup(); let n = 0; const client = createMockClient(() => (++n === 1 ? 'garbage' : J({ sql: 'SELECT 1' })));
    const r = await runAttempt({ client, model: 'm', tier: 'small', db, question: 'q', ctx: buildContext('q', schema, 'pruned'), maxRepairs: 1 });
    expect(r.answer).toBe(1); expect(r.repairs).toBe(1);
  });
  it('retries once on an empty result when budget remains', async () => {
    const { db, schema } = setup(); let n = 0;
    const client = createMockClient(() => (++n === 1 ? J({ sql: "SELECT name FROM customers WHERE segment = 'nope'" }) : J({ sql: 'SELECT COUNT(*) FROM customers' })));
    const r = await runAttempt({ client, model: 'm', tier: 'small', db, question: 'q', ctx: buildContext('q', schema, 'pruned'), maxRepairs: 1 });
    expect(r.answer).toBe(20); expect(r.repairs).toBe(1);
  });
  it('sums tokens and cost over all calls', async () => {
    const { db, schema } = setup(); let n = 0;
    const client = createMockClient(() => ({ text: ++n === 1 ? 'x' : J({ sql: 'SELECT 1' }), promptTokens: 100, completionTokens: 10 }));
    const r = await runAttempt({ client, model: 'anthropic/claude-haiku-5.5', tier: 'small', db, question: 'q', ctx: buildContext('q', schema, 'pruned'), maxRepairs: 1 });
    expect(r.calls.reduce((s, c) => s + c.promptTokens, 0)).toBe(200);
    expect(r.calls.reduce((s, c) => s + c.costUsd, 0)).toBeCloseTo(2 * (100 * 0.1e-6 + 10 * 0.5e-6), 12);
  });
});
