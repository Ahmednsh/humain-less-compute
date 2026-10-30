import { describe, it, expect } from 'vitest';
import { openDb, createSchema, introspectSchema } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';
import { createMockClient } from '../src/llm/mock.js';
import { runTask } from '../src/agent/controller.js';
import { POLICIES, THRESHOLDS } from '../src/config.js';
import type { ChatMessage } from '../src/llm/types.js';

const setup = () => { const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 50, tickets: 10 }); return { db, schema: introspectSchema(db) }; };
const tiers = { small: 'anthropic/claude-haiku-5.5', large: 'anthropic/claude-sonnet-5.5' };
const J = (o: unknown) => JSON.stringify(o);
const GOOD = J({ sql: 'SELECT COUNT(*) FROM customers', answer_shape: 'scalar', confidence: 0.95 });
const isVerify = (msgs: ChatMessage[]) => msgs.length === 1 && msgs[0]!.content.includes('SQL under review');
const easy = 'How many customers are in the wholesale segment?';
const hard = 'Which region had the highest year-over-year growth in delivered revenue from 2024 to 2025?';
const money = 'What was the total delivered revenue in Asir in 2025?';

describe('controller', () => {
  it('P0 uses the large model once with the full schema and no verification', async () => {
    const { db, schema } = setup(); const client = createMockClient(() => GOOD);
    const o = await runTask({ task: { id: 't', question: easy }, policy: POLICIES.P0, client, db, schema, tiers });
    expect(o.answer).toBe(20); expect(o.route).toBe('large'); expect(client.calls.map(c => c.model)).toEqual([tiers.large]);
    expect(o.verified).toBe(false); expect(o.escalated).toBe(false); expect(o.tablesSent.length).toBe(12); expect(o.calls.length).toBe(1);
  });
  it('P3 answers an easy question with the small model, pruned context, no verification', async () => {
    const { db, schema } = setup(); const client = createMockClient(() => GOOD);
    const o = await runTask({ task: { id: 't', question: easy }, policy: POLICIES.P3, client, db, schema, tiers });
    expect(o.route).toBe('small'); expect(client.calls.map(c => c.model)).toEqual([tiers.small]);
    expect(o.verified).toBe(false); expect(o.tablesSent).toEqual(['customers']); expect(o.answer).toBe(20); expect(o.routerScore).toBeLessThan(THRESHOLDS.routerHi);
  });
  it('P3 sends a hard question straight to the large model and verifies it', async () => {
    const { db, schema } = setup();
    const client = createMockClient((_m, msgs) => (isVerify(msgs) ? J({ verdict: 'correct', corrected_sql: null }) : GOOD));
    const o = await runTask({ task: { id: 't', question: hard }, policy: POLICIES.P3, client, db, schema, tiers });
    expect(o.route).toBe('large'); expect(o.verified).toBe(true); expect(o.verdict).toBe('correct'); expect(o.escalated).toBe(false);
    expect(client.calls.map(c => c.model)).toEqual([tiers.large, tiers.large]);
  });
  it('P3 escalates when the small model keeps failing and sums cost over all calls', async () => {
    const { db, schema } = setup();
    const client = createMockClient((m, msgs) => (isVerify(msgs) ? J({ verdict: 'correct' }) : m === tiers.small ? J({ sql: 'SELECT nope FROM customers' }) : GOOD));
    const o = await runTask({ task: { id: 't', question: easy }, policy: POLICIES.P3, client, db, schema, tiers });
    expect(o.escalated).toBe(true); expect(o.answer).toBe(20); expect(o.attempts.map(a => a.tier)).toEqual(['small', 'large']);
    expect(client.calls.map(c => c.model)).toEqual([tiers.small, tiers.small, tiers.large]);
    expect(o.costUsd).toBeCloseTo(o.calls.reduce((s, c) => s + c.costUsd, 0), 12); expect(o.calls.length).toBe(3);
  });
  it('P3 verifies a money question and applies a correction from the verifier', async () => {
    const { db, schema } = setup();
    const client = createMockClient((_m, msgs) => (isVerify(msgs) ? J({ verdict: 'incorrect', corrected_sql: 'SELECT COUNT(*) FROM products' }) : GOOD));
    const o = await runTask({ task: { id: 't', question: money }, policy: POLICIES.P3, client, db, schema, tiers });
    expect(o.verified).toBe(true); expect(o.verifyReasons).toContain('money'); expect(o.verdict).toBe('incorrect'); expect(o.corrected).toBe(true); expect(o.answer).toBe(10);
    expect(o.calls.filter(c => c.purpose === 'verify').length).toBe(1); expect(o.calls.filter(c => c.purpose === 'verify')[0]!.model).toBe(tiers.large);
  });
  it('P3 escalates when the small answer is rejected without a usable correction', async () => {
    const { db, schema } = setup();
    const client = createMockClient((m, msgs) => (isVerify(msgs) ? J({ verdict: 'incorrect', corrected_sql: null }) : m === tiers.small ? J({ sql: 'SELECT COUNT(*) FROM products', confidence: 0.5 }) : GOOD));
    const o = await runTask({ task: { id: 't', question: easy }, policy: POLICIES.P3, client, db, schema, tiers });
    expect(o.escalated).toBe(true); expect(o.answer).toBe(20); expect(o.attempts.length).toBe(2);
  });
  it('V verifies every task, S never escalates', async () => {
    const { db, schema } = setup();
    const v = createMockClient((_m, msgs) => (isVerify(msgs) ? J({ verdict: 'correct' }) : GOOD));
    expect((await runTask({ task: { id: 't', question: easy }, policy: POLICIES.V, client: v, db, schema, tiers })).verified).toBe(true);
    const s = createMockClient(() => J({ sql: 'SELECT nope FROM x' }));
    const o = await runTask({ task: { id: 't', question: easy }, policy: POLICIES.S, client: s, db, schema, tiers });
    expect(o.escalated).toBe(false); expect(o.answer).toBeNull(); expect(o.error).toMatch(/no such/); expect(s.calls.every(c => c.model === tiers.small)).toBe(true);
  });
  it('keeps the cost of paid calls when a later call throws, and never throws itself', async () => {
    const { db, schema } = setup(); let n = 0;
    const client = createMockClient((_m, msgs) => { if (isVerify(msgs)) throw new Error('OpenRouter failed after 3 attempts: HTTP 502'); n++; return GOOD; });
    const o = await runTask({ task: { id: 't', question: money }, policy: POLICIES.P3, client, db, schema, tiers });
    expect(n).toBe(1); expect(o.answer).toBeNull(); expect(o.error).toMatch(/client failure.*502/);
    expect(o.calls.length).toBe(1); expect(o.costUsd).toBeGreaterThan(0); expect(o.promptTokens).toBeGreaterThan(0);
  });
  it('on the large tier a verifier rejection without a correction keeps the original answer and is flagged', async () => {
    const { db, schema } = setup();
    const client = createMockClient((_m, msgs) => (isVerify(msgs) ? J({ verdict: 'incorrect', corrected_sql: null, reason: 'doubt' }) : GOOD));
    const o = await runTask({ task: { id: 't', question: hard }, policy: POLICIES.V, client, db, schema, tiers });
    expect(o.route).toBe('large'); expect(o.answer).toBe(20); expect(o.verdict).toBe('incorrect'); expect(o.verifierRejected).toBe(true); expect(o.escalated).toBe(false); expect(o.error).toBeNull();
  });
  it('records an unparseable verifier reply as such and keeps the answer', async () => {
    const { db, schema } = setup();
    const client = createMockClient((_m, msgs) => (isVerify(msgs) ? 'I am not sure' : GOOD));
    const o = await runTask({ task: { id: 't', question: hard }, policy: POLICIES.V, client, db, schema, tiers });
    expect(o.answer).toBe(20); expect(o.verdict).toBe('unparseable'); expect(o.verifierRejected).toBe(false); expect(o.sql).toBe('SELECT COUNT(*) FROM customers');
  });
  it('never leaks tier or gold to the model', async () => {
    const { db, schema } = setup(); const client = createMockClient(() => GOOD);
    await runTask({ task: { id: 't', question: easy, tier: 1, gold: 20 } as never, policy: POLICIES.P3, client, db, schema, tiers });
    for (const c of client.calls) for (const m of c.messages) { expect(m.content).not.toMatch(/"tier"|gold/i); }
  });
});
