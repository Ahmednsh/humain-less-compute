import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Row = Record<string, unknown>;
export interface TableInfo {
  name: string;
  columns: { name: string; type: string; pk: boolean }[];
  fks: { from: string; table: string; to: string }[];
}
export interface SchemaInfo { tables: TableInfo[] }
export type QueryResult =
  | { ok: true; rows: Row[]; columns: string[]; truncated: boolean }
  | { ok: false; error: string };

export function openDb(path: string, opts: { readOnly?: boolean } = {}): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: opts.readOnly ?? false });
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

export function createSchema(db: DatabaseSync): void {
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
}

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|pragma|attach|detach|vacuum|reindex|begin|commit|rollback)\b/i;

/** Returns null when the statement is a single read-only SELECT/WITH, else a reason. */
export function isSafeSelect(sql: string): string | null {
  const s = stripTrailingSemicolon(sql);
  if (s.includes(';')) return 'multiple statements are not allowed';
  if (!/^(select|with)\b/i.test(s)) return 'only SELECT statements are allowed';
  if (FORBIDDEN.test(s)) return 'statement contains a forbidden keyword';
  return null;
}

function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, '');
}

export function runReadOnly(db: DatabaseSync, sql: string, opts: { rowCap?: number } = {}): QueryResult {
  const guard = isSafeSelect(sql);
  if (guard) return { ok: false, error: guard };
  const cap = opts.rowCap ?? 200;
  try {
    const stmt = db.prepare(stripTrailingSemicolon(sql));
    const rows: Row[] = [];
    let truncated = false;
    for (const row of stmt.iterate() as Iterable<Row>) {
      if (rows.length >= cap) { truncated = true; break; }
      rows.push(row);
    }
    const first = rows[0];
    const columns = first ? Object.keys(first) : stmt.columns().map(c => c.name);
    return { ok: true, rows, columns, truncated };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function introspectSchema(db: DatabaseSync): SchemaInfo {
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(r => r.name);
  return {
    tables: names.map(name => ({
      name,
      columns: (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string; pk: number }[])
        .map(c => ({ name: c.name, type: c.type, pk: c.pk > 0 })),
      fks: (db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as { from: string; table: string; to: string }[])
        .map(f => ({ from: f.from, table: f.table, to: f.to })),
    })),
  };
}

export function schemaToDdl(info: SchemaInfo, tables?: string[]): string {
  const keep = tables ? new Set(tables) : null;
  return info.tables
    .filter(t => !keep || keep.has(t.name))
    .map(t => {
      const cols = t.columns.map(c => `  ${c.name} ${c.type}${c.pk ? ' PRIMARY KEY' : ''}`);
      const fks = t.fks.map(f => `  FOREIGN KEY (${f.from}) REFERENCES ${f.table}(${f.to})`);
      return `CREATE TABLE ${t.name} (\n${[...cols, ...fks].join(',\n')}\n);`;
    })
    .join('\n');
}
