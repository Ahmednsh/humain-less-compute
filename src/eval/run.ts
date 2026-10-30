import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { SchemaInfo } from '../data/db.js';
import type { LlmClient } from '../llm/types.js';
import { THRESHOLDS, type Policy, type Thresholds, type Tiers } from '../config.js';
import type { Answer, Task } from '../tasks/types.js';
import { runTask, type TaskOutcome } from '../agent/controller.js';
import { buildValueIndex } from '../agent/context.js';
import type { CallRecord } from '../agent/trace.js';
import type { Verdict } from '../agent/verifier.js';
import { scoreAnswer } from './score.js';
import { semaphore } from '../util/semaphore.js';

export interface RunRow {
  runId: string;
  policy: string;
  policyFlags: Policy;
  models: Tiers;
  thresholds: Thresholds;
  taskId: string;
  templateId: string;
  tier: 1 | 2 | 3;
  lang: string;
  correct: boolean;
  answer: Answer | null;
  gold: Answer;
  sql: string | null;
  route: 'small' | 'large';
  escalated: boolean;
  verified: boolean;
  verifyReasons: string[];
  verdict: Verdict | null;
  corrected: boolean;
  verifierRejected: boolean;
  tablesSent: string[];
  calls: CallRecord[];
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  repairs: number;
  routerScore: number;
  error: string | null;
  ts: string;
}

export interface RunEvalArgs {
  runId?: string;
  policyName: string;
  policy: Policy;
  tasks: Task[];
  client: LlmClient;
  db: DatabaseSync;
  schema: SchemaInfo;
  tiers: Tiers;
  thresholds?: Thresholds;
  outPath: string;
  concurrency?: number;
  onRow?: (row: RunRow) => void;
}

/** Reads a JSONL run log; a truncated last line (crash mid-write) is skipped, not fatal. */
export function readRunRows(path: string): RunRow[] {
  if (!existsSync(path)) return [];
  const rows: RunRow[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line) as RunRow); } catch { /* partial line from an interrupted append */ }
  }
  return rows;
}

/** Runs a policy over a task set; one JSONL row per task, appended as it completes; resumable by task id. */
export async function runEval(a: RunEvalArgs): Promise<RunRow[]> {
  const runId = a.runId ?? `${new Date().toISOString().replace(/[:.]/g, '-')}-${a.policyName}`;
  const thresholds = a.thresholds ?? THRESHOLDS;
  mkdirSync(dirname(a.outPath), { recursive: true });
  const existing = readRunRows(a.outPath);
  const foreign = existing.find(r => r.policy !== a.policyName);
  if (foreign) throw new Error(`${a.outPath} already holds rows for policy ${foreign.policy}; refusing to resume policy ${a.policyName} into it. Use a different --out.`);
  const done = new Map(existing.map(r => [r.taskId, r]));
  const limit = semaphore(a.concurrency ?? 4);
  const values = buildValueIndex(a.db);

  const fresh = await Promise.all(a.tasks.filter(t => !done.has(t.id)).map(task => limit(async () => {
    let row: RunRow;
    try {
      const o = await runTask({ task: { id: task.id, question: task.question }, policy: a.policy, client: a.client, db: a.db, schema: a.schema, tiers: a.tiers, thresholds, values });
      row = toRow(runId, a, thresholds, task, o);
    } catch (e) {
      row = errorRow(runId, a, thresholds, task, (e as Error).message);
    }
    appendFileSync(a.outPath, JSON.stringify(row) + '\n');
    a.onRow?.(row);
    return row;
  })));

  const byId = new Map([...done, ...fresh.map(r => [r.taskId, r] as const)]);
  return a.tasks.map(t => byId.get(t.id)!).filter(Boolean);
}

function toRow(runId: string, a: RunEvalArgs, thresholds: Thresholds, task: Task, o: TaskOutcome): RunRow {
  return {
    runId, policy: a.policyName, policyFlags: a.policy, models: a.tiers, thresholds,
    taskId: task.id, templateId: task.templateId, tier: task.tier, lang: task.lang,
    correct: scoreAnswer(o.answer, task.gold, task.answerType), answer: o.answer, gold: task.gold, sql: o.sql,
    route: o.route, escalated: o.escalated, verified: o.verified, verifyReasons: o.verifyReasons, verdict: o.verdict, corrected: o.corrected, verifierRejected: o.verifierRejected,
    tablesSent: o.tablesSent, calls: o.calls, promptTokens: o.promptTokens, completionTokens: o.completionTokens, costUsd: o.costUsd, latencyMs: Math.round(o.latencyMs),
    repairs: o.attempts.reduce((s, x) => s + x.repairs, 0), routerScore: o.routerScore, error: o.error, ts: new Date().toISOString(),
  };
}

/** Only reached if something outside the controller throws (the controller itself never does). */
function errorRow(runId: string, a: RunEvalArgs, thresholds: Thresholds, task: Task, message: string): RunRow {
  return {
    runId, policy: a.policyName, policyFlags: a.policy, models: a.tiers, thresholds,
    taskId: task.id, templateId: task.templateId, tier: task.tier, lang: task.lang, correct: false, answer: null, gold: task.gold, sql: null,
    route: a.policy.tier === 'small' ? 'small' : 'large', escalated: false, verified: false, verifyReasons: [], verdict: null, corrected: false, verifierRejected: false, tablesSent: [], calls: [],
    promptTokens: 0, completionTokens: 0, costUsd: 0, latencyMs: 0, repairs: 0, routerScore: 0, error: `harness failure: ${message}`, ts: new Date().toISOString(),
  };
}
