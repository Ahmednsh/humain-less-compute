import { describe, it, expect } from 'vitest';
import { openDb, createSchema, runReadOnly, introspectSchema, schemaToDdl } from '../src/data/db.js';

function mem() { const db = openDb(':memory:'); createSchema(db); return db; }

describe('db', () => {
  it('creates 12 tables and introspects fks', () => {
    const info = introspectSchema(mem());
    expect(info.tables.map(t => t.name).sort()).toEqual(['categories', 'cities', 'customers', 'employees', 'order_items', 'orders', 'payments', 'products', 'regions', 'returns', 'shipments', 'support_tickets']);
    const orders = info.tables.find(t => t.name === 'orders')!;
    expect(orders.fks).toContainEqual({ from: 'customer_id', table: 'customers', to: 'id' });
  });
  it('schemaToDdl can restrict to tables and keeps CHECK/NOT NULL constraints', () => {
    const ddl = schemaToDdl(introspectSchema(mem()), ['regions']);
    expect(ddl).toContain('CREATE TABLE regions');
    expect(ddl).not.toContain('CREATE TABLE cities');
    const orders = schemaToDdl(introspectSchema(mem()), ['orders']);
    expect(orders).toMatch(/CHECK \(status IN \('pending','shipped','delivered','cancelled','returned'\)\)/);
    expect(orders).toMatch(/customer_id INTEGER NOT NULL REFERENCES customers\(id\)/);
  });
  it('schemaToDdl reflects renamed tables and columns', () => {
    const db = mem();
    db.exec('ALTER TABLE orders RENAME COLUMN order_date TO placed_on'); db.exec('ALTER TABLE orders RENAME TO sales_orders');
    const ddl = schemaToDdl(introspectSchema(db), ['sales_orders']);
    expect(ddl).toContain('CREATE TABLE "sales_orders"'); expect(ddl).toContain('placed_on'); expect(ddl).not.toMatch(/\border_date\b/);
  });
  it('runs a select and caps rows', () => {
    const db = mem(); db.exec("INSERT INTO regions(name) VALUES ('a'),('b'),('c')");
    const r = runReadOnly(db, 'SELECT name FROM regions ORDER BY id', { rowCap: 2 });
    expect(r.ok && r.rows.length === 2 && r.truncated).toBe(true);
  });
  it('rejects writes and multi-statements', () => {
    const db = mem();
    for (const sql of ['DELETE FROM regions', 'UPDATE regions SET name=1', 'DROP TABLE regions', 'PRAGMA foreign_keys=0', "ATTACH 'x' AS y", 'SELECT 1; DELETE FROM regions', 'INSERT INTO regions(name) VALUES (1)']) {
      const r = runReadOnly(db, sql); expect(r.ok, sql).toBe(false);
    }
    expect(runReadOnly(db, 'WITH t AS (SELECT 1 AS x) SELECT x FROM t').ok).toBe(true);
    expect(runReadOnly(db, 'SELECT 1;').ok).toBe(true);
  });
  it('returns sql errors as values', () => {
    const r = runReadOnly(mem(), 'SELECT nope FROM regions');
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/no such column/);
  });
  it('reports column names even for empty results', () => {
    const r = runReadOnly(mem(), 'SELECT name AS n FROM regions');
    expect(r.ok && r.columns).toEqual(['n']);
  });
});
