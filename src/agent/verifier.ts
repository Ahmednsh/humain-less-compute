import { z } from 'zod';
import type { Row } from '../data/db.js';
import type { SqlExec } from '../data/sqlexec.js';
import { rowsToAnswer } from '../eval/score.js';
import type { LlmClient } from '../llm/types.js';
import type { Thresholds } from '../config.js';
import type { Answer } from '../tasks/types.js';
import type { AgentContext } from './context.js';
import { rowsPreview, toCall } from './executor.js';
import { verifyPrompt } from './prompts.js';
import type { AttemptResult, CallRecord } from './trace.js';

/** Deterministic, zero-cost checks applied to every attempt. */
export function freeChecks(a: AttemptResult, question: string): { ok: boolean; reason: string | null } {
  if (a.error) return { ok: false, reason: a.error };
  if (a.answer == null || !a.rows || a.rows.length === 0) return { ok: false, reason: 'empty result' };
  if (a.answerShape === 'scalar' && a.rows.length > 1) {
    const col = Object.keys(a.rows[0]!)[0]!;
    if (new Set(a.rows.map(r => String(r[col]))).size > 1) return { ok: false, reason: 'declared scalar but query returned several distinct rows' };
  }
  if (typeof a.answer === 'number' && a.answer < 0 && /how many|count|number of|كم عدد/i.test(question)) return { ok: false, reason: 'negative count' };
  return { ok: true, reason: null };
}

export function sqlComplexity(sql: string): number {
  const s = sql.toLowerCase();
  const joins = (s.match(/\bjoin\b/g) ?? []).length;
  const subselects = (s.match(/\(\s*select\b/g) ?? []).length;
  const windows = (s.match(/\bover\s*\(/g) ?? []).length;
  const ctes = /^\s*with\b/.test(s) ? 1 : 0;
  return joins + subselects + windows + ctes;
}

export type VerifyReason = 'low_confidence' | 'complex_sql' | 'money';
export function shouldVerify(a: { confidence: number; sql: string; money: boolean; thresholds: Thresholds }): { verify: boolean; reasons: VerifyReason[] } {
  const reasons: VerifyReason[] = [];
  if (a.confidence < a.thresholds.verifyConfidence) reasons.push('low_confidence');
  if (sqlComplexity(a.sql) >= a.thresholds.verifyComplexity) reasons.push('complex_sql');
  if (a.money) reasons.push('money');
  return { verify: reasons.length > 0, reasons };
}

const VerdictJson = z.object({ verdict: z.enum(['correct', 'incorrect']), corrected_sql: z.string().nullable().optional(), reason: z.string().optional() });

export type Verdict = 'correct' | 'incorrect' | 'unparseable';
export interface VerifyOutcome { verdict: Verdict; correctedSql: string | null; reason: string; call: CallRecord }

export async function llmVerify(a: { client: LlmClient; model: string; question: string; ctx: AgentContext; sql: string; rows: Row[]; onCall?: (c: CallRecord) => void }): Promise<VerifyOutcome> {
  const res = await a.client.chat(a.model, [{ role: 'user', content: verifyPrompt(a.ctx, a.question, a.sql, rowsPreview(a.rows)) }]);
  const call = toCall('verify', res);
  a.onCall?.(call);
  const text = res.text.replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  const unparseable: VerifyOutcome = { verdict: 'unparseable', correctedSql: null, reason: 'verifier output unparseable; original kept', call };
  if (start < 0 || end <= start) return unparseable;
  try {
    const parsed = VerdictJson.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) return unparseable;
    const d = parsed.data;
    return { verdict: d.verdict, correctedSql: d.verdict === 'incorrect' ? d.corrected_sql ?? null : null, reason: d.reason ?? '', call };
  } catch {
    return unparseable;
  }
}

export async function applyCorrection(exec: SqlExec, sql: string, shape: 'scalar' | 'list'): Promise<{ ok: true; rows: Row[]; answer: Answer } | { ok: false; error: string }> {
  const q = await exec.run(sql);
  if (!q.ok) return { ok: false, error: q.error };
  const answer = rowsToAnswer(q.rows, shape);
  if (answer == null || (Array.isArray(answer) && answer.length === 0)) return { ok: false, error: 'empty result' };
  return { ok: true, rows: q.rows, answer };
}
