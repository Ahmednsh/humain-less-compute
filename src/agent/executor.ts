import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { runReadOnly, type Row } from '../data/db.js';
import { rowsToAnswer } from '../eval/score.js';
import type { ChatMessage, LlmClient, LlmResponse } from '../llm/types.js';
import type { AgentContext } from './context.js';
import { emptyResultPrompt, fewshotMessages, repairPrompt, systemPrompt } from './prompts.js';
import type { AttemptResult, CallPurpose, CallRecord } from './trace.js';

const ModelJson = z.object({
  sql: z.string().min(1),
  answer_shape: z.enum(['scalar', 'list']).default('scalar'),
  confidence: z.coerce.number().default(0.5).transform(c => Math.min(1, Math.max(0, c))),
});
export type ModelJson = z.infer<typeof ModelJson>;

/** Tolerant parser: strips ``` fences, takes the first {...} block, validates. */
export function parseModelJson(text: string): ModelJson | null {
  const stripped = text.replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = ModelJson.safeParse(JSON.parse(stripped.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export const toCall = (purpose: CallPurpose, r: LlmResponse): CallRecord =>
  ({ purpose, model: r.model, promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: r.costUsd, latencyMs: r.latencyMs });

export function rowsPreview(rows: Row[], n = 5): string {
  return rows.length === 0 ? '(no rows)' : rows.slice(0, n).map(r => JSON.stringify(r)).join('\n') + (rows.length > n ? `\n... (${rows.length} rows)` : '');
}

export interface AttemptArgs {
  client: LlmClient;
  model: string;
  tier: 'small' | 'large';
  db: DatabaseSync;
  question: string;
  ctx: AgentContext;
  maxRepairs: number;
  /** Called as soon as each call completes, so cost survives a later exception. */
  onCall?: (c: CallRecord) => void;
}

/** One model attempt: generate SQL as JSON, run it read-only, repair on error/empty up to maxRepairs. */
export async function runAttempt(a: AttemptArgs): Promise<AttemptResult> {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(a.ctx) }, ...fewshotMessages(a.ctx), { role: 'user', content: a.question }];
  const result: AttemptResult = { tier: a.tier, sql: null, answerShape: 'scalar', confidence: 0, rows: null, answer: null, error: null, repairs: 0, calls: [] };

  for (let turn = 0; turn <= a.maxRepairs; turn++) {
    const purpose: CallPurpose = turn === 0 ? 'generate' : 'repair';
    if (turn > 0) result.repairs++;
    const res = await a.client.chat(a.model, messages);
    const call = toCall(purpose, res);
    result.calls.push(call);
    a.onCall?.(call);
    messages.push({ role: 'assistant', content: res.text });

    const parsed = parseModelJson(res.text);
    if (!parsed) { result.error = 'model output was not the expected JSON'; messages.push({ role: 'user', content: repairPrompt(result.error) }); continue; }
    result.sql = parsed.sql; result.answerShape = parsed.answer_shape; result.confidence = parsed.confidence;

    const q = runReadOnly(a.db, parsed.sql);
    if (!q.ok) { result.error = q.error; result.rows = null; result.answer = null; messages.push({ role: 'user', content: repairPrompt(q.error) }); continue; }
    result.rows = q.rows;
    result.answer = rowsToAnswer(q.rows, parsed.answer_shape);
    if (result.answer == null || (Array.isArray(result.answer) && result.answer.length === 0)) {
      result.error = 'empty result';
      messages.push({ role: 'user', content: emptyResultPrompt() });
      continue;
    }
    result.error = null;
    return result;
  }
  return result;
}
