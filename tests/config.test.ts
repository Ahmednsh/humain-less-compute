import { describe, it, expect } from 'vitest';
import { POLICIES, FLOORS, THRESHOLDS, TIERS, resolveTiers } from '../src/config.js';

describe('config', () => {
  it('defines the ablation ladder', () => {
    expect(POLICIES.P0).toEqual({ tier: 'large', prune: false, verify: 'none' });
    expect(POLICIES.S).toEqual({ tier: 'small', prune: false, verify: 'none' });
    expect(POLICIES.P1).toEqual({ tier: 'auto', prune: false, verify: 'none' });
    expect(POLICIES.P2).toEqual({ tier: 'auto', prune: true, verify: 'none' });
    expect(POLICIES.P3).toEqual({ tier: 'auto', prune: true, verify: 'selective' });
    expect(POLICIES.V).toEqual({ tier: 'auto', prune: true, verify: 'always' });
  });
  it('fixes floors and thresholds', () => {
    expect(FLOORS).toEqual({ accuracyDropPp: 2.0, p95LatencyFactor: 1.25 });
    expect(THRESHOLDS.maxRepairs).toEqual({ small: 1, large: 2 });
    expect(THRESHOLDS.routerHi).toBeGreaterThan(0);
    expect(THRESHOLDS.verifyConfidence).toBeLessThan(1);
  });
  it('tier overrides replace the defaults; env overrides are read at call time', () => {
    expect(TIERS.small).toBe('anthropic/claude-haiku-5.5');
    expect(resolveTiers({ small: 'qwen/qwen3.7-flash' })).toEqual({ small: 'qwen/qwen3.7-flash', large: 'anthropic/claude-sonnet-5.5' });
    process.env.LARGE_MODEL = 'openai/gpt-5.4';
    try { expect(resolveTiers().large).toBe('openai/gpt-5.4'); expect(resolveTiers({ large: 'x' }).large).toBe('x'); } finally { delete process.env.LARGE_MODEL; }
  });
});
