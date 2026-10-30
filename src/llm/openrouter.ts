import type { ChatMessage, LlmClient, LlmResponse } from './types.js';
import { estimateCost } from './prices.js';
import { semaphore } from '../util/semaphore.js';

export interface OpenRouterOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

const URL = 'https://openrouter.ai/api/v1/chat/completions';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface CompletionJson {
  id?: string;
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string } | string;
}

export function createOpenRouterClient(o: OpenRouterOptions): LlmClient {
  const f = o.fetchImpl ?? fetch;
  const limit = semaphore(o.concurrency ?? 4);
  const attempts = o.maxAttempts ?? 3;
  const backoff = o.backoffMs ?? 1000;
  const timeoutMs = o.timeoutMs ?? 60_000;

  return {
    chat(model: string, messages: ChatMessage[], opts = {}): Promise<LlmResponse> {
      return limit(async () => {
        let lastErr = '';
        for (let a = 1; a <= attempts; a++) {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), timeoutMs);
          const t0 = performance.now();
          try {
            const res = await f(URL, {
              method: 'POST',
              signal: ctl.signal,
              headers: {
                authorization: `Bearer ${o.apiKey}`,
                'content-type': 'application/json',
                'HTTP-Referer': 'https://github.com/Ahmednsh/humain-less-compute',
                'X-Title': 'humain-less-compute',
              },
              body: JSON.stringify({ model, messages, temperature: 0, max_tokens: opts.maxTokens ?? 800, usage: { include: true } }),
            });
            const latencyMs = performance.now() - t0;
            if (res.status === 429 || res.status >= 500) {
              lastErr = `HTTP ${res.status}`;
              await sleep(backoff * 2 ** (a - 1));
              continue;
            }
            const j = (await res.json()) as CompletionJson;
            if (!res.ok) {
              const msg = typeof j.error === 'string' ? j.error : j.error?.message ?? JSON.stringify(j);
              throw new Error(`OpenRouter HTTP ${res.status}: ${msg}`);
            }
            const u = j.usage ?? {};
            const pt = u.prompt_tokens ?? 0, ct = u.completion_tokens ?? 0;
            return {
              text: j.choices?.[0]?.message?.content ?? '',
              promptTokens: pt,
              completionTokens: ct,
              costUsd: typeof u.cost === 'number' ? u.cost : estimateCost(model, pt, ct),
              latencyMs,
              model: j.model ?? model,
              generationId: j.id,
            };
          } catch (e) {
            if ((e as Error).name === 'AbortError') { lastErr = `timeout after ${timeoutMs} ms`; continue; }
            throw e;
          } finally {
            clearTimeout(timer);
          }
        }
        throw new Error(`OpenRouter failed after ${attempts} attempts: ${lastErr}`);
      });
    },
  };
}
