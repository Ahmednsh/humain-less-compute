import type { DatabaseSync } from 'node:sqlite';
import { openDb, createSchema } from '../../src/data/db.js';

/**
 * Tiny hand-computed database. Every number used by tests/templates.test.ts
 * is derived from these rows by hand; see the comments.
 *
 * Regions: 1 North, 2 South.  Cities: 1 Riyadh(N), 2 Jeddah(S), 3 Dammam(N).
 * Categories: 1 Dairy, 2 Snacks.
 * Products: 1 Milk (Dairy, 10, cost 6, active) · 2 Chips (Snacks, 5, cost 2, active)
 *           3 Butter (Dairy, 20, cost 12, inactive) · 4 Nuts (Snacks, 8, cost 5, active)
 * Employees: 1 Mgr One (regional_manager, Riyadh) · 2 Rep A (sales_rep, Riyadh, mgr 1)
 *            3 Rep B (account_manager, Jeddah, mgr 1) · 4 Agent C (support_agent, Dammam, mgr 1)
 * Customers: 1 Cust One (Riyadh, retail, 2023-01-01) · 2 Cust Two (Jeddah, wholesale, 2023-06-01)
 *            3 Cust Three (Dammam, retail, 2024-06-01) · 4 Cust Four (Riyadh, enterprise, 2022-01-01)
 *            5 Cust Five (Jeddah, retail, 2025-03-01, no orders)
 * Orders (id: customer, employee, date, status, channel) and items (qty×price, discount):
 *   1: c1 e2 2024-02-10 delivered web   — Milk 2×10, Chips 4×5            → revenue 40  (North, 2024 Q1)
 *   2: c2 e3 2024-05-15 delivered store — Butter 1×20 at 10 % off         → revenue 18  (South, 2024 Q2)
 *   3: c1 e2 2024-08-20 cancelled web   — Milk 1×10
 *   4: c3 e2 2025-01-12 delivered phone — Nuts 5×8                        → revenue 40  (North, 2025 Q1)
 *   5: c2 e3 2025-04-18 delivered web   — Milk 10×10, Chips 2×5           → revenue 110 (South, 2025 Q2)
 *   6: c4 e3 2025-06-30 returned web    — Butter 2×20                     (not delivered)
 *   7: c1 e2 2025-09-05 shipped store   — Nuts 1×8                        (not delivered yet)
 *   8: c3 e2 2026-02-14 pending web     — Milk 1×10
 *   9: c4 e2 2025-11-20 delivered web   — Chips 6×5                       → revenue 30  (North, 2025 Q4)
 * Returns: item 8 (order 6) refund 40 on 2025-07-10 · item 6 (order 5, Milk) refund 50 on 2025-05-01
 * Shipments: o1 SMSA 3 days · o2 Aramex 4 days · o4 SMSA 2 days · o5 Naqel 6 days · o6 SMSA 3 days
 *            o7 DHL not delivered · o9 Aramex 2 days
 * Tickets: 1 c1 high delivery_delay 24 h · 2 c2 urgent damaged_item 4 h · 3 c3 medium account open
 *          4 c1 low billing 48 h   → overall average resolution = (24+4+48)/3 = 25.33 h
 */
export function fixtureDb(): DatabaseSync {
  const db = openDb(':memory:');
  createSchema(db);
  db.exec(`
    INSERT INTO regions (id, name) VALUES (1,'North'),(2,'South');
    INSERT INTO cities (id, name, region_id) VALUES (1,'Riyadh',1),(2,'Jeddah',2),(3,'Dammam',1);
    INSERT INTO categories (id, name) VALUES (1,'Dairy'),(2,'Snacks');
    INSERT INTO products (id, sku, name, category_id, unit_price, cost, active) VALUES
      (1,'SKU-0001','Milk',1,10,6,1),(2,'SKU-0002','Chips',2,5,2,1),(3,'SKU-0003','Butter',1,20,12,0),(4,'SKU-0004','Nuts',2,8,5,1);
    INSERT INTO employees (id, name, role, city_id, hired_at, manager_id) VALUES
      (1,'Mgr One','regional_manager',1,'2018-01-01',NULL),(2,'Rep A','sales_rep',1,'2020-01-01',1),
      (3,'Rep B','account_manager',2,'2021-01-01',1),(4,'Agent C','support_agent',3,'2022-01-01',1);
    INSERT INTO customers (id, name, city_id, segment, created_at) VALUES
      (1,'Cust One',1,'retail','2023-01-01'),(2,'Cust Two',2,'wholesale','2023-06-01'),(3,'Cust Three',3,'retail','2024-06-01'),
      (4,'Cust Four',1,'enterprise','2022-01-01'),(5,'Cust Five',2,'retail','2025-03-01');
    INSERT INTO orders (id, customer_id, employee_id, order_date, status, channel) VALUES
      (1,1,2,'2024-02-10','delivered','web'),(2,2,3,'2024-05-15','delivered','store'),(3,1,2,'2024-08-20','cancelled','web'),
      (4,3,2,'2025-01-12','delivered','phone'),(5,2,3,'2025-04-18','delivered','web'),(6,4,3,'2025-06-30','returned','web'),
      (7,1,2,'2025-09-05','shipped','store'),(8,3,2,'2026-02-14','pending','web'),(9,4,2,'2025-11-20','delivered','web');
    INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, discount_pct) VALUES
      (1,1,1,2,10,0),(2,1,2,4,5,0),(3,2,3,1,20,10),(4,3,1,1,10,0),(5,4,4,5,8,0),(6,5,1,10,10,0),(7,5,2,2,5,0),
      (8,6,3,2,20,0),(9,7,4,1,8,0),(10,8,1,1,10,0),(11,9,2,6,5,0);
    INSERT INTO payments (id, order_id, paid_at, method, amount) VALUES
      (1,1,'2024-02-11 10:00:00','card',40),(2,2,'2024-05-16 10:00:00','bank_transfer',18),(3,4,'2025-01-13 10:00:00','cash',40),
      (4,5,'2025-04-19 10:00:00','card',110),(5,6,'2025-07-01 10:00:00','wallet',40),(6,7,'2025-09-06 10:00:00','card',8),(7,9,'2025-11-21 10:00:00','card',30);
    INSERT INTO shipments (id, order_id, shipped_at, delivered_at, carrier) VALUES
      (1,1,'2024-02-11 09:00:00','2024-02-14 09:00:00','SMSA'),(2,2,'2024-05-16 09:00:00','2024-05-20 09:00:00','Aramex'),
      (3,4,'2025-01-13 09:00:00','2025-01-15 09:00:00','SMSA'),(4,5,'2025-04-19 09:00:00','2025-04-25 09:00:00','Naqel'),
      (5,6,'2025-07-01 09:00:00','2025-07-04 09:00:00','SMSA'),(6,7,'2025-09-06 09:00:00',NULL,'DHL'),(7,9,'2025-11-21 09:00:00','2025-11-23 09:00:00','Aramex');
    INSERT INTO returns (id, order_item_id, returned_at, reason, refund_amount) VALUES
      (1,8,'2025-07-10 09:00:00','damaged',40),(2,6,'2025-05-01 09:00:00','quality',50);
    INSERT INTO support_tickets (id, customer_id, order_id, opened_at, closed_at, priority, topic) VALUES
      (1,1,1,'2024-02-15 10:00:00','2024-02-16 10:00:00','high','delivery_delay'),(2,2,5,'2025-05-02 08:00:00','2025-05-02 12:00:00','urgent','damaged_item'),
      (3,3,NULL,'2025-02-01 09:00:00',NULL,'medium','account'),(4,1,3,'2024-09-01 09:00:00','2024-09-03 09:00:00','low','billing');
  `);
  return db;
}
