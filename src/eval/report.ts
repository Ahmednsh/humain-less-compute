import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FLOORS } from '../config.js';
import { checkFloors, type Summary } from './metrics.js';

export interface NamedSummary { name: string; label?: string; s: Summary }

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const usd = (x: number) => (Number.isFinite(x) ? `$${x.toFixed(4)}` : '∞');
const delta = (cand: number, base: number) => (Number.isFinite(cand) && base > 0 ? `${cand <= base ? '' : '+'}${Math.round(((cand - base) / base) * 100)}%` : 'n/a');
const ms = (x: number) => `${Math.round(x)} ms`;

export function renderMarkdown(rows: NamedSummary[], baselineName: string): string {
  const base = rows.find(r => r.name === baselineName)?.s;
  const head = '| policy | n | accuracy | T1 / T2 / T3 | p50 | p95 | tokens in/out per task | cost / task | cost / success | Δ cost / success | small % | escalated % | verified % | floors |';
  const sep = '|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|';
  const lines = rows.map(({ name, label, s }) => {
    const f = base ? checkFloors(base, s, FLOORS) : null;
    const floors = !base || name === baselineName ? 'reference' : `${f!.accuracyOk ? '✅' : '❌'} acc ${f!.latencyOk ? '✅' : '❌'} p95`;
    return `| **${name}**${label ? ` ${label}` : ''} | ${s.n} | ${pct(s.accuracy)} | ${pct(s.accuracyByTier[1], 0)} / ${pct(s.accuracyByTier[2], 0)} / ${pct(s.accuracyByTier[3], 0)} | ${ms(s.p50LatencyMs)} | ${ms(s.p95LatencyMs)} | ${Math.round(s.promptTokensPerTask)} / ${Math.round(s.completionTokensPerTask)} | ${usd(s.costPerTask)} | ${usd(s.costPerSuccess)} | ${base ? delta(s.costPerSuccess, base.costPerSuccess) : 'n/a'} | ${pct(s.pctSmall, 0)} | ${pct(s.pctEscalated, 0)} | ${pct(s.pctVerified, 0)} | ${floors} |`;
  });
  const floorsNote = `Floors (relative to ${baselineName}): accuracy ≥ baseline − ${FLOORS.accuracyDropPp} pp; p95 latency ≤ ${FLOORS.p95LatencyFactor}× baseline. Cost per success = total spend ÷ correct answers (failed and escalated attempts included).`;
  return [head, sep, ...lines, '', floorsNote].join('\n');
}

export function renderHtml(rows: NamedSummary[], baselineName: string, title = 'Less-compute controller — results'): string {
  const base = rows.find(r => r.name === baselineName)?.s;
  const tr = rows.map(({ name, label, s }) => {
    const f = base ? checkFloors(base, s, FLOORS) : null;
    const floors = !base || name === baselineName ? 'reference' : `${f!.accuracyOk ? '✅' : '❌'} acc · ${f!.latencyOk ? '✅' : '❌'} p95`;
    return `<tr><td><b>${name}</b><br><small>${label ?? ''}</small></td><td>${s.n}</td><td>${pct(s.accuracy)}</td><td>${pct(s.accuracyByTier[1], 0)} / ${pct(s.accuracyByTier[2], 0)} / ${pct(s.accuracyByTier[3], 0)}</td><td>${ms(s.p50LatencyMs)}</td><td>${ms(s.p95LatencyMs)}</td><td>${Math.round(s.promptTokensPerTask)} / ${Math.round(s.completionTokensPerTask)}</td><td>${usd(s.costPerTask)}</td><td><b>${usd(s.costPerSuccess)}</b></td><td>${base ? delta(s.costPerSuccess, base.costPerSuccess) : ''}</td><td>${pct(s.pctSmall, 0)}</td><td>${pct(s.pctEscalated, 0)}</td><td>${pct(s.pctVerified, 0)}</td><td>${floors}</td></tr>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;margin:32px;color:#1b1b1b;background:#fafafa}table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #ddd;padding:8px 10px;text-align:right;white-space:nowrap}th{background:#f0f0f0}td:first-child,th:first-child{text-align:left}caption{text-align:left;font-weight:600;padding:8px 0}small{color:#666}p{max-width:900px}</style></head><body>
<h1>${title}</h1>
<table><caption>Ablation ladder · baseline = ${baselineName}</caption>
<tr><th>policy</th><th>n</th><th>accuracy</th><th>T1 / T2 / T3</th><th>p50</th><th>p95</th><th>tokens in/out per task</th><th>cost / task</th><th>cost / success</th><th>Δ cost / success</th><th>small %</th><th>escalated %</th><th>verified %</th><th>floors</th></tr>
${tr}
</table>
<p>Floors (relative to ${baselineName}): accuracy ≥ baseline − ${FLOORS.accuracyDropPp} pp; p95 latency ≤ ${FLOORS.p95LatencyFactor}× baseline. Cost per success = total spend ÷ correct answers; failed and escalated attempts are included in the spend.</p>
</body></html>`;
}

export interface ExperimentEntry { runId: string; policy: string; taskset: string; n: number; summary: Summary; notes: string }

const HEADER = '| run id | policy | task set | n | accuracy | T1/T2/T3 | p95 | tokens in/out | cost / task | cost / success | small % | escalated % | verified % | notes |\n|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|\n';

export function appendExperimentLog(path: string, e: ExperimentEntry): void {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, `# Experiment log\n\nOne row per real run, appended automatically by \`eval\`. Logs live in \`results/runs/\`.\n\n${HEADER}`);
  else if (readFileSync(path, 'utf8').split('\n').some(l => l.startsWith(`| ${e.runId} |`))) return; // re-running a finished run is not a new experiment
  const s = e.summary;
  appendFileSync(path, `| ${e.runId} | ${e.policy} | ${e.taskset} | ${e.n} | ${pct(s.accuracy)} | ${pct(s.accuracyByTier[1], 0)}/${pct(s.accuracyByTier[2], 0)}/${pct(s.accuracyByTier[3], 0)} | ${ms(s.p95LatencyMs)} | ${Math.round(s.promptTokensPerTask)}/${Math.round(s.completionTokensPerTask)} | ${usd(s.costPerTask)} | ${usd(s.costPerSuccess)} | ${pct(s.pctSmall, 0)} | ${pct(s.pctEscalated, 0)} | ${pct(s.pctVerified, 0)} | ${e.notes.replace(/\|/g, '/')} |\n`);
}
