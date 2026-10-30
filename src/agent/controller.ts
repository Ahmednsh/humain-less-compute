import type { DatabaseSync } from 'node:sqlite';
import type { SchemaInfo } from '../data/db.js';
import type { LlmClient } from '../llm/types.js';
import { THRESHOLDS, type Policy, type Thresholds, type Tiers } from '../config.js';
import type { Answer } from '../tasks/types.js';
import { buildContext, type AgentContext, type ValueIndex } from './context.js';
import { runAttempt } from './executor.js';
import { route } from './router.js';
import { applyCorrection, freeChecks, llmVerify, shouldVerify, type VerifyReason } from './verifier.js';
import { sumCalls, type AttemptResult, type CallRecord } from './trace.js';

export interface TaskOutcome {
  taskId: string;
  answer: Answer | null;
  route: 'small' | 'large';
  escalated: boolean;
  verified: boolean;
  verifyReasons: string[];
  verdict: 'correct' | 'incorrect' | null;
  corrected: boolean;
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

interface Stage { attempt: AttemptResult; ok: boolean; reason: string | null; verified: boolean; reasons: VerifyReason[]; verdict: 'correct' | 'incorrect' | null; corrected: boolean; answer: Answer | null; calls: CallRecord[] }

/** The budget-aware controller: route → context → attempt → checks → selective verify → escalate once. */
export async function runTask(a: RunTaskArgs): Promise<TaskOutcome> {
  const T = a.thresholds ?? THRESHOLDS;
  const t0 = performance.now();
  const decision = route(a.task.question, a.schema, T.routerHi);
  const firstTier: 'small' | 'large' = a.policy.tier === 'auto' ? decision.tier : a.policy.tier;
  const ctx = buildContext(a.task.question, a.schema, a.policy.prune ? 'pruned' : 'full', a.values);
  const money = decision.features.money;

  const stage = async (tier: 'small' | 'large'): Promise<Stage> => {
    const attempt = await runAttempt({ client: a.client, model: a.tiers[tier], tier, db: a.db, question: a.task.question, ctx, maxRepairs: T.maxRepairs[tier] });
    const calls = [...attempt.calls];
    const free = freeChecks(attempt, a.task.question);
    const s: Stage = { attempt, ok: free.ok, reason: free.reason, verified: false, reasons: [], verdict: null, corrected: false, answer: attempt.answer, calls };
    if (!free.ok || !attempt.sql || !attempt.rows) return s;

    const want = a.policy.verify === 'always' ? { verify: true, reasons: [] as VerifyReason[] }
      : a.policy.verify === 'selective' ? shouldVerify({ confidence: attempt.confidence, sql: attempt.sql, money, thresholds: T })
      : { verify: false, reasons: [] as VerifyReason[] };
    if (!want.verify) return s;

    const v = await llmVerify({ client: a.client, model: a.tiers.large, question: a.task.question, ctx, sql: attempt.sql, rows: attempt.rows });
    s.verified = true; s.reasons = want.reasons; s.verdict = v.verdict; s.calls.push(v.call);
    if (v.verdict === 'incorrect') {
      const fixed = v.correctedSql ? applyCorrection(a.db, v.correctedSql, attempt.answerShape) : null;
      if (fixed && fixed.ok) { s.corrected = true; s.answer = fixed.answer; s.ok = true; }
      else { s.ok = false; s.reason = 'verifier rejected the query'; }
    }
    return s;
  };

  const stages: Stage[] = [await stage(firstTier)];
  let escalated = false;
  if (!stages[0]!.ok && firstTier === 'small' && a.policy.tier === 'auto') { escalated = true; stages.push(await stage('large')); }

  const last = stages[stages.length - 1]!;
  const calls = stages.flatMap(s => s.calls);
  const sums = sumCalls(calls);
  return {
    taskId: a.task.id,
    answer: last.ok ? last.answer : null,
    route: firstTier,
    escalated,
    verified: stages.some(s => s.verified),
    verifyReasons: [...new Set(stages.flatMap(s => s.reasons))],
    verdict: last.verdict ?? stages[0]!.verdict,
    corrected: stages.some(s => s.corrected),
    tablesSent: ctx.tables,
    attempts: stages.map(s => s.attempt),
    calls,
    promptTokens: sums.promptTokens,
    completionTokens: sums.completionTokens,
    costUsd: sums.costUsd,
    latencyMs: performance.now() - t0,
    routerScore: decision.score,
    error: last.ok ? null : last.reason,
  };
}

export type { AgentContext };
