import { describe, it, expect } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { ALL_TEMPLATES, type Template } from '../src/tasks/templates/index.js';
import { topIsUnique, PERIODS } from '../src/tasks/templates/shared.js';
import { fixtureDb } from './fixtures/fixture.js';
import { runReadOnly } from '../src/data/db.js';
import { createRng } from '../src/data/rng.js';
import { rowsToAnswer } from '../src/eval/score.js';

const by = (id: string): Template => { const t = ALL_TEMPLATES.find(x => x.id === id); if (!t) throw new Error(`missing template ${id}`); return t; };
const gold = (db: DatabaseSync, t: Template, sql: string) => {
  const r = runReadOnly(db, sql); if (!r.ok) throw new Error(`${t.id}: ${r.error}`);
  return rowsToAnswer(r.rows, t.answerType.includes('list') ? 'list' : 'scalar');
};
type P = Record<string, string | number>;
/** Sample until the instance's params satisfy `want`, then return its gold answer. */
function goldFor(db: DatabaseSync, id: string, want: (p: P) => boolean) {
  const t = by(id); const rng = createRng(123);
  for (let i = 0; i < 2000; i++) { const inst = t.sample(rng, db); if (inst && want(inst.params)) return gold(db, t, inst.sql); }
  throw new Error(`${id}: no sample matched`);
}

describe('templates', () => {
  it('has ≥ 30 templates, ≥ 8 dev templates per tier, 6 holdout-only, unique ids', () => {
    expect(ALL_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    for (const tier of [1, 2, 3]) expect(ALL_TEMPLATES.filter(x => x.tier === tier && !x.holdoutOnly).length, `tier ${tier}`).toBeGreaterThanOrEqual(8);
    expect(ALL_TEMPLATES.filter(x => x.holdoutOnly).length).toBe(6);
    expect(new Set(ALL_TEMPLATES.map(t => t.id)).size).toBe(ALL_TEMPLATES.length);
  });

  it('periods: 14 per the two years, exclusive upper bounds, quarters contiguous', () => {
    expect(PERIODS.length).toBe(14);
    expect(PERIODS.find(p => p.label === 'Q4 2024')).toMatchObject({ from: '2024-10-01', to: '2025-01-01' });
    expect(PERIODS.find(p => p.label === 'H2 2025')).toMatchObject({ from: '2025-07-01', to: '2026-01-01' });
  });

  it('every template samples on the fixture; gold SQL runs and yields a non-null first-column answer', () => {
    const db = fixtureDb();
    for (const t of ALL_TEMPLATES) {
      const rng = createRng(11); let inst = null;
      for (let i = 0; i < 200 && !inst; i++) inst = t.sample(rng, db);
      expect(inst, t.id).not.toBeNull();
      expect(inst!.en.length, t.id).toBeGreaterThanOrEqual(2);
      expect(inst!.ar.length, t.id).toBeGreaterThanOrEqual(1);
      expect(t.tables.length, t.id).toBeGreaterThan(0);
      expect(gold(db, t, inst!.sql), t.id).not.toBeNull();
    }
  });

  it('hand-checked gold answers on the fixture — every template', () => {
    const db = fixtureDb();
    // ---- tier 1
    expect(goldFor(db, 't1_count_customers_segment', p => p.segment === 'retail')).toBe(3);          // Cust One, Three, Five
    expect(goldFor(db, 't1_product_price', p => p.sku === 'SKU-0003')).toBe(20);                      // Butter
    expect(goldFor(db, 't1_count_orders_status', p => p.status === 'delivered')).toBe(5);             // orders 1,2,4,5,9
    expect(goldFor(db, 't1_employees_role_city', p => p.role === 'sales_rep' && p.city === 'Riyadh')).toEqual(['Rep A']);
    expect(goldFor(db, 't1_count_products_category', p => p.category === 'Snacks')).toBe(2);          // Chips, Nuts (Butter inactive is Dairy)
    expect(goldFor(db, 't1_count_tickets_priority', p => p.priority === 'high' && p.period === '2024')).toBe(1);
    expect(goldFor(db, 't1_customer_city', p => p.customer === 'Cust Three')).toBe('Dammam');
    expect(goldFor(db, 't1_count_cities_region', p => p.region === 'North')).toBe(2);                 // Riyadh, Dammam
    expect(goldFor(db, 't1_max_unit_price_category', p => p.category === 'Dairy')).toBe(20);
    // ---- tier 2
    expect(goldFor(db, 't2_region_revenue_period', p => p.region === 'North' && p.period === 'Q1 2024')).toBe(40);   // order 1: 2×10 + 4×5
    expect(goldFor(db, 't2_top_category_units_year', p => p.period === '2025')).toBe('Snacks');                        // Snacks 5+2+6 = 13 vs Dairy 10
    expect(goldFor(db, 't2_channel_highest_aov', p => p.period === '2025')).toBe('web');                               // web (110+30)/2 = 70 vs phone 40
    expect(goldFor(db, 't2_customers_both_years', p => p.year_a === 2024 && p.year_b === 2025)).toBe(2);               // Cust One, Cust Two
    expect(goldFor(db, 't2_carrier_avg_delivery_days', p => p.carrier === 'SMSA')).toBeCloseTo(2.67, 2);               // (3 + 2 + 3) / 3
    expect(goldFor(db, 't2_payment_method_count', p => p.method === 'card' && p.period === '2025')).toBe(3);            // orders 5, 7, 9
    expect(goldFor(db, 't2_top_city_orders', p => p.period === '2025')).toBe('Riyadh');                               // orders 6, 7, 9
    expect(goldFor(db, 't2_segment_revenue_year', p => p.segment === 'wholesale' && p.period === '2025')).toBe(110);   // order 5
    expect(goldFor(db, 't2_open_tickets_topic', p => p.topic === 'account')).toBe(1);                                 // ticket 3
    // ---- tier 3
    expect(goldFor(db, 't3_top3_employees_net_revenue', p => p.period === '2025')).toEqual(['Rep A', 'Rep B']);        // 70 vs 110 − 50
    expect(goldFor(db, 't3_month_highest_return_rate', p => p.year === 2025)).toBe('2025-06');                         // 1/1 beats 2025-04's 1/2
    expect(goldFor(db, 't3_customers_slow_tickets_many_orders', p => p.min_orders === 3)).toBe(1);                     // Cust One: 36 h > 25.33 h, 3 orders
    expect(goldFor(db, 't3_region_yoy_growth', p => p.direction === 'highest' && p.window === 'full')).toBe('South');  // 18→110 (+511 %) vs 40→70 (+75 %)
    expect(goldFor(db, 't3_region_yoy_growth', p => p.direction === 'lowest' && p.window === 'full')).toBe('North');
    expect(goldFor(db, 't3_product_margin_rank', p => p.period === '2025')).toEqual(['Milk', 'Chips', 'Nuts']);        // 40, 24, 15
    expect(goldFor(db, 't3_customers_no_orders_since', p => p.date === '2026-01-01')).toBe(4);                         // One, Two, Four, Five
    expect(goldFor(db, 't3_segment_avg_items_per_order_max', p => p.period === '2025')).toBe('wholesale');             // 12 vs 6 vs 5
    expect(goldFor(db, 't3_employee_cancel_rate_max', p => p.period === '2024')).toBe('Rep A');                        // 1 of 2 cancelled
    expect(goldFor(db, 't3_second_best_category_revenue', p => p.period === '2025')).toBe('Snacks');                   // Dairy 100, Snacks 80
    // ---- holdout-only
    expect(goldFor(db, 'h1_count_shipments_carrier_year', p => p.carrier === 'SMSA' && p.period === '2025')).toBe(2);  // orders 4, 6
    expect(goldFor(db, 'h1_avg_discount_category', p => p.category === 'Dairy')).toBeCloseTo(1.67, 2);                  // items 1,3,4,6,8,10: (0+10+0+0+0+0)/6
    expect(goldFor(db, 'h2_city_most_urgent_tickets_year', p => p.period === '2025')).toBe('Jeddah');                   // ticket 2
    expect(goldFor(db, 'h2_segment_customers_per_region_max', p => p.segment === 'retail')).toBe('North');              // One, Three vs Five
    expect(goldFor(db, 'h3_quarter_highest_refund_ratio', p => p.year === 2025)).toBe('Q2');                            // (50+40)/110
    expect(goldFor(db, 'h3_managers_team_revenue_rank', p => p.period === '2025')).toEqual(['Mgr One']);                // 180
  });

  it('topIsUnique treats float near-ties as ties', () => {
    const db = fixtureDb();
    expect(topIsUnique(db, "SELECT * FROM (SELECT 'a' AS label, 0.1 + 0.2 AS metric UNION ALL SELECT 'b', 0.3) ORDER BY metric DESC")).toBe(false);
    expect(topIsUnique(db, "SELECT * FROM (SELECT 'a' AS label, 0.31 AS metric UNION ALL SELECT 'b', 0.3) ORDER BY metric DESC")).toBe(true);
  });

  it('superlative templates refuse ties', () => {
    const db = fixtureDb();
    // make Dairy and Snacks tie in 2025 delivered revenue: add Snacks 20 to order 9 → Snacks 100 = Dairy 100
    db.exec('INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, discount_pct) VALUES (99, 9, 4, 1, 20, 0)');
    const t = by('t3_second_best_category_revenue');
    const rng = createRng(5); let got = 0;
    for (let i = 0; i < 200; i++) { const inst = t.sample(rng, db); if (inst && inst.params.period === '2025') got++; }
    expect(got).toBe(0);
  });
});
