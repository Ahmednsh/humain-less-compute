import type { DatabaseSync } from 'node:sqlite';
import type { SchemaInfo } from '../data/db.js';
import type { LlmClient } from '../llm/types.js';
import { THRESHOLDS, type Policy, type Thresholds, type Tiers } from '../config.js';
import type { Answer } from '../tasks/types.js';
import { buildContext, type AgentContext, type ValueIndex } from './context.js';
import { runAttempt } from './executor.js';
import { route } from './router.js';
import { applyCorrection, freeChecks, llmVerify, shouldVerify, type Verdict, type VerifyReason } from './verifier.js';
import { sumCalls, type AttemptResult, type CallRecord } from './trace.js';

export interface TaskOutcome {
  taskId: string;
  answer: Answer | null;
  /** SQL behind the final answer (corrected SQL when the verifier fixed it). */
  sql: string | null;
  route: 'small' | 'large';
  escalated: boolean;
  verified: boolean;
  verifyReasons: string[];
  verdict: Verdict | null;
  corrected: boolean;
  /** Large tier: verifier said incorrect but offered no usable correction; original answer kept. */
  verifierRejected: boolean;
  tablesSent: string[];
  attempts: AttemptResult[];
  calls: CallRecord[];
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  routerScore: number;
  error: string | null;
}

export interface RunTaskArgs {
  /** Only the question reaches the model. Tier and gold are never read here. */
  task: { id: string; question: string };
  policy: Policy;
  client: LlmClient;
  db: DatabaseSync;
  schema: SchemaInfo;
  tiers: Tiers;
  thresholds?: Thresholds;
  /** Known dimension values for pruning (from buildValueIndex); optional. */
  values?: ValueIndex;
}

interface Stage {
  attempt: AttemptResult; ok: boolean; reason: string | null; verified: boolean; reasons: VerifyReason[];
  verdict: Verdict | null; corrected: boolean; verifierRejected: boolean; answer: Answer | null; sql: string | null;
}

/**
 * The budget-aware controller: route → context → attempt → free checks → selective verify → escalate once.
 * Never throws: a client failure mid-task is returned as an error outcome that still carries every paid call.
 */
export async function runTask(a: RunTaskArgs): Promise<TaskOutcome> {
  const T = a.thresholds ?? THRESHOLDS;
  const t0 = performance.now();
  const decision = route(a.task.question, a.schema, T.routerHi);
  const firstTier: 'small' | 'large' = a.policy.tier === 'auto' ? decision.tier : a.policy.tier;
  const ctx = buildContext(a.task.question, a.schema, a.policy.prune ? 'pruned' : 'full', a.values);
  const money = decision.features.money;
  const calls: CallRecord[] = [];
  const onCall = (c: CallRecord) => { calls.push(c); };
  const stages: Stage[] = [];
  let escalated = false;

  const stage = async (tier: 'small' | 'large'): Promise<Stage> => {
    const attempt = await runAttempt({ client: a.client, model: a.tiers[tier], tier, db: a.db, question: a.task.question, ctx, maxRepairs: T.maxRepairs[tier], onCall });
    const free = freeChecks(attempt, a.task.question);
    const s: Stage = { attempt, ok: free.ok, reason: free.reason, verified: false, reasons: [], verdict: null, corrected: false, verifierRejected: false, answer: attempt.answer, sql: attempt.sql };
    if (!free.ok || !attempt.sql || !attempt.rows) return s;

    const want = a.policy.verify === 'always' ? { verify: true, reasons: [] as VerifyReason[] }
      : a.policy.verify === 'selective' ? shouldVerify({ confidence: attempt.confidence, sql: attempt.sql, money, thresholds: T })
      : { verify: false, reasons: [] as VerifyReason[] };
    if (!want.verify) return s;

    const v = await llmVerify({ client: a.client, model: a.tiers.large, question: a.task.question, ctx, sql: attempt.sql, rows: attempt.rows, onCall });
    s.verified = true; s.reasons = want.reasons; s.verdict = v.verdict;
    if (v.verdict === 'incorrect') {
      const fixed = v.correctedSql ? applyCorrection(a.db, v.correctedSql, attempt.answerShape) : null;
      if (fixed && fixed.ok) { s.corrected = true; s.answer = fixed.answer; s.sql = v.correctedSql; s.ok = true; }
      else if (tier === 'small' && a.policy.tier === 'auto') { s.ok = false; s.reason = 'verifier rejected the query'; }
      else { s.verifierRejected = true; } // nothing better available: keep the original answer, flag it
    }
    return s;
  };

  let error: string | null = null;
  try {
    stages.push(await stage(firstTier));
    if (!stages[0]!.ok && firstTier === 'small' && a.policy.tier === 'auto') { escalated = true; stages.push(await stage('large')); }
  } catch (e) {
    error = `client failure: ${(e as Error).message}`;
  }

  const last = stages[stages.length - 1];
  const ok = error == null && !!last && last.ok;
  const sums = sumCalls(calls);
  return {
    taskId: a.task.id,
    answer: ok ? last!.answer : null,
    sql: last?.sql ?? null,
    route: firstTier,
    escalated,
    verified: stages.some(s => s.verified),
    verifyReasons: [...new Set(stages.flatMap(s => s.reasons))],
    verdict: last?.verdict ?? stages[0]?.verdict ?? null,
    corrected: stages.some(s => s.corrected),
    verifierRejected: stages.some(s => s.verifierRejected),
    tablesSent: ctx.tables,
    attempts: stages.map(s => s.attempt),
    calls,
    promptTokens: sums.promptTokens,
    completionTokens: sums.completionTokens,
    costUsd: sums.costUsd,
    latencyMs: performance.now() - t0,
    routerScore: decision.score,
    error: error ?? (ok ? null : last?.reason ?? 'no attempt'),
  };
}

export type { AgentContext };
