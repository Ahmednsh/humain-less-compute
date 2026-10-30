import { describe, it, expect } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { ALL_TEMPLATES, type Template } from '../src/tasks/templates/index.js';
import { topIsUnique } from '../src/tasks/templates/shared.js';
import { fixtureDb } from './fixtures/fixture.js';
import { runReadOnly } from '../src/data/db.js';
import { createRng } from '../src/data/rng.js';
import { rowsToAnswer } from '../src/eval/score.js';

const by = (id: string): Template => { const t = ALL_TEMPLATES.find(x => x.id === id); if (!t) throw new Error(`missing template ${id}`); return t; };
const gold = (db: DatabaseSync, t: Template, sql: string) => {
  const r = runReadOnly(db, sql); if (!r.ok) throw new Error(`${t.id}: ${r.error}`);
  return rowsToAnswer(r.rows, t.answerType.includes('list') ? 'list' : 'scalar');
};
/** Sample until the instance's params satisfy `want`. */
function sampleWith(db: DatabaseSync, t: Template, want: (p: Record<string, string | number>) => boolean) {
  const rng = createRng(123);
  for (let i = 0; i < 400; i++) { const inst = t.sample(rng, db); if (inst && want(inst.params)) return inst; }
  throw new Error(`${t.id}: no sample matched`);
}

describe('templates', () => {
  it('has ≥ 30 templates, ≥ 8 dev templates per tier, 6 holdout-only, unique ids', () => {
    expect(ALL_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    for (const tier of [1, 2, 3]) expect(ALL_TEMPLATES.filter(x => x.tier === tier && !x.holdoutOnly).length, `tier ${tier}`).toBeGreaterThanOrEqual(8);
    expect(ALL_TEMPLATES.filter(x => x.holdoutOnly).length).toBe(6);
    expect(new Set(ALL_TEMPLATES.map(t => t.id)).size).toBe(ALL_TEMPLATES.length);
  });

  it('every template samples on the fixture; gold SQL runs and yields a non-null first-column answer', () => {
    const db = fixtureDb();
    for (const t of ALL_TEMPLATES) {
      const rng = createRng(11); let inst = null;
      for (let i = 0; i < 40 && !inst; i++) inst = t.sample(rng, db);
      expect(inst, t.id).not.toBeNull();
      expect(inst!.en.length, t.id).toBeGreaterThanOrEqual(2);
      expect(inst!.ar.length, t.id).toBeGreaterThanOrEqual(1);
      expect(t.tables.length, t.id).toBeGreaterThan(0);
      expect(gold(db, t, inst!.sql), t.id).not.toBeNull();
    }
  });

  it('hand-checked gold answers on the fixture', () => {
    const db = fixtureDb();
    // tier 1: retail customers = Cust One, Cust Three, Cust Five → 3
    let t = by('t1_count_customers_segment');
    expect(gold(db, t, sampleWith(db, t, p => p.segment === 'retail').sql)).toBe(3);
    // tier 2: delivered revenue, North, Q1 2024 = order 1 = 2×10 + 4×5 = 40
    t = by('t2_region_revenue_period');
    expect(gold(db, t, sampleWith(db, t, p => p.region === 'North' && p.quarter === 'Q1' && p.year === 2024).sql)).toBe(40);
    // tier 2: carrier SMSA average delivery days = (3 + 2 + 3) / 3 = 2.67
    t = by('t2_carrier_avg_delivery_days');
    expect(gold(db, t, sampleWith(db, t, p => p.carrier === 'SMSA').sql)).toBeCloseTo(2.67, 2);
    // tier 3: 2025 delivered revenue by category: Dairy 100 (order 5 Milk), Snacks 40+10+30 = 80 → second best = Snacks
    t = by('t3_second_best_category_revenue');
    expect(gold(db, t, sampleWith(db, t, p => p.year === 2025).sql)).toBe('Snacks');
    // tier 3: 2025 net revenue: Rep A = 40 + 30 = 70 (no refunds); Rep B = 110 − 50 refund = 60 → [Rep A, Rep B]
    t = by('t3_top3_employees_net_revenue');
    expect(gold(db, t, sampleWith(db, t, p => p.year === 2025).sql)).toEqual(['Rep A', 'Rep B']);
    // tier 3: 2025 return rate by month: 2025-04 1/2, 2025-06 1/1 → 2025-06
    t = by('t3_month_highest_return_rate');
    expect(gold(db, t, sampleWith(db, t, p => p.year === 2025).sql)).toBe('2025-06');
    // tier 3: customers created before 2026-01-01 with no orders on/after it: Cust One, Two, Four, Five → 4
    t = by('t3_customers_no_orders_since');
    expect(gold(db, t, sampleWith(db, t, p => p.date === '2026-01-01').sql)).toBe(4);
    // holdout: Q2 2025 refunds (50 + 40) / delivered revenue 110 is the highest ratio → Q2
    t = by('h3_quarter_highest_refund_ratio');
    expect(gold(db, t, sampleWith(db, t, p => p.year === 2025).sql)).toBe('Q2');
  });

  it('topIsUnique treats float near-ties as ties', () => {
    const db = fixtureDb();
    expect(topIsUnique(db, 'SELECT * FROM (SELECT \'a\' AS label, 0.1 + 0.2 AS metric UNION ALL SELECT \'b\', 0.3) ORDER BY metric DESC')).toBe(false);
    expect(topIsUnique(db, 'SELECT * FROM (SELECT \'a\' AS label, 0.31 AS metric UNION ALL SELECT \'b\', 0.3) ORDER BY metric DESC')).toBe(true);
  });
  it('superlative templates refuse ties', () => {
    const db = fixtureDb();
    // make Dairy and Snacks tie in 2025 delivered revenue: add Snacks 20 to order 9 → Snacks 100 = Dairy 100
    db.exec("INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, discount_pct) VALUES (99, 9, 4, 1, 20, 0)");
    const t = by('t3_second_best_category_revenue');
    const rng = createRng(5); let got = 0;
    for (let i = 0; i < 50; i++) { const inst = t.sample(rng, db); if (inst && inst.params.year === 2025) got++; }
    expect(got).toBe(0);
  });
});
