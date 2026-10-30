import { def, esc, pickRow, scalar, topIsUnique, topLabel, year, REVENUE, YEARS, SEGMENTS, SEGMENT_AR, type Template } from './shared.js';

/** Never used for dev-set generation; see the held-out protocol in the spec. */
export const HOLDOUT: Template[] = [
  def({
    id: 'h1_count_shipments_carrier_year', tier: 1, holdoutOnly: true, answerType: 'number', tables: ['shipments'],
    sample(rng, db) {
      const c = pickRow<{ carrier: string }>(db, rng, 'SELECT DISTINCT carrier FROM shipments'); if (!c) return null; const y = rng.pick(YEARS);
      const sql = `SELECT COUNT(*) AS n FROM shipments WHERE carrier = '${esc(c.carrier)}' AND ${year('shipped_at', y)}`;
      return { params: { carrier: c.carrier, year: y },
        en: [`How many shipments did ${c.carrier} ship in ${y}?`, `What is the number of shipments with carrier ${c.carrier} that were shipped during ${y}?`],
        ar: [`كم عدد الشحنات التي شحنتها ${c.carrier} في عام ${y}؟`], sql };
    },
  }),
  def({
    id: 'h1_avg_discount_category', tier: 1, holdoutOnly: true, answerType: 'number', tables: ['order_items', 'products', 'categories'],
    sample(rng, db) {
      const c = pickRow<{ name: string }>(db, rng, 'SELECT name FROM categories'); if (!c) return null;
      const sql = `SELECT ROUND(AVG(oi.discount_pct), 2) AS avg_discount FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id WHERE c.name = '${esc(c.name)}'`;
      if (scalar(db, sql) == null) return null;
      return { params: { category: c.name },
        en: [`What is the average discount percentage on order lines for products in the ${c.name} category?`, `Across all order items of ${c.name} products, what is the mean discount_pct?`],
        ar: [`ما متوسط نسبة الخصم على بنود الطلبات لمنتجات فئة ${c.name}؟`], sql };
    },
  }),
  def({
    id: 'h2_city_most_urgent_tickets_year', tier: 2, holdoutOnly: true, answerType: 'string', tables: ['support_tickets', 'customers', 'cities'],
    sample(rng, db) {
      const y = rng.pick(YEARS);
      const ranked = `SELECT ci.name AS label, COUNT(t.id) AS metric FROM support_tickets t JOIN customers c ON c.id = t.customer_id JOIN cities ci ON ci.id = c.city_id WHERE t.priority = 'urgent' AND ${year('t.opened_at', y)} GROUP BY ci.id ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked)) return null;
      return { params: { year: y },
        en: [`Which city's customers opened the most urgent-priority support tickets in ${y}?`, `In ${y}, customers from which city raised the largest number of urgent tickets?`],
        ar: [`ما المدينة التي فتح عملاؤها أكبر عدد من تذاكر الدعم ذات الأولوية العاجلة (urgent) في عام ${y}؟`], sql: topLabel(ranked) };
    },
  }),
  def({
    id: 'h2_segment_customers_per_region_max', tier: 2, holdoutOnly: true, answerType: 'string', tables: ['customers', 'cities', 'regions'],
    sample(rng, db) {
      const s = rng.pick(SEGMENTS);
      const ranked = `SELECT r.name AS label, COUNT(c.id) AS metric FROM customers c JOIN cities ci ON ci.id = c.city_id JOIN regions r ON r.id = ci.region_id WHERE c.segment = '${s}' GROUP BY r.id ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked)) return null;
      return { params: { segment: s },
        en: [`Which region has the most ${s} customers?`, `In which region is the number of customers in the ${s} segment the highest?`],
        ar: [`ما المنطقة التي فيها أكبر عدد من عملاء شريحة ${SEGMENT_AR[s]}؟`], sql: topLabel(ranked) };
    },
  }),
  def({
    id: 'h3_quarter_highest_refund_ratio', tier: 3, holdoutOnly: true, answerType: 'string', moneyAggregate: true, tables: ['orders', 'order_items', 'returns'],
    sample(rng, db) {
      const y = rng.pick(YEARS);
      const q = `CASE WHEN CAST(substr(o.order_date, 6, 2) AS INTEGER) <= 3 THEN 'Q1' WHEN CAST(substr(o.order_date, 6, 2) AS INTEGER) <= 6 THEN 'Q2' WHEN CAST(substr(o.order_date, 6, 2) AS INTEGER) <= 9 THEN 'Q3' ELSE 'Q4' END`;
      const ranked = `WITH rev AS (SELECT ${q} AS q, SUM(${REVENUE}) AS r FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'delivered' AND ${year('o.order_date', y)} GROUP BY q), ref AS (SELECT ${q} AS q, SUM(rt.refund_amount) AS f FROM returns rt JOIN order_items oi ON oi.id = rt.order_item_id JOIN orders o ON o.id = oi.order_id WHERE ${year('o.order_date', y)} GROUP BY q) SELECT rev.q AS label, COALESCE(ref.f, 0) / rev.r AS metric FROM rev LEFT JOIN ref ON ref.q = rev.q ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked)) return null;
      return { params: { year: y },
        en: [`Which quarter of ${y} had the highest ratio of refunds to delivered revenue? Group refunds by the quarter of the original order date.`, `In ${y}, in which quarter (by order date) were total refund amounts largest relative to delivered revenue?`],
        ar: [`أي ربع من عام ${y} سجّل أعلى نسبة للمبالغ المستردة إلى إيرادات الطلبات المسلّمة (مع تجميع المبالغ المستردة حسب ربع تاريخ الطلب الأصلي)؟`], sql: topLabel(ranked) };
    },
  }),
  def({
    id: 'h3_managers_team_revenue_rank', tier: 3, holdoutOnly: true, answerType: 'ordered_list', moneyAggregate: true, tables: ['orders', 'order_items', 'employees'],
    sample(rng, db) {
      const y = rng.pick(YEARS);
      const ranked = `SELECT m.name AS label, ROUND(SUM(${REVENUE}), 2) AS metric FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN employees e ON e.id = o.employee_id JOIN employees m ON m.id = e.manager_id WHERE o.status = 'delivered' AND ${year('o.order_date', y)} GROUP BY m.id ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked, 3)) return null;
      return { params: { year: y },
        en: [`Rank the top 3 managers by the total delivered revenue of the employees who report to them in ${y}, highest first.`, `Which three managers' direct reports generated the most delivered revenue in ${y}? List the managers best first.`],
        ar: [`رتّب أفضل 3 مديرين حسب إجمالي إيرادات الطلبات المسلّمة للموظفين التابعين لهم مباشرة في عام ${y}، من الأعلى.`], sql: topLabel(ranked, 3) };
    },
  }),
];
