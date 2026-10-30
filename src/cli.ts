import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { openDb, createSchema, introspectSchema } from './data/db.js';
import { createWorkerExec } from './data/sqlexec.js';
import { generateCompany } from './data/generate.js';
import { RENAME_MAP, applyRenameToDb } from './data/rename.js';
import { generateTasks } from './tasks/generate.js';
import type { Task } from './tasks/types.js';
import { createOpenRouterClient } from './llm/openrouter.js';
import { createMockClient } from './llm/mock.js';
import type { LlmClient } from './llm/types.js';
import { POLICIES, POLICY_LABELS, THRESHOLDS, loadApiKey, resolveTiers, type PolicyName } from './config.js';
import { runEval, readRunRows, type RunRow } from './eval/run.js';
import { summarize } from './eval/metrics.js';
import { appendExperimentLog, renderHtml, renderMarkdown, type NamedSummary } from './eval/report.js';
import { parseArgs, str, num, bool, isInsideRepo, defaultRunPath, type Flags } from './util/args.js';

const USAGE = `usage:
  gen-db    --seed N --out PATH [--rename]
  gen-tasks --db PATH --seed N --n N --out PATH [--holdout] [--lang en|ar] [--rename]
  eval      --policy P0|S|P1|P2|P3|V --tasks PATH --db PATH [--out PATH] [--limit N] [--mock]
            [--small MODEL] [--large MODEL] [--theta N] [--concurrency N] [--notes TEXT]
  report    --runs a.jsonl,b.jsonl [--baseline P0] [--md PATH] [--html PATH]`;

function readTasks(path: string): Task[] {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Task);
}

function genDb(flags: Flags): void {
  const out = str(flags, 'out'); const seed = num(flags, 'seed');
  mkdirSync(dirname(out), { recursive: true });
  if (existsSync(out)) unlinkSync(out);
  const db = openDb(out); createSchema(db);
  const counts = generateCompany(db, seed);
  if (bool(flags, 'rename')) applyRenameToDb(db, RENAME_MAP);
  db.close();
  console.log(`wrote ${out} (seed ${seed}${bool(flags, 'rename') ? ', renamed schema' : ''}):`, counts);
}

function genTasks(flags: Flags): void {
  const out = str(flags, 'out'); const holdout = bool(flags, 'holdout');
  if (holdout && isInsideRepo(out, resolve('.'))) throw new Error(`--holdout output must be outside the repository (got ${out}). The held-out set is never committed or read.`);
  const db = openDb(str(flags, 'db'), { readOnly: true });
  const lang = str(flags, 'lang', 'en'); if (lang !== 'en' && lang !== 'ar') throw new Error('--lang must be en or ar');
  const tasks = generateTasks(db, { seed: num(flags, 'seed'), n: num(flags, 'n'), holdout, lang, rename: bool(flags, 'rename') ? RENAME_MAP : undefined });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, tasks.map(t => JSON.stringify(t)).join('\n') + '\n');
  const byTier = [1, 2, 3].map(t => tasks.filter(x => x.tier === t).length).join('/');
  console.log(`wrote ${tasks.length} tasks (tiers ${byTier}, lang ${lang}${holdout ? ', HOLDOUT — do not open' : ''}) to ${out}`);
}

/** Zero-cost client for CI: gold SQL for even-indexed tasks, a wrong-but-valid query for odd ones. Built outside the controller. */
function mockFor(tasks: Task[]): LlmClient {
  const sqlByQuestion = new Map(tasks.map((t, i) => [t.question, i % 2 === 0 ? t.goldSql : 'SELECT 0 AS wrong']));
  return createMockClient((_model, messages) => {
    const last = messages.at(-1)?.content ?? '';
    if (messages.length === 1 && last.includes('SQL under review')) return JSON.stringify({ verdict: 'correct', corrected_sql: null, reason: 'mock' });
    const sql = sqlByQuestion.get(last) ?? 'SELECT 0 AS wrong';
    return JSON.stringify({ sql, answer_shape: /LIMIT [2-9]|ORDER BY e\.name$/.test(sql) ? 'list' : 'scalar', confidence: 0.8 });
  });
}

async function evalCmd(flags: Flags): Promise<void> {
  const policyName = str(flags, 'policy') as PolicyName;
  const policy = POLICIES[policyName]; if (!policy) throw new Error(`unknown policy ${policyName}; one of ${Object.keys(POLICIES).join(', ')}`);
  const tasksPath = str(flags, 'tasks'); let tasks = readTasks(tasksPath);
  if (flags.limit) tasks = tasks.slice(0, num(flags, 'limit'));
  const db = openDb(str(flags, 'db'), { readOnly: true }); const schema = introspectSchema(db);
  const tiers = resolveTiers({ small: typeof flags.small === 'string' ? flags.small : undefined, large: typeof flags.large === 'string' ? flags.large : undefined });
  const thresholds = flags.theta ? { ...THRESHOLDS, routerHi: num(flags, 'theta') } : THRESHOLDS;
  const mock = bool(flags, 'mock');
  const client = mock ? mockFor(tasks) : createOpenRouterClient({ apiKey: loadApiKey(), concurrency: num(flags, 'concurrency', 4) });
  const taskset = basename(tasksPath).replace(/\.jsonl$/, '');
  const outPath = str(flags, 'out', defaultRunPath(policyName, tasksPath, flags));
  const runId = basename(outPath).replace(/\.jsonl$/, '');
  const already = readRunRows(outPath).length;

  console.log(`policy ${policyName} (${POLICY_LABELS[policyName]}) · ${tasks.length} tasks from ${tasksPath} · small=${tiers.small} large=${tiers.large} · θ=${thresholds.routerHi}${mock ? ' · MOCK' : ''}`);
  console.log(`log ${outPath}${already ? ` · resuming: ${already} task(s) already logged will be skipped` : ''} · if this run is interrupted, re-run the same command to resume`);
  const t0 = Date.now(); let spent = 0;
  const onRow = (r: RunRow) => {
    spent += r.costUsd;
    console.log(`${r.correct ? '✔' : '✘'} ${r.taskId.padEnd(40)} route=${r.route.padEnd(5)} esc=${r.escalated ? 1 : 0} ver=${r.verified ? 1 : 0} rep=${r.repairs} tables=${r.tablesSent.length} $${r.costUsd.toFixed(4)} ${r.latencyMs}ms${r.error ? `  [${r.error.slice(0, 60)}]` : ''}`);
  };
  const exec = createWorkerExec(str(flags, 'db'), { timeoutMs: num(flags, 'sql-timeout', 15000), poolSize: Math.min(4, num(flags, 'concurrency', 4)) });
  let rows: RunRow[];
  try { rows = await runEval({ runId, policyName, policy, tasks, client, db, schema, tiers, thresholds, outPath, concurrency: num(flags, 'concurrency', 4), onRow, exec }); }
  finally { exec.close(); }
  const s = summarize(rows);
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s · spent $${spent.toFixed(4)} this session · log ${outPath}\n`);
  console.log(renderMarkdown([{ name: policyName, label: POLICY_LABELS[policyName], s }], policyName));
  if (!mock) appendExperimentLog('results/EXPERIMENTS.md', { runId, policy: policyName, taskset, n: s.n, summary: s, notes: `${str(flags, 'notes', '')} small=${tiers.small} large=${tiers.large} θ=${thresholds.routerHi} conc=${num(flags, 'concurrency', 4)}`.trim() });
}

function reportCmd(flags: Flags): void {
  const files = str(flags, 'runs').split(',').map(f => f.trim()).filter(Boolean);
  const baseline = str(flags, 'baseline', 'P0');
  const rows: NamedSummary[] = files.map(f => {
    const rs = readRunRows(f); const name = rs[0]?.policy ?? basename(f);
    return { name, label: `${POLICY_LABELS[name as PolicyName] ?? ''} · ${basename(f).replace(/\.jsonl$/, '')}`, s: summarize(rs) };
  });
  const md = renderMarkdown(rows, baseline);
  console.log(md);
  if (typeof flags.md === 'string') { mkdirSync(dirname(flags.md), { recursive: true }); writeFileSync(flags.md, md + '\n'); }
  if (typeof flags.html === 'string') { mkdirSync(dirname(flags.html), { recursive: true }); writeFileSync(flags.html, renderHtml(rows, baseline)); console.log(`\nhtml → ${flags.html}`); }
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'gen-db': return genDb(flags);
    case 'gen-tasks': return genTasks(flags);
    case 'eval': return evalCmd(flags);
    case 'report': return reportCmd(flags);
    default: console.log(USAGE); process.exitCode = command ? 1 : 0;
  }
}

main().catch(e => { console.error(`error: ${(e as Error).message}`); process.exitCode = 1; });
