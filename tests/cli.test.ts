import { describe, it, expect } from 'vitest';
import { parseArgs, isInsideRepo, defaultRunPath } from '../src/util/args.js';
import { resolve } from 'node:path';

describe('run paths', () => {
  it('default run path is deterministic so a re-run resumes instead of double-spending', () => {
    expect(defaultRunPath('P3', 'data/dev.jsonl', {})).toBe('results/runs/dev-P3.jsonl');
    expect(defaultRunPath('P3', 'data/dev.jsonl', {})).toBe(defaultRunPath('P3', 'data/dev.jsonl', {}));
    expect(defaultRunPath('P1', 'data/dev.jsonl', { theta: '5' })).toBe('results/runs/dev-P1-theta5.jsonl');
    expect(defaultRunPath('P3', 'data/r3_modelswap.jsonl', { small: 'qwen/qwen3.7-flash' })).toBe('results/runs/r3_modelswap-P3-small-qwen-qwen3.7-flash.jsonl');
  });
});

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
