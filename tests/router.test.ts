import { describe, it, expect } from 'vitest';
import { openDb, createSchema, introspectSchema } from '../src/data/db.js';
import { routerFeatures, difficultyScore, route } from '../src/agent/router.js';

const schema = () => { const d = openDb(':memory:'); createSchema(d); return introspectSchema(d); };
const easy = 'How many customers are in the wholesale segment?';
const hard = 'Which region had the highest year-over-year growth in delivered revenue from 2024 to 2025?';
const hardAr = 'ما المنطقة التي حققت أعلى نسبة نمو سنوي في إيرادات الطلبات المسلّمة من 2024 إلى 2025؟';

describe('router', () => {
  it('scores an easy lookup low and routes it small', () => {
    const s = schema(); const f = routerFeatures(easy, s);
    expect(difficultyScore(f)).toBeLessThanOrEqual(2);
    expect(route(easy, s, 4).tier).toBe('small');
  });
  it('scores a growth ranking high and routes it large', () => {
    const s = schema(); const f = routerFeatures(hard, s);
    expect(f.superlative).toBe(true); expect(f.ratioGrowth).toBe(true); expect(f.period).toBe(true); expect(f.entities).toBeGreaterThanOrEqual(3);
    expect(difficultyScore(f)).toBeGreaterThanOrEqual(5);
    expect(route(hard, s, 4).tier).toBe('large');
  });
  it('handles arabic', () => {
    const r = route(hardAr, schema(), 4);
    expect(r.tier).toBe('large'); expect(r.score).toBeGreaterThanOrEqual(4);
  });
  it('flags money questions', () => {
    const s = schema();
    expect(routerFeatures('What was the total delivered revenue in Asir in 2025?', s).money).toBe(true);
    expect(routerFeatures('How many cities are in the Asir region?', s).money).toBe(false);
  });
  it('threshold is respected', () => {
    const s = schema(); const score = route(hard, s, 4).score;
    expect(route(hard, s, score + 1).tier).toBe('small'); expect(route(hard, s, score).tier).toBe('large');
  });
  it('the router costs no tokens: it is a pure function of the question', () => {
    const s = schema(); expect(route(easy, s, 4)).toEqual(route(easy, s, 4));
  });
});
