import { describe, it, expect } from 'vitest';
import { rowsToAnswer, scoreAnswer, parseNumber } from '../src/eval/score.js';

describe('score', () => {
  it('parses formatted numbers', () => {
    expect(parseNumber('SAR 1,234.50')).toBe(1234.5);
    expect(parseNumber('12%')).toBe(12);
    expect(parseNumber('-3.5')).toBe(-3.5);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber(7)).toBe(7);
    expect(parseNumber(null)).toBeNull();
  });
  it('integer golds (counts) must match exactly; non-integers get the relative band', () => {
    expect(scoreAnswer(1000, 1004, 'number')).toBe(false);
    expect(scoreAnswer(3320, 3333, 'number')).toBe(false);
    expect(scoreAnswer(398, 400, 'number')).toBe(false);
    expect(scoreAnswer('400', 400, 'number')).toBe(true);
    expect(scoreAnswer(400.004, 400, 'number')).toBe(true);
    expect(scoreAnswer(1000.5, 1004.5, 'number')).toBe(true);
    expect(scoreAnswer(1000.5, 1010.5, 'number')).toBe(false);
    expect(scoreAnswer(0, 0.005, 'number')).toBe(true);
    expect(scoreAnswer('42', 42, 'number')).toBe(true);
    expect(scoreAnswer([42], 42, 'number')).toBe(true);
    expect(scoreAnswer(null, 42, 'number')).toBe(false);
  });
  it('strings case and space insensitive', () => {
    expect(scoreAnswer(' eastern  province.', 'Eastern Province', 'string')).toBe(true);
    expect(scoreAnswer(['Riyadh'], 'Riyadh', 'string')).toBe(true);
    expect(scoreAnswer('Riyadh', 'Jeddah', 'string')).toBe(false);
    expect(scoreAnswer('2025-03', '2025-03', 'string')).toBe(true);
  });
  it('lists order-insensitive, ordered lists not', () => {
    expect(scoreAnswer(['b', 'a'], ['a', 'b'], 'list')).toBe(true);
    expect(scoreAnswer(['b', 'a'], ['a', 'b'], 'ordered_list')).toBe(false);
    expect(scoreAnswer(['a', 'b'], ['a', 'b'], 'ordered_list')).toBe(true);
    expect(scoreAnswer(['a'], ['a', 'b'], 'list')).toBe(false);
    expect(scoreAnswer(['A ', 'b'], ['a', 'B'], 'list')).toBe(true);
  });
  it('rowsToAnswer takes the first column', () => {
    expect(rowsToAnswer([{ x: 3, y: 'z' }], 'scalar')).toBe(3);
    expect(rowsToAnswer([{ n: 'a' }, { n: 'b' }], 'list')).toEqual(['a', 'b']);
    expect(rowsToAnswer([{ n: 'a' }, { n: null }], 'list')).toEqual(['a']);
    expect(rowsToAnswer([], 'scalar')).toBeNull();
    expect(rowsToAnswer([{ n: null }], 'scalar')).toBeNull();
  });
});
