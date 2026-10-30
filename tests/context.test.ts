import { describe, it, expect } from 'vitest';
import { openDb, createSchema, introspectSchema } from '../src/data/db.js';
import { selectTables, matchTables, buildContext, buildValueIndex } from '../src/agent/context.js';
import { FEWSHOTS } from '../src/agent/fewshots.js';
import { runReadOnly } from '../src/data/db.js';
import { fixtureDb } from './fixtures/fixture.js';
import { applyRenameToDb, RENAME_MAP } from '../src/data/rename.js';

const schema = () => { const d = openDb(':memory:'); createSchema(d); return introspectSchema(d); };

describe('context', () => {
  it('selects relevant tables for a revenue-by-region question', () => {
    const t = selectTables('What was the total delivered revenue for the Asir region in Q2 2025?', schema());
    for (const n of ['orders', 'order_items', 'customers', 'cities', 'regions']) expect(t).toContain(n);
    expect(t).not.toContain('support_tickets'); expect(t).not.toContain('payments');
  });
  it('links known dimension values to their tables', () => {
    const db = fixtureDb(); const s = introspectSchema(db); const values = buildValueIndex(db);
    const q = 'How much revenue did delivered orders from customers in North generate during Q2 2025?';
    expect(selectTables(q, s)).not.toContain('regions');
    expect(selectTables(q, s, values)).toEqual(expect.arrayContaining(['regions', 'cities', 'customers', 'orders', 'order_items']));
    expect(buildContext('How many products are in Dairy?', s, 'pruned', values).tables).toEqual(['categories', 'products']);
  });
  it('survives schema drift: renamed tables inherit their concept synonyms', () => {
    const d = openDb(':memory:'); createSchema(d);
    applyRenameToDb(d, RENAME_MAP); const s = introspectSchema(d);
    const t = selectTables('What was the total delivered revenue from wholesale customers in 2025?', s);
    expect(t).toEqual(expect.arrayContaining(['clients', 'sales_orders', 'sales_order_lines']));
    expect(t).not.toContain('payments');
  });
  it('ignores arabic diacritics when matching', () => {
    const t = selectTables('كم عدد العملاء الذين قدّموا طلباً واحداً على الأقل في كلٍّ من عامي 2024 و2025؟', schema());
    expect(t).toEqual(expect.arrayContaining(['customers', 'orders']));
    expect(selectTables('أي شهر سجّل أعلى معدل إرجاع للطلبات المشحونة؟', schema())).toContain('shipments');
  });
  it('connects disconnected tables', () => {
    const t = selectTables('Which employee has the most refunds?', schema());
    for (const n of ['employees', 'returns', 'order_items', 'orders']) expect(t).toContain(n);
  });
  it('arabic question maps to tables', () => {
    expect(selectTables('كم عدد العملاء في منطقة الرياض؟', schema())).toEqual(expect.arrayContaining(['customers', 'cities', 'regions']));
  });
  it('falls back to the core tables when nothing matches', () => {
    expect(selectTables('hello there', schema())).toEqual(['customers', 'order_items', 'orders', 'products']);
  });
  it('matchTables is the lexical stage without the FK closure', () => {
    expect(matchTables('Which employee has the most refunds?', schema())).toEqual(expect.arrayContaining(['employees', 'returns']));
    expect(matchTables('Which employee has the most refunds?', schema())).not.toContain('orders');
  });
  it('pruned context is much smaller than full', () => {
    const q = 'How many customers are in the wholesale segment?'; const s = schema();
    const full = buildContext(q, s, 'full'), pruned = buildContext(q, s, 'pruned');
    expect(full.tables.length).toBe(12); expect(pruned.tables).toEqual(['customers']);
    expect(pruned.ddl.length * 3).toBeLessThan(full.ddl.length);
    expect(full.fewshots.length).toBe(9); expect(pruned.fewshots.length).toBeLessThanOrEqual(2);
    expect(full.glossary.length).toBeGreaterThan(pruned.glossary.length);
  });
  it('pruned glossary keeps the lines the question needs', () => {
    const s = schema();
    expect(buildContext('What was the net revenue of Rep A in 2025?', s, 'pruned').glossary).toMatch(/net revenue/i);
    expect(buildContext('How many cities are in Asir?', s, 'pruned').glossary).not.toMatch(/net revenue/i);
  });
  it('pruned glossary teaches half-open period filters for quarter/half questions', () => {
    const g = buildContext('How many support tickets with high priority were opened in Q3 2025?', schema(), 'pruned').glossary;
    expect(g).toMatch(/Q3 2025 = col >= '2025-07-01' AND col < '2025-10-01'/); expect(g).toMatch(/Never chain months with OR/);
    expect(buildContext('كم عدد التذاكر في النصف الأول من 2025؟', schema(), 'pruned').glossary).toMatch(/H1 2024/);
  });
  it('pruned few-shots include the quarter-range example for a quarter question', () => {
    const f = buildContext('How many support tickets with high priority were opened in Q3 2025?', schema(), 'pruned').fewshots;
    expect(f.some(x => x.sql.includes(">= '2025-04-01' AND paid_at < '2025-07-01'"))).toBe(true);
  });
  it('every few-shot SQL runs on the fixture', () => {
    const db = fixtureDb();
    for (const f of FEWSHOTS) { const r = runReadOnly(db, f.sql); expect(r.ok, `${f.q}: ${(r as { error?: string }).error}`).toBe(true); }
  });
});
