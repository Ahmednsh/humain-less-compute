import { describe, it, expect } from 'vitest';
import { openDb, createSchema, runReadOnly, introspectSchema } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';
import { generateTasks } from '../src/tasks/generate.js';
import { RENAME_MAP, applyRenameToDb, applyRenameToSql } from '../src/data/rename.js';

function db() {
  const d = openDb(':memory:'); createSchema(d);
  generateCompany(d, 5, { customers: 60, products: 30, employees: 10, orders: 600, tickets: 80 });
  return d;
}

describe('generateTasks', () => {
  it('balances tiers, excludes holdout templates, is deterministic', () => {
    const d = db();
    const a = generateTasks(d, { seed: 1, n: 30, holdout: false, lang: 'en' });
    expect(a.length).toBe(30);
    for (const t of [1, 2, 3]) expect(a.filter(x => x.tier === t).length, `tier ${t}`).toBe(10);
    expect(a.some(x => x.templateId.startsWith('h'))).toBe(false);
    expect(generateTasks(d, { seed: 1, n: 30, holdout: false, lang: 'en' })).toEqual(a);
    expect(generateTasks(d, { seed: 2, n: 30, holdout: false, lang: 'en' })).not.toEqual(a);
    expect(a.every(x => x.gold != null && x.question.length > 10 && x.goldSql.length > 10)).toBe(true);
    expect(new Set(a.map(x => x.id)).size).toBe(30);
    expect(a.every(x => !('tables' in x))).toBe(true);
  });
  it('uses the tier-1..3 templates round-robin so every dev template appears', () => {
    const d = db();
    const a = generateTasks(d, { seed: 3, n: 27, holdout: false, lang: 'en' });
    expect(new Set(a.map(x => x.templateId)).size).toBe(27);
  });
  it('holdout includes holdout-only templates and arabic uses arabic text', () => {
    const d = db();
    const h = generateTasks(d, { seed: 2, n: 66, holdout: true, lang: 'ar' });
    expect(h.some(x => x.templateId.startsWith('h'))).toBe(true);
    expect(h.every(x => /[؀-ۿ]/.test(x.question) && x.lang === 'ar')).toBe(true);
  });
  it('renamed schema keeps gold answers identical', () => {
    const d1 = db();
    const base = generateTasks(d1, { seed: 3, n: 15, holdout: false, lang: 'en' });
    const d2 = db(); applyRenameToDb(d2, RENAME_MAP);
    const names = introspectSchema(d2).tables.map(t => t.name);
    expect(names).toContain('clients'); expect(names).not.toContain('customers');
    const renamed = generateTasks(d2, { seed: 3, n: 15, holdout: false, lang: 'en', rename: RENAME_MAP });
    expect(renamed.map(t => t.gold)).toEqual(base.map(t => t.gold));
    expect(renamed.some(t => /\bcustomers\b|\border_items\b|\bunit_price\b/.test(t.goldSql))).toBe(false);
    for (const t of renamed) { const r = runReadOnly(d2, t.goldSql); expect(r.ok, t.id).toBe(true); }
    expect(applyRenameToSql('SELECT unit_price FROM order_items oi', RENAME_MAP)).toBe('SELECT price_per_unit FROM sales_order_lines oi');
  });
});
