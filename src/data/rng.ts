export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(a: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(a: readonly T[]): T[];
}

/** mulberry32: small, fast, deterministic 32-bit PRNG. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (a) => {
      if (a.length === 0) throw new Error('pick from empty array');
      return a[Math.floor(next() * a.length)]!;
    },
    chance: (p) => next() < p,
    shuffle: (a) => {
      const c = [...a];
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [c[i], c[j]] = [c[j]!, c[i]!];
      }
      return c;
    },
  };
}
