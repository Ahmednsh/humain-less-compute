import type { Row } from '../data/db.js';
import type { Answer, AnswerType } from '../tasks/types.js';

export function parseNumber(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x !== 'string') return null;
  const m = x.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const normStr = (s: unknown): string =>
  String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.。!]+$/, '');

/** First column of the result set, as a scalar or a list. */
export function rowsToAnswer(rows: Row[], shape: 'scalar' | 'list'): Answer | null {
  const first = rows[0];
  if (!first) return null;
  const col = Object.keys(first)[0];
  if (!col) return null;
  const vals = rows.map(r => r[col] as string | number | null | undefined);
  if (shape === 'scalar') { const v = vals[0]; return v == null ? null : v; }
  return vals.filter((v): v is string | number => v != null);
}

function numEq(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.005);
}

const unwrap = (v: Answer): string | number | (string | number)[] =>
  Array.isArray(v) && v.length === 1 ? v[0]! : v;

export function scoreAnswer(pred: Answer | null, gold: Answer, type: AnswerType): boolean {
  if (pred == null) return false;
  if (type === 'number') {
    const g = parseNumber(gold), p = parseNumber(unwrap(pred));
    return g != null && p != null && numEq(p, g);
  }
  if (type === 'string') {
    const p = unwrap(pred), g = unwrap(gold);
    if (Array.isArray(p) || Array.isArray(g)) return false;
    return normStr(p) === normStr(g);
  }
  const norm = (v: string | number) => (typeof v === 'number' ? String(v) : normStr(v));
  const P = (Array.isArray(pred) ? pred : [pred]).map(norm);
  const G = (Array.isArray(gold) ? gold : [gold]).map(norm);
  if (P.length !== G.length) return false;
  if (type === 'ordered_list') return P.every((v, i) => v === G[i]);
  return [...P].sort().join('\u0001') === [...G].sort().join('\u0001');
}
