import type { DatabaseSync } from 'node:sqlite';
import { createRng } from '../data/rng.js';
import { runReadOnly } from '../data/db.js';
import { applyRenameToSql, renamingDb, type RenameMap } from '../data/rename.js';
import { rowsToAnswer } from '../eval/score.js';
import { ALL_TEMPLATES, DEV_TEMPLATES, type Template } from './templates/index.js';
import type { Lang, Task, Tier } from './types.js';

export interface GenerateOptions {
  seed: number;
  n: number;
  /** true → include the holdout-only templates (only for the held-out set). */
  holdout: boolean;
  lang: Lang;
  /** When the DB was renamed (R1), rewrite gold SQL with the same map. */
  rename?: RenameMap;
}

const ATTEMPTS = 25;

export function generateTasks(db: DatabaseSync, opts: GenerateOptions): Task[] {
  const rng = createRng(opts.seed);
  const pool = opts.holdout ? ALL_TEMPLATES : DEV_TEMPLATES;
  const perTier: Record<Tier, number> = { 1: Math.floor(opts.n / 3), 2: Math.floor(opts.n / 3), 3: Math.floor(opts.n / 3) };
  for (let i = 0; i < opts.n % 3; i++) perTier[(i + 1) as Tier]++;

  // Templates sample parameters with SQL written against the original names.
  const sampleDb = opts.rename ? renamingDb(db, opts.rename) : db;
  const tasks: Task[] = [];
  const seenParams = new Set<string>();
  let serial = 0;
  for (const tier of [1, 2, 3] as const) {
    const templates = pool.filter(t => t.tier === tier);
    if (templates.length === 0) throw new Error(`no templates for tier ${tier}`);
    for (let k = 0; k < perTier[tier]; k++) {
      const template = templates[k % templates.length]!;
      const task = sampleTask(db, sampleDb, rng, template, opts, seenParams, ++serial);
      if (task) tasks.push(task); else throw new Error(`could not sample a task for template ${template.id}`);
    }
  }
  return rng.shuffle(tasks);
}

function sampleTask(db: DatabaseSync, sampleDb: DatabaseSync, rng: ReturnType<typeof createRng>, template: Template, opts: GenerateOptions, seenParams: Set<string>, serial: number): Task | null {
  let fallback: Task | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const inst = template.sample(rng, sampleDb);
    if (!inst) continue;
    const goldSql = opts.rename ? applyRenameToSql(inst.sql, opts.rename) : inst.sql;
    const r = runReadOnly(db, goldSql, { rowCap: 50 });
    if (!r.ok) throw new Error(`gold SQL failed for ${template.id}: ${r.error}`);
    const gold = rowsToAnswer(r.rows, template.answerType.includes('list') ? 'list' : 'scalar');
    if (gold == null || (Array.isArray(gold) && gold.length === 0)) continue;
    const phrasings = opts.lang === 'ar' ? inst.ar : inst.en;
    const task: Task = {
      id: `${template.id}-${serial}`,
      templateId: template.id,
      tier: template.tier,
      lang: opts.lang,
      question: rng.pick(phrasings),
      goldSql,
      gold,
      answerType: template.answerType,
      moneyAggregate: template.moneyAggregate ?? false,
    };
    const key = `${template.id}:${JSON.stringify(inst.params)}`;
    if (!seenParams.has(key)) { seenParams.add(key); return task; }
    fallback ??= task; // parameter space exhausted: accept a repeat rather than fail
  }
  return fallback;
}
