import type { ChatMessage, LlmClient, LlmResponse } from './types.js';
import { estimateCost } from './prices.js';

export type MockScript = (model: string, messages: ChatMessage[]) => string | { text: string; promptTokens?: number; completionTokens?: number };

export interface MockClient extends LlmClient { calls: { model: string; messages: ChatMessage[] }[] }

/** Scripted client for tests and the zero-cost smoke eval. Cost comes from the price table. */
export function createMockClient(script: MockScript): MockClient {
  const calls: MockClient['calls'] = [];
  return {
    calls,
    async chat(model, messages): Promise<LlmResponse> {
      calls.push({ model, messages });
      const out = script(model, messages);
      const r = typeof out === 'string' ? { text: out } : out;
      const promptTokens = r.promptTokens ?? Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4);
      const completionTokens = r.completionTokens ?? Math.ceil(r.text.length / 4);
      return { text: r.text, promptTokens, completionTokens, costUsd: estimateCost(model, promptTokens, completionTokens), latencyMs: 1, model };
    },
  };
}
