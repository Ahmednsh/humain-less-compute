import type { SchemaInfo } from '../data/db.js';
import { matchTables } from './context.js';

export interface RouterFeatures {
  tokens: number;
  /** number of distinct aggregation phrases (capped at 3) */
  agg: number;
  superlative: boolean;
  ratioGrowth: boolean;
  period: boolean;
  /** distinct schema tables the question mentions (lexical stage) */
  entities: number;
  comparative: boolean;
  money: boolean;
}

const AGG = [/\btotal\b/, /\bsum\b/, /\baverage\b/, /\bavg\b/, /\bcount\b/, /\bhow many\b/, /\bnumber of\b/, /\bmean\b/, /مجموع/, /إجمالي/, /متوسط/, /كم عدد/];
const SUPERLATIVE = [/\bmost\b/, /\bhighest\b/, /\btop\b/, /\blargest\b/, /\bbest\b/, /\bsecond\b/, /\bthird\b/, /\blowest\b/, /\bfewest\b/, /\brank/, /أعلى/, /أكثر/, /أكبر/, /أقل/, /ثاني/, /أفضل/, /رتّب/, /رتب/];
const RATIO_GROWTH = [/\brate\b/, /\bratio\b/, /\bgrowth\b/, /\bshare\b/, /\bpercent/, /\bmargin\b/, /\bnet\b/, /\brelative to\b/, /year-over-year/, /نسبة/, /نمو/, /هامش/, /صافي/, /معدل/];
const PERIOD = [/\b20\d\d\b/, /\bq[1-4]\b/, /\bmonth/, /\bquarter/, /\byear/, /شهر/, /ربع/, /سنة/, /سنوي/, /عام/];
const COMPARATIVE = [/\bboth\b/, /\bmore than\b/, /\bexceed/, /\babove the\b/, /\bper\b/, /\bfor each\b/, /\bat least\b/, /\bwho have\b/, /\bwith no\b/, /\bnot placed\b/, /\bhave not\b/, /على الأقل/, /أكثر من/, /يتجاوز/, /لكل/, /لم يقدّموا/, /لم يقدموا/, /ولديهم/];
const MONEY = [/\brevenue\b/, /\bmargin\b/, /\brefund/, /\baov\b/, /\border value\b/, /\bnet\b/, /إيراد/, /هامش/, /استرداد/, /مسترد/, /قيمة طلب/];

const count = (q: string, res: RegExp[]) => res.filter(r => r.test(q)).length;

export function routerFeatures(question: string, schema: SchemaInfo): RouterFeatures {
  const q = question.toLowerCase();
  return {
    tokens: (q.match(/[\p{L}\p{N}_]+/gu) ?? []).length,
    agg: Math.min(3, count(q, AGG)),
    superlative: count(q, SUPERLATIVE) > 0,
    ratioGrowth: count(q, RATIO_GROWTH) > 0,
    period: count(q, PERIOD) > 0,
    entities: matchTables(question, schema).length,
    comparative: count(q, COMPARATIVE) > 0,
    money: count(q, MONEY) > 0,
  };
}

export function difficultyScore(f: RouterFeatures): number {
  return f.agg + (f.superlative ? 1 : 0) + (f.ratioGrowth ? 2 : 0) + (f.period ? 1 : 0) + Math.max(0, f.entities - 2) + (f.comparative ? 2 : 0) + (f.tokens > 18 ? 1 : 0);
}

export interface RouteDecision { tier: 'small' | 'large'; score: number; features: RouterFeatures }

/** Zero-token router: lexical difficulty estimate → tier. */
export function route(question: string, schema: SchemaInfo, thetaHi: number): RouteDecision {
  const features = routerFeatures(question, schema);
  const score = difficultyScore(features);
  return { tier: score >= thetaHi ? 'large' : 'small', score, features };
}
