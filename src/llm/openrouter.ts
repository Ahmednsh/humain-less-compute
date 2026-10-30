import type { ChatMessage, LlmClient, LlmResponse } from './types.js';
import { PRICES, estimateCost } from './prices.js';
import { semaphore } from '../util/semaphore.js';

export interface OpenRouterOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
  maxTokens?: number;
  /** OpenRouter unified reasoning effort. Claude 5.5 models refuse `enabled: false` ("Reasoning is mandatory"), so the default is the cheapest allowed level. */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
}

const URL = 'https://openrouter.ai/api/v1/chat/completions';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface CompletionJson {
  id?: string;
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  error?: { message?: string } | string;
}

class Transient extends Error {}

export function createOpenRouterClient(o: OpenRouterOptions): LlmClient {
  const f = o.fetchImpl ?? fetch;
  const limit = semaphore(o.concurrency ?? 4);
  const attempts = o.maxAttempts ?? 3;
  const backoff = o.backoffMs ?? 1000;
  const timeoutMs = o.timeoutMs ?? 60_000;
  const maxTokens = o.maxTokens ?? 1500;
  const effort = o.reasoningEffort ?? (process.env.REASONING_EFFORT as OpenRouterOptions['reasoningEffort']) ?? 'low';
  const reasoning = effort === 'none' ? { enabled: false } : { effort };

  const once = async (model: string, messages: ChatMessage[]): Promise<LlmResponse> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const t0 = performance.now();
    try {
      let res: Response;
      try {
        res = await f(URL, {
          method: 'POST',
          signal: ctl.signal,
          headers: {
            authorization: `Bearer ${o.apiKey}`,
            'content-type': 'application/json',
            'HTTP-Referer': 'https://github.com/Ahmednsh/humain-less-compute',
            'X-Title': 'humain-less-compute',
          },
          // hidden reasoning tokens are billed and drawn from max_tokens; keep effort low and record them (reasoningTokens)
          body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens, usage: { include: true }, reasoning }),
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw new Transient(`timeout after ${timeoutMs} ms`);
        throw new Transient(`network: ${(e as Error).message}`); // ECONNRESET, fetch failed, ...
      }
      if (res.status === 429 || res.status >= 500) throw new Transient(`HTTP ${res.status}`);
      let j: CompletionJson;
      try { j = (await res.json()) as CompletionJson; } catch { throw new Transient(`HTTP ${res.status} with a non-JSON body`); }
      const latencyMs = performance.now() - t0;
      if (!res.ok) {
        const msg = typeof j.error === 'string' ? j.error : j.error?.message ?? JSON.stringify(j);
        throw new Error(`OpenRouter HTTP ${res.status}: ${msg}`);
      }
      const u = j.usage ?? {};
      const pt = u.prompt_tokens ?? 0, ct = u.completion_tokens ?? 0;
      let costUsd: number;
      if (typeof u.cost === 'number') costUsd = u.cost;
      else if (PRICES[model]) costUsd = estimateCost(model, pt, ct);
      else throw new Error(`no cost for ${model}: OpenRouter returned no usage.cost and the model is not in the price table; refusing to record $0`);
      return {
        text: j.choices?.[0]?.message?.content ?? '',
        promptTokens: pt,
        completionTokens: ct,
        reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
        finishReason: j.choices?.[0]?.finish_reason ?? null,
        costUsd,
        latencyMs,
        model: j.model ?? model,
        generationId: j.id,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    chat(model, messages): Promise<LlmResponse> {
      return limit(async () => {
        let lastErr = '';
        for (let a = 1; a <= attempts; a++) {
          try {
            return await once(model, messages);
          } catch (e) {
            if (!(e instanceof Transient)) throw e;
            lastErr = e.message;
            if (a < attempts) await sleep(backoff * 2 ** (a - 1));
          }
        }
        throw new Error(`OpenRouter failed after ${attempts} attempts: ${lastErr}`);
      });
    },
  };
}
