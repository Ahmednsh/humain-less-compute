import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { SchemaInfo } from '../data/db.js';
import type { LlmClient } from '../llm/types.js';
import type { Policy, Thresholds, Tiers } from '../config.js';
import type { Answer, Task } from '../tasks/types.js';
import { runTask, type TaskOutcome } from '../agent/controller.js';
import { scoreAnswer } from './score.js';
import { semaphore } from '../util/semaphore.js';

export interface RunRow {
  runId: string;
  policy: string;
  taskId: string;
  templateId: string;
  tier: 1 | 2 | 3;
  lang: string;
  correct: boolean;
  answer: Answer | null;
  gold: Answer;
  route: 'small' | 'large';
  escalated: boolean;
  verified: boolean;
  verifyReasons: string[];
  verdict: 'correct' | 'incorrect' | null;
  corrected: boolean;
  tablesSent: string[];
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

export function readRunRows(path: string): RunRow[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as RunRow);
}

/** Runs a policy over a task set; one JSONL row per task, appended as it completes; resumable by task id. */
export async function runEval(a: RunEvalArgs): Promise<RunRow[]> {
  const runId = a.runId ?? `${new Date().toISOString().replace(/[:.]/g, '-')}-${a.policyName}`;
  mkdirSync(dirname(a.outPath), { recursive: true });
  const existing = readRunRows(a.outPath);
  const done = new Map(existing.map(r => [r.taskId, r]));
  const limit = semaphore(a.concurrency ?? 4);

  const fresh = await Promise.all(a.tasks.filter(t => !done.has(t.id)).map(task => limit(async () => {
    let row: RunRow;
    try {
      const o = await runTask({ task: { id: task.id, question: task.question }, policy: a.policy, client: a.client, db: a.db, schema: a.schema, tiers: a.tiers, thresholds: a.thresholds });
      row = toRow(runId, a.policyName, task, o);
    } catch (e) {
      row = errorRow(runId, a.policyName, task, (e as Error).message);
    }
    appendFileSync(a.outPath, JSON.stringify(row) + '\n');
    a.onRow?.(row);
    return row;
  })));

  const byId = new Map([...done, ...fresh.map(r => [r.taskId, r] as const)]);
  return a.tasks.map(t => byId.get(t.id)!).filter(Boolean);
}

function toRow(runId: string, policy: string, task: Task, o: TaskOutcome): RunRow {
  return {
    runId, policy, taskId: task.id, templateId: task.templateId, tier: task.tier, lang: task.lang,
    correct: scoreAnswer(o.answer, task.gold, task.answerType), answer: o.answer, gold: task.gold,
    route: o.route, escalated: o.escalated, verified: o.verified, verifyReasons: o.verifyReasons, verdict: o.verdict, corrected: o.corrected,
    tablesSent: o.tablesSent, promptTokens: o.promptTokens, completionTokens: o.completionTokens, costUsd: o.costUsd, latencyMs: Math.round(o.latencyMs),
    repairs: o.attempts.reduce((s, x) => s + x.repairs, 0), routerScore: o.routerScore, error: o.error, ts: new Date().toISOString(),
  };
}

function errorRow(runId: string, policy: string, task: Task, message: string): RunRow {
  return {
    runId, policy, taskId: task.id, templateId: task.templateId, tier: task.tier, lang: task.lang, correct: false, answer: null, gold: task.gold,
    route: 'large', escalated: false, verified: false, verifyReasons: [], verdict: null, corrected: false, tablesSent: [],
    promptTokens: 0, completionTokens: 0, costUsd: 0, latencyMs: 0, repairs: 0, routerScore: 0, error: `client failure: ${message}`, ts: new Date().toISOString(),
  };
}
