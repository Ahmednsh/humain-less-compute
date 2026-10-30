import type { DatabaseSync } from 'node:sqlite';
import { introspectSchema } from './db.js';

/** Schema-drift experiment (R1): tables and columns the agent will see under new names. */
export interface RenameMap { tables: Record<string, string>; columns: Record<string, string> }

export const RENAME_MAP: RenameMap = {
  tables: { customers: 'clients', orders: 'sales_orders', order_items: 'sales_order_lines' },
  columns: { unit_price: 'price_per_unit', order_date: 'placed_on', segment: 'customer_tier', discount_pct: 'discount_percent' },
};

export function applyRenameToDb(db: DatabaseSync, map: RenameMap): void {
  const before = introspectSchema(db);
  for (const t of before.tables) {
    for (const c of t.columns) {
      const to = map.columns[c.name];
      if (to) db.exec(`ALTER TABLE "${t.name}" RENAME COLUMN "${c.name}" TO "${to}"`);
    }
  }
  for (const [from, to] of Object.entries(map.tables)) db.exec(`ALTER TABLE "${from}" RENAME TO "${to}"`);
}

/**
 * A view of a renamed database that still accepts SQL written against the original names.
 * Templates sample parameters through it; only `prepare` and `exec` are used.
 */
export function renamingDb(db: DatabaseSync, map: RenameMap): DatabaseSync {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare') return (sql: string) => target.prepare(applyRenameToSql(sql, map));
      if (prop === 'exec') return (sql: string) => target.exec(applyRenameToSql(sql, map));
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/** Word-boundary identifier replacement, longest names first so prefixes never clobber. */
export function applyRenameToSql(sql: string, map: RenameMap): string {
  const pairs = [...Object.entries(map.tables), ...Object.entries(map.columns)].sort((a, b) => b[0].length - a[0].length);
  let out = sql;
  for (const [from, to] of pairs) out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  return out;
}
