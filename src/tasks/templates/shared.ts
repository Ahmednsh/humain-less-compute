import type { DatabaseSync } from 'node:sqlite';
import type { Rng } from '../../data/rng.js';
import type { AnswerType, Tier } from '../types.js';

export interface TemplateInstance {
  params: Record<string, string | number>;
  en: string[];
  ar: string[];
  sql: string;
}
export interface Template {
  id: string;
  tier: Tier;
  answerType: AnswerType;
  holdoutOnly?: boolean;
  moneyAggregate?: boolean;
  /** Tables the gold SQL touches (used to measure pruner recall). */
  tables: string[];
  sample(rng: Rng, db: DatabaseSync): TemplateInstance | null;
}

/** Line revenue as defined in the glossary. Alias `oi` for order_items. */
export const REVENUE = 'oi.quantity * oi.unit_price * (1 - oi.discount_pct / 100.0)';
export const YEARS = [2024, 2025] as const;
export const SEGMENTS = ['retail', 'wholesale', 'enterprise'] as const;
export const STATUSES = ['pending', 'shipped', 'delivered', 'cancelled', 'returned'] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const METHODS = ['card', 'bank_transfer', 'cash', 'wallet'] as const;
export const ROLE_LABEL: Record<string, string> = { sales_rep: 'sales rep', account_manager: 'account manager', support_agent: 'support agent', regional_manager: 'regional manager' };
export const ROLE_LABEL_AR: Record<string, string> = { sales_rep: 'مندوب مبيعات', account_manager: 'مدير حسابات', support_agent: 'موظف دعم', regional_manager: 'مدير إقليمي' };
export const SEGMENT_AR: Record<string, string> = { retail: 'التجزئة', wholesale: 'الجملة', enterprise: 'الشركات' };
export const STATUS_AR: Record<string, string> = { pending: 'قيد الانتظار', shipped: 'مشحونة', delivered: 'مسلّمة', cancelled: 'ملغاة', returned: 'مرتجعة' };

export const esc = (s: string | number): string => String(s).replace(/'/g, "''");
export const year = (col: string, y: number | string) => `substr(${col}, 1, 4) = '${y}'`;

/** A calendar period: full year, half or quarter. `to` is exclusive so the filter works for dates and timestamps alike. */
export interface Period { label: string; ar: string; from: string; to: string }
const AR_Q = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'];
export const PERIODS: Period[] = YEARS.flatMap(y => [
  { label: `${y}`, ar: `عام ${y}`, from: `${y}-01-01`, to: `${y + 1}-01-01` },
  { label: `H1 ${y}`, ar: `النصف الأول من ${y}`, from: `${y}-01-01`, to: `${y}-07-01` },
  { label: `H2 ${y}`, ar: `النصف الثاني من ${y}`, from: `${y}-07-01`, to: `${y + 1}-01-01` },
  ...[1, 2, 3, 4].map(q => ({ label: `Q${q} ${y}`, ar: `${AR_Q[q - 1]} من ${y}`, from: `${y}-${String(3 * q - 2).padStart(2, '0')}-01`, to: q === 4 ? `${y + 1}-01-01` : `${y}-${String(3 * q + 1).padStart(2, '0')}-01` })),
]);
export const inPeriod = (col: string, p: Period) => `${col} >= '${p.from}' AND ${col} < '${p.to}'`;
export const pickPeriod = (rng: Rng): Period => rng.pick(PERIODS);

export function pickRow<T extends Record<string, unknown>>(db: DatabaseSync, rng: Rng, sql: string): T | null {
  const rows = db.prepare(sql).all() as T[];
  return rows.length ? rng.pick(rows) : null;
}
export function scalar(db: DatabaseSync, sql: string): unknown {
  const r = db.prepare(sql).get() as Record<string, unknown> | undefined;
  return r ? Object.values(r)[0] : null;
}
/**
 * For superlative questions: `rankedSql` must return (label, metric) ordered by metric DESC.
 * Returns true when the top `k` entries exist and no tie touches the k-th position.
 */
export function topIsUnique(db: DatabaseSync, rankedSql: string, k = 1): boolean {
  const rows = db.prepare(`SELECT * FROM (${rankedSql}) LIMIT ${k + 1}`).all() as { label: unknown; metric: unknown }[];
  if (rows.length < 1 || rows[0]!.label == null) return false;
  // Float metrics summed in a different order can differ in the last bits: treat near-equal as a tie.
  const same = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);
  const take = Math.min(k, rows.length);
  for (let i = 1; i < take; i++) if (same(rows[i]!.metric, rows[i - 1]!.metric)) return false;
  if (rows.length > take && same(rows[take]!.metric, rows[take - 1]!.metric)) return false;
  return true;
}
export const topLabel = (rankedSql: string, k = 1) => `SELECT label FROM (${rankedSql}) LIMIT ${k}`;
export const def = (t: Template): Template => t;
