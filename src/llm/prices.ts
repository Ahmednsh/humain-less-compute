/**
 * USD per token, captured from https://openrouter.ai/api/v1/models on 2026-10-30.
 * Used only when OpenRouter does not return `usage.cost`, and for the unit-price column of the report.
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  'anthropic/claude-haiku-5.5': { input: 0.10e-6, output: 0.50e-6 },
  'anthropic/claude-sonnet-5.5': { input: 2.00e-6, output: 10.00e-6 },
  'qwen/qwen3.7-flash': { input: 0.03e-6, output: 0.13e-6 },
  'openai/gpt-5.4-nano': { input: 0.20e-6, output: 1.25e-6 },
  'openai/gpt-5.4': { input: 2.50e-6, output: 15.00e-6 },
  'meta-llama/llama-3.3-70b-instruct': { input: 0.10e-6, output: 0.32e-6 },
  'mistralai/mistral-small-3.2-24b-instruct': { input: 0.075e-6, output: 0.20e-6 },
  'google/gemini-2.5-flash-lite': { input: 0.10e-6, output: 0.40e-6 },
  'qwen/qwen3-32b': { input: 0.08e-6, output: 0.28e-6 },
  'openai/gpt-oss-120b': { input: 0.15e-6, output: 0.60e-6 },
};

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICES[model];
  if (!p) return 0;
  return promptTokens * p.input + completionTokens * p.output;
}
