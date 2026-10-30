import { describe, it, expect } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDb, createSchema } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';

const small = { customers: 30, products: 20, employees: 8, orders: 200, tickets: 40 };
function build(seed: number) { const db = openDb(':memory:'); createSchema(db); const counts = generateCompany(db, seed, small); return { db, counts }; }
const q = (db: DatabaseSync, sql: string) => db.prepare(sql).get() as Record<string, number>;

describe('generateCompany', () => {
  it('produces the requested counts and nonempty children', () => {
    const { db, counts } = build(1);
    expect(counts.orders).toBe(200); expect(counts.customers).toBe(30);
    expect(q(db, 'SELECT COUNT(*) c FROM order_items').c).toBeGreaterThan(200);
    expect(q(db, 'SELECT COUNT(*) c FROM returns').c).toBeGreaterThan(0);
    expect(q(db, 'SELECT COUNT(*) c FROM shipments WHERE delivered_at IS NULL').c).toBeGreaterThan(0);
    expect(q(db, 'SELECT COUNT(*) c FROM support_tickets WHERE closed_at IS NULL').c).toBeGreaterThan(0);
  });
  it('is deterministic', () => {
    const a = build(9).db, b = build(9).db;
    const dump = (db: DatabaseSync) => db.prepare('SELECT * FROM order_items ORDER BY id').all();
    expect(dump(a)).toEqual(dump(b));
    expect(dump(build(10).db)).not.toEqual(dump(a));
  });
  it('keeps referential integrity and the date range', () => {
    const { db } = build(2);
    expect(db.prepare('PRAGMA foreign_key_check').all().length).toBe(0);
    expect(q(db, "SELECT COUNT(*) c FROM orders WHERE order_date < '2024-01-01' OR order_date > '2026-09-30'").c).toBe(0);
  });
  it('spreads order statuses and every month has orders', () => {
    const { db } = build(3);
    expect(q(db, 'SELECT COUNT(DISTINCT status) c FROM orders').c).toBe(5);
    expect(q(db, 'SELECT COUNT(DISTINCT substr(order_date,1,7)) c FROM orders').c).toBeGreaterThanOrEqual(30);
  });
  it('employee and product names are unique', () => {
    const db = openDb(':memory:'); createSchema(db);
    generateCompany(db, 6, { ...small, employees: 60, products: 200, orders: 50 });
    expect(q(db, 'SELECT COUNT(*) - COUNT(DISTINCT name) c FROM employees').c).toBe(0);
    expect(q(db, 'SELECT COUNT(*) - COUNT(DISTINCT name) c FROM products').c).toBe(0);
  });
  it('refunds are priced from the returned item', () => {
    const { db } = build(4);
    const bad = q(db, 'SELECT COUNT(*) c FROM returns r JOIN order_items oi ON oi.id = r.order_item_id WHERE r.refund_amount > oi.quantity * oi.unit_price + 0.01').c;
    expect(bad).toBe(0);
  });
});
