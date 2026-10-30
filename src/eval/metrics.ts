import type { RunRow } from './run.js';
import type { FLOORS } from '../config.js';

export interface Summary {
  n: number;
  accuracy: number;
  accuracyByTier: Record<1 | 2 | 3, number>;
  p50LatencyMs: number;
  p95LatencyMs: number;
  promptTokensPerTask: number;
  completionTokensPerTask: number;
  costTotal: number;
  costPerTask: number;
  costPerSuccess: number;
  pctSmall: number;
  pctEscalated: number;
  pctVerified: number;
  pctRepaired: number;
  errors: number;
}

/** Nearest-rank percentile (p in 0..100). */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(rows: RunRow[]): Summary {
  const n = rows.length;
  const correct = rows.filter(r => r.correct).length;
  const costTotal = rows.reduce((s, r) => s + r.costUsd, 0);
  const tierAcc = (t: 1 | 2 | 3) => { const rs = rows.filter(r => r.tier === t); return rs.length ? rs.filter(r => r.correct).length / rs.length : 0; };
  return {
    n,
    accuracy: n ? correct / n : 0,
    accuracyByTier: { 1: tierAcc(1), 2: tierAcc(2), 3: tierAcc(3) },
    p50LatencyMs: percentile(rows.map(r => r.latencyMs), 50),
    p95LatencyMs: percentile(rows.map(r => r.latencyMs), 95),
    promptTokensPerTask: mean(rows.map(r => r.promptTokens)),
    completionTokensPerTask: mean(rows.map(r => r.completionTokens)),
    costTotal,
    costPerTask: n ? costTotal / n : 0,
    costPerSuccess: correct ? costTotal / correct : Infinity,
    pctSmall: n ? rows.filter(r => r.route === 'small').length / n : 0,
    pctEscalated: n ? rows.filter(r => r.escalated).length / n : 0,
    pctVerified: n ? rows.filter(r => r.verified).length / n : 0,
    pctRepaired: n ? rows.filter(r => r.repairs > 0).length / n : 0,
    errors: rows.filter(r => r.error != null).length,
  };
}

export function checkFloors(baseline: Summary, candidate: Summary, floors: typeof FLOORS): { accuracyOk: boolean; latencyOk: boolean } {
  return {
    accuracyOk: candidate.accuracy >= baseline.accuracy - floors.accuracyDropPp / 100 - 1e-9,
    latencyOk: candidate.p95LatencyMs <= baseline.p95LatencyMs * floors.p95LatencyFactor + 1e-9,
  };
}
