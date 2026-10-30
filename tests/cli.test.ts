import { describe, it, expect } from 'vitest';
import { parseArgs, isInsideRepo } from '../src/util/args.js';
import { resolve } from 'node:path';

describe('cli args', () => {
  it('parses command, values and boolean flags', () => {
    expect(parseArgs(['gen-tasks', '--seed', '3', '--mock', '--out', 'x.jsonl', '--lang', 'ar'])).toEqual({ command: 'gen-tasks', flags: { seed: '3', mock: true, out: 'x.jsonl', lang: 'ar' } });
    expect(parseArgs([])).toEqual({ command: null, flags: {} });
  });
  it('detects paths inside the repository', () => {
    const root = resolve('.');
    expect(isInsideRepo(resolve(root, 'data/holdout.jsonl'), root)).toBe(true);
    expect(isInsideRepo(resolve(root, '../humain-holdout/holdout.jsonl'), root)).toBe(false);
  });
});
