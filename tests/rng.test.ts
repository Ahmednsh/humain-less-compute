import { describe, it, expect } from 'vitest';
import { createRng } from '../src/data/rng.js';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42), b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('differs across seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it('int is inclusive and in range', () => {
    const r = createRng(3); const seen = new Set<number>();
    for (let i = 0; i < 500; i++) { const v = r.int(1, 3); expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(3); seen.add(v); }
    expect(seen.size).toBe(3);
  });
  it('shuffle keeps elements', () => {
    expect(createRng(5).shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});
