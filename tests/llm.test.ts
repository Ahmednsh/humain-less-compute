import { describe, it, expect } from 'vitest';
import { createOpenRouterClient } from '../src/llm/openrouter.js';
import { createMockClient } from '../src/llm/mock.js';
import { estimateCost } from '../src/llm/prices.js';

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
type FetchLike = typeof fetch;

describe('openrouter client', () => {
  it('sends temperature 0 and usage.include, parses usage and cost', async () => {
    let seen: Record<string, unknown> = {};
    const fetchImpl: FetchLike = async (_u, init) => { seen = JSON.parse(String(init?.body)); return ok({ id: 'gen-1', model: 'm', choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.0001 } }); };
    const c = createOpenRouterClient({ apiKey: 'k', fetchImpl });
    const r = await c.chat('m', [{ role: 'user', content: 'x' }]);
    expect(seen.temperature).toBe(0); expect(seen.usage).toEqual({ include: true }); expect(seen.model).toBe('m');
    expect(r).toMatchObject({ text: 'hi', promptTokens: 10, completionTokens: 2, costUsd: 0.0001, generationId: 'gen-1', model: 'm' });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it('falls back to the price table when cost is missing', async () => {
    const fetchImpl: FetchLike = async () => ok({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });
    const r = await createOpenRouterClient({ apiKey: 'k', fetchImpl }).chat('anthropic/claude-haiku-5.5', []);
    expect(r.costUsd).toBeCloseTo(0.0001 + 0.00005, 9);
  });
  it('retries on 429 then succeeds, gives up after maxAttempts', async () => {
    let n = 0;
    const fetchImpl: FetchLike = async () => (++n < 3 ? ok({ error: 'rate' }, 429) : ok({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.00001 } }));
    const r = await createOpenRouterClient({ apiKey: 'k', fetchImpl, maxAttempts: 3, backoffMs: 1 }).chat('m', []);
    expect(r.text).toBe('ok'); expect(n).toBe(3);
    const bad: FetchLike = async () => ok({}, 500);
    await expect(createOpenRouterClient({ apiKey: 'k', fetchImpl: bad, maxAttempts: 2, backoffMs: 1 }).chat('m', [])).rejects.toThrow(/500/);
  });
  it('retries transient network and body-parse errors with the same backoff', async () => {
    let n = 0;
    const fetchImpl: FetchLike = async () => { n++; if (n === 1) throw new TypeError('fetch failed'); if (n === 2) return new Response('<html>502</html>', { status: 200, headers: { 'content-type': 'text/html' } }); return ok({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }); };
    const r = await createOpenRouterClient({ apiKey: 'k', fetchImpl, backoffMs: 1 }).chat('anthropic/claude-haiku-5.5', []);
    expect(r.text).toBe('ok'); expect(n).toBe(3);
  });
  it('records finish_reason and reasoning tokens, asks for reasoning off and a generous max_tokens', async () => {
    let seen: Record<string, unknown> = {};
    const fetchImpl: FetchLike = async (_u, init) => { seen = JSON.parse(String(init?.body)); return ok({ choices: [{ message: { content: 'x' }, finish_reason: 'length' }], usage: { prompt_tokens: 5, completion_tokens: 900, completion_tokens_details: { reasoning_tokens: 880 }, cost: 0.001 } }); };
    const r = await createOpenRouterClient({ apiKey: 'k', fetchImpl }).chat('m', []);
    expect(r.finishReason).toBe('length'); expect(r.reasoningTokens).toBe(880);
    expect(seen.reasoning).toEqual({ enabled: false }); expect(seen.max_tokens).toBeGreaterThanOrEqual(1500);
  });
  it('fails loudly instead of recording zero cost for an unpriced model without usage.cost', async () => {
    const fetchImpl: FetchLike = async () => ok({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 10, completion_tokens: 1 } });
    await expect(createOpenRouterClient({ apiKey: 'k', fetchImpl }).chat('vendor/unknown-model', [])).rejects.toThrow(/cost/i);
  });
  it('does not retry a 400 and surfaces the body', async () => {
    let n = 0; const fetchImpl: FetchLike = async () => { n++; return ok({ error: { message: 'bad model' } }, 400); };
    await expect(createOpenRouterClient({ apiKey: 'k', fetchImpl, backoffMs: 1 }).chat('m', [])).rejects.toThrow(/400.*bad model/);
    expect(n).toBe(1);
  });
  it('limits concurrency', async () => {
    let active = 0, peak = 0;
    const fetchImpl: FetchLike = async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return ok({ choices: [{ message: { content: 'x' } }], usage: { cost: 0 } }); };
    const c = createOpenRouterClient({ apiKey: 'k', fetchImpl, concurrency: 2 });
    await Promise.all([1, 2, 3, 4, 5].map(() => c.chat('m', [])));
    expect(peak).toBe(2);
  });
  it('mock client records calls and prices them', async () => {
    const m = createMockClient(() => ({ text: 'y', promptTokens: 100, completionTokens: 10 }));
    const r = await m.chat('anthropic/claude-sonnet-5.5', [{ role: 'user', content: 'q' }]);
    expect(m.calls.length).toBe(1); expect(m.calls[0]!.messages[0]!.content).toBe('q');
    expect(r.costUsd).toBeCloseTo(estimateCost('anthropic/claude-sonnet-5.5', 100, 10), 12);
    expect(estimateCost('anthropic/claude-sonnet-5.5', 1_000_000, 0)).toBeCloseTo(2, 9);
  });
});
