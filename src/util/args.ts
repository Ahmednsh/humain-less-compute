import { relative, resolve, isAbsolute } from 'node:path';

export type Flags = Record<string, string | boolean>;

/** `cmd --key value --flag` → { command, flags }. A `--key` followed by another `--key` or nothing is boolean true. */
export function parseArgs(argv: string[]): { command: string | null; flags: Flags } {
  const flags: Flags = {};
  let command: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; } else flags[key] = true;
    } else if (command === null) command = a;
  }
  return { command, flags };
}

export function str(flags: Flags, key: string, fallback?: string): string {
  const v = flags[key];
  if (typeof v === 'string') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${key}`);
}
export function num(flags: Flags, key: string, fallback?: number): number {
  const v = flags[key];
  if (typeof v === 'string') { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`--${key} must be a number`); return n; }
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${key}`);
}
export const bool = (flags: Flags, key: string): boolean => flags[key] === true || flags[key] === 'true';

/**
 * Deterministic run-log path: the same command always maps to the same file, so a re-run resumes
 * (skips logged task ids) instead of paying again. Variants (--theta, --small, --large) get a suffix.
 */
export function defaultRunPath(policy: string, tasksPath: string, flags: Flags): string {
  const taskset = tasksPath.replace(/\\/g, '/').split('/').pop()!.replace(/\.jsonl$/, '');
  const variant = ['theta', 'small', 'large']
    .filter(k => typeof flags[k] === 'string')
    .map(k => (k === 'theta' ? `theta${flags[k]}` : `${k}-${String(flags[k]).replace(/[^a-z0-9.]+/gi, '-')}`))
    .join('-');
  return `results/runs/${taskset}-${policy}${variant ? `-${variant}` : ''}.jsonl`;
}

export function isInsideRepo(path: string, repoRoot: string): boolean {
  const rel = relative(resolve(repoRoot), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
