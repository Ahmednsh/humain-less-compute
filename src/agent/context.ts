import type { DatabaseSync } from 'node:sqlite';
import { schemaToDdl, type SchemaInfo } from '../data/db.js';
import { glossaryFor } from './glossary.js';
import { FEWSHOTS, type FewShot } from './fewshots.js';

export type ContextMode = 'full' | 'pruned';
export interface AgentContext { mode: ContextMode; ddl: string; tables: string[]; glossary: string; fewshots: FewShot[] }

/** Trigger words (EN + AR) per table, beyond the table's own name and column names. */
export const SYNONYMS: Record<string, string[]> = {
  order_items: ['revenue', 'sales', 'units', 'sold', 'items', 'quantity', 'margin', 'discount', 'line', 'lines', 'aov', 'order value', 'إيراد', 'إيرادات', 'مبيعات', 'وحدات', 'كمية', 'هامش', 'خصم', 'بنود', 'عناصر', 'قيمة طلب'],
  returns: ['return', 'returned', 'returns', 'refund', 'refunds', 'مرتجع', 'مرتجعة', 'إرجاع', 'مسترد', 'مستردة', 'استرداد'],
  support_tickets: ['ticket', 'tickets', 'support', 'resolution', 'resolved', 'unresolved', 'تذكرة', 'تذاكر', 'دعم', 'حل'],
  shipments: ['ship', 'shipped', 'shipment', 'shipments', 'deliver', 'delivery', 'carrier', 'شحن', 'شحنة', 'شحنات', 'توصيل', 'تسليم', 'ناقل', 'نقلتها'],
  payments: ['payment', 'payments', 'paid', 'method', 'card', 'cash', 'wallet', 'bank transfer', 'دفع', 'دفعات', 'دفعة', 'مدفوع'],
  employees: ['employee', 'employees', 'rep', 'reps', 'manager', 'managers', 'staff', 'sales rep', 'account manager', 'support agent', 'handled', 'موظف', 'موظفين', 'موظفون', 'مندوب', 'مدير', 'مديرين', 'فريق'],
  customers: ['customer', 'customers', 'client', 'clients', 'segment', 'wholesale', 'retail', 'enterprise', 'registered', 'عميل', 'عملاء', 'شريحة', 'الجملة', 'التجزئة', 'الشركات'],
  products: ['product', 'products', 'sku', 'price', 'unit price', 'margin', 'cost', 'active', 'منتج', 'منتجات', 'سعر', 'تكلفة', 'رمزه'],
  categories: ['category', 'categories', 'فئة', 'فئات'],
  regions: ['region', 'regions', 'منطقة', 'مناطق'],
  cities: ['city', 'cities', 'located', 'based in', 'مدينة', 'مدن'],
  orders: ['order', 'orders', 'ordered', 'channel', 'status', 'cancelled', 'cancellation', 'delivered', 'pending', 'aov', 'order value', 'طلب', 'طلبات', 'طلباً', 'قناة', 'حالة', 'ملغاة', 'إلغاء', 'مسلّمة', 'مسلمة'],
};
const FALLBACK = ['customers', 'order_items', 'orders', 'products'];

export const tokenize = (q: string): string[] => (q.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).map(stripArabicPrefix);
/** Arabic questions glue "ال/و/ب/ل/ف" to the word; match both forms. */
function stripArabicPrefix(t: string): string { return t.replace(/^(?:و|ف|ب|ل|ك)?(?:ال)?(?=[؀-ۿ]{3,})/, ''); }

/** Known dimension values (region/city/category names) → the table they live in. Cheap schema linking by value. */
export type ValueIndex = Map<string, string[]>;
export function buildValueIndex(db: DatabaseSync): ValueIndex {
  const idx: ValueIndex = new Map();
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name));
  for (const [table, aliases] of [['regions', ['regions']], ['cities', ['cities']], ['categories', ['categories']]] as const) {
    const actual = aliases.find(a => tables.has(a)) ?? [...tables].find(t => t.includes(table.slice(0, 4)));
    if (!actual) continue;
    // a value can live in several tables (e.g. "Riyadh" is both a region and a city): keep all of them
    for (const r of db.prepare(`SELECT name FROM "${actual}"`).all() as { name: string }[]) { const k = r.name.toLowerCase(); idx.set(k, [...(idx.get(k) ?? []), actual]); }
  }
  return idx;
}

/** Lexical stage: tables whose name, columns, synonyms or known values appear in the question. No FK closure. */
export function matchTables(question: string, schema: SchemaInfo, values?: ValueIndex): string[] {
  const q = question.toLowerCase();
  const toks = new Set(tokenize(question));
  const hit = new Set<string>();
  if (values) for (const [v, tables] of values) if (q.includes(v)) for (const t of tables) hit.add(t);
  for (const t of schema.tables) {
    const words = [t.name, t.name.replace(/_/g, ' '), ...t.columns.filter(c => !/^id$|_id$/.test(c.name)).map(c => c.name), ...(SYNONYMS[t.name] ?? [])];
    for (const w of words) {
      const lw = w.toLowerCase();
      if (lw.includes(' ') ? q.includes(lw) : toks.has(lw) || toks.has(stripArabicPrefix(lw))) { hit.add(t.name); break; }
    }
  }
  return [...hit].sort();
}

/** Lexical matches plus the shortest FK paths that connect them, so every join is expressible. */
export function selectTables(question: string, schema: SchemaInfo, values?: ValueIndex): string[] {
  const matched = matchTables(question, schema, values);
  if (matched.length === 0) return FALLBACK.filter(n => schema.tables.some(t => t.name === n)).sort();
  const adj = new Map<string, Set<string>>();
  for (const t of schema.tables) adj.set(t.name, new Set());
  for (const t of schema.tables) for (const fk of t.fks) { adj.get(t.name)?.add(fk.table); adj.get(fk.table)?.add(t.name); }
  // Deterministic tie-break between equally short join paths: core business tables first, then alphabetical
  // (so "revenue by region" joins through customers, not employees). PRAGMA order is not stable enough.
  const rank = (n: string) => (FALLBACK.includes(n) ? `0${n}` : `1${n}`);
  for (const [k, v] of adj) adj.set(k, new Set([...v].sort((a, b) => rank(a).localeCompare(rank(b)))));
  const selected = new Set(matched);
  const anchor = matched[0]!;
  for (const target of matched.slice(1)) for (const n of shortestPath(adj, anchor, target)) selected.add(n);
  return [...selected].sort();
}

function shortestPath(adj: Map<string, Set<string>>, from: string, to: string): string[] {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of adj.get(cur) ?? []) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
  }
  if (!prev.has(to)) return [];
  const path: string[] = [];
  for (let n: string | null = to; n != null; n = prev.get(n) ?? null) path.push(n);
  return path;
}

function pickFewshots(question: string, k: number): FewShot[] {
  const toks = new Set(tokenize(question).filter(t => t.length > 2));
  return FEWSHOTS
    .map(f => ({ f, score: tokenize(f.q).filter(t => t.length > 2 && toks.has(t)).length }))
    .filter(x => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(x => x.f);
}

export function buildContext(question: string, schema: SchemaInfo, mode: ContextMode, values?: ValueIndex): AgentContext {
  if (mode === 'full') {
    const tables = schema.tables.map(t => t.name);
    return { mode, ddl: schemaToDdl(schema), tables, glossary: glossaryFor(null), fewshots: FEWSHOTS };
  }
  const tables = selectTables(question, schema, values);
  return { mode, ddl: schemaToDdl(schema, tables), tables, glossary: glossaryFor(question), fewshots: pickFewshots(question, 2) };
}
