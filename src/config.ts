import { existsSync } from 'node:fs';

export interface Tiers { small: string; large: string }
/** Small tier chosen by the bake-off in DECISIONS.md D-017 (cheap open-weight 70B class with a real accuracy gap); large tier is the flagship baseline. */
export const TIERS: Tiers = { small: 'meta-llama/llama-3.3-70b-instruct', large: 'anthropic/claude-sonnet-5.5' };
/** CLI flag > env (SMALL_MODEL / LARGE_MODEL, read at call time so .env is honoured) > default. */
export function resolveTiers(override: Partial<Tiers> = {}): Tiers {
  return { small: override.small ?? process.env.SMALL_MODEL ?? TIERS.small, large: override.large ?? process.env.LARGE_MODEL ?? TIERS.large };
}

export interface Policy {
  tier: 'small' | 'large' | 'auto';
  prune: boolean;
  verify: 'none' | 'always' | 'selective';
}
export type PolicyName = 'P0' | 'S' | 'P1' | 'P2' | 'P3' | 'V';
export const POLICIES: Record<PolicyName, Policy> = {
  P0: { tier: 'large', prune: false, verify: 'none' },
  S: { tier: 'small', prune: false, verify: 'none' },
  P1: { tier: 'auto', prune: false, verify: 'none' },
  P2: { tier: 'auto', prune: true, verify: 'none' },
  P3: { tier: 'auto', prune: true, verify: 'selective' },
  V: { tier: 'auto', prune: true, verify: 'always' },
};
export const POLICY_LABELS: Record<PolicyName, string> = {
  P0: 'baseline: large always', S: 'small only', P1: '+ router', P2: '+ context pruning', P3: '+ selective verification (full)', V: 'verify always',
};

export interface Thresholds {
  /** Router difficulty score at or above which the task goes straight to the large tier. */
  routerHi: number;
  /** Verify when the model's self-reported confidence is below this. */
  verifyConfidence: number;
  /** Verify when SQL complexity (joins + subselects + windows + ctes) is at or above this. */
  verifyComplexity: number;
  maxRepairs: { small: number; large: number };
}
export const THRESHOLDS: Thresholds = { routerHi: 4, verifyConfidence: 0.75, verifyComplexity: 3, maxRepairs: { small: 1, large: 2 } };

/** Relative to the P0 baseline on the same task set. Fixed before the first optimisation run (D-010). */
export const FLOORS = { accuracyDropPp: 2.0, p95LatencyFactor: 1.25 } as const;

export function loadApiKey(): string {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key (never commit it).');
  return key;
}
