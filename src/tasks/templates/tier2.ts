import { def, esc, pickRow, scalar, topIsUnique, topLabel, year, REVENUE, QUARTERS, YEARS, SEGMENTS, METHODS, SEGMENT_AR, type Template } from './shared.js';

export const TIER2: Template[] = [
  def({
    id: 't2_region_revenue_period', tier: 2, answerType: 'number', moneyAggregate: true, tables: ['orders', 'order_items', 'customers', 'cities', 'regions'],
    sample(rng, db) {
      const r = pickRow<{ name: string }>(db, rng, 'SELECT name FROM regions'); if (!r) return null;
      const q = rng.pick(Object.keys(QUARTERS)); const y = rng.pick(YEARS); const [from, to] = QUARTERS[q]!;
      const sql = `SELECT ROUND(SUM(${REVENUE}), 2) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN customers c ON c.id = o.customer_id JOIN cities ci ON ci.id = c.city_id JOIN regions r ON r.id = ci.region_id WHERE o.status = 'delivered' AND r.name = '${esc(r.name)}' AND o.order_date BETWEEN '${y}-${from}' AND '${y}-${to}'`;
      if (scalar(db, sql) == null) return null;
      return { params: { region: r.name, quarter: q, year: y },
        en: [`What was the total delivered revenue for the ${r.name} region in ${q} ${y}?`, `How much revenue did delivered orders from customers in ${r.name} generate during ${q} ${y}?`],
        ar: [`كم إجمالي إيرادات الطلبات المسلّمة لعملاء منطقة ${r.name} خلال الربع ${q} من عام ${y}؟`], sql };
    },
  }),
  def({
    id: 't2_top_category_units_year', tier: 2, answerType: 'string', tables: ['orders', 'order_items', 'products', 'categories'],
    sample(rng, db) {
      const y = rng.pick(YEARS);
      const ranked = `SELECT c.name AS label, SUM(oi.quantity) AS metric FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id WHERE o.status = 'delivered' AND ${year('o.order_date', y)} GROUP BY c.id ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked)) return null;
      return { params: { year: y },
        en: [`Which product category sold the most units in delivered orders during ${y}?`, `In ${y}, which category had the highest total quantity sold (delivered orders only)?`],
        ar: [`ما فئة المنتجات التي بيع منها أكبر عدد من الوحدات في الطلبات المسلّمة خلال عام ${y}؟`], sql: topLabel(ranked) };
    },
  }),
  def({
    id: 't2_channel_highest_aov', tier: 2, answerType: 'string', moneyAggregate: true, tables: ['orders', 'order_items'],
    sample(rng, db) {
      const y = rng.pick(YEARS);
      const ranked = `SELECT o.channel AS label, SUM(${REVENUE}) / COUNT(DISTINCT o.id) AS metric FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'delivered' AND ${year('o.order_date', y)} GROUP BY o.channel ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked)) return null;
      return { params: { year: y },
        en: [`Which sales channel had the highest average order value for delivered orders in ${y}?`, `For delivered orders in ${y}, which channel's average order value (revenue per order) was the highest?`],
        ar: [`ما قناة البيع التي حققت أعلى متوسط قيمة طلب للطلبات المسلّمة في عام ${y}؟`], sql: topLabel(ranked) };
    },
  }),
  def({
    id: 't2_customers_both_years', tier: 2, answerType: 'number', tables: ['orders'],
    sample(rng) {
      const [a, b] = rng.pick([[2024, 2025], [2025, 2026], [2024, 2026]] as const);
      return { params: { year_a: a, year_b: b },
        en: [`How many distinct customers placed at least one order in both ${a} and ${b}?`, `Count the customers who ordered in ${a} and also ordered in ${b}.`],
        ar: [`كم عدد العملاء الذين قدّموا طلباً واحداً على الأقل في كلٍّ من عامي ${a} و${b}؟`],
        sql: `SELECT COUNT(*) AS n FROM (SELECT customer_id FROM orders WHERE substr(order_date, 1, 4) IN ('${a}', '${b}') GROUP BY customer_id HAVING COUNT(DISTINCT substr(order_date, 1, 4)) = 2)` };
    },
  }),
  def({
    id: 't2_carrier_avg_delivery_days', tier: 2, answerType: 'number', tables: ['shipments'],
    sample(rng, db) {
      const c = pickRow<{ carrier: string }>(db, rng, 'SELECT DISTINCT carrier FROM shipments WHERE delivered_at IS NOT NULL'); if (!c) return null;
      return { params: { carrier: c.carrier },
        en: [`What is the average number of days between shipping and delivery for shipments carried by ${c.carrier}?`, `On average, how many days did ${c.carrier} take from shipped_at to delivered_at (delivered shipments only)?`],
        ar: [`ما متوسط عدد الأيام بين الشحن والتسليم للشحنات التي نقلتها ${c.carrier}؟`],
        sql: `SELECT ROUND(AVG(julianday(delivered_at) - julianday(shipped_at)), 2) AS avg_days FROM shipments WHERE carrier = '${esc(c.carrier)}' AND delivered_at IS NOT NULL` };
    },
  }),
  def({
    id: 't2_payment_method_count', tier: 2, answerType: 'number', tables: ['payments'],
    sample(rng) {
      const m = rng.pick(METHODS); const y = rng.pick(YEARS);
      return { params: { method: m, year: y },
        en: [`How many payments were made by ${m.replace('_', ' ')} in ${y}?`, `In ${y}, what was the number of payments whose method is ${m}?`],
        ar: [`كم عدد الدفعات التي تمت بطريقة ${m} في عام ${y}؟`],
        sql: `SELECT COUNT(*) AS n FROM payments WHERE method = '${m}' AND ${year('paid_at', y)}` };
    },
  }),
  def({
    id: 't2_top_city_orders', tier: 2, answerType: 'string', tables: ['orders', 'customers', 'cities'],
    sample(rng, db) {
      const y = rng.pick(YEARS);
      const ranked = `SELECT ci.name AS label, COUNT(o.id) AS metric FROM orders o JOIN customers c ON c.id = o.customer_id JOIN cities ci ON ci.id = c.city_id WHERE ${year('o.order_date', y)} GROUP BY ci.id ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked)) return null;
      return { params: { year: y },
        en: [`Which city's customers placed the most orders in ${y}?`, `In ${y}, which customer city had the highest number of orders (any status)?`],
        ar: [`ما المدينة التي قدّم عملاؤها أكبر عدد من الطلبات في عام ${y}؟`], sql: topLabel(ranked) };
    },
  }),
  def({
    id: 't2_segment_revenue_year', tier: 2, answerType: 'number', moneyAggregate: true, tables: ['orders', 'order_items', 'customers'],
    sample(rng, db) {
      const s = rng.pick(SEGMENTS); const y = rng.pick(YEARS);
      const sql = `SELECT ROUND(SUM(${REVENUE}), 2) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN customers c ON c.id = o.customer_id WHERE o.status = 'delivered' AND c.segment = '${s}' AND ${year('o.order_date', y)}`;
      if (scalar(db, sql) == null) return null;
      return { params: { segment: s, year: y },
        en: [`What was the total delivered revenue from ${s} customers in ${y}?`, `How much revenue came from delivered orders of the ${s} segment during ${y}?`],
        ar: [`كم إجمالي إيرادات الطلبات المسلّمة من عملاء شريحة ${SEGMENT_AR[s]} في عام ${y}؟`], sql };
    },
  }),
  def({
    id: 't2_open_tickets_topic', tier: 2, answerType: 'number', tables: ['support_tickets'],
    sample(rng, db) {
      const t = pickRow<{ topic: string }>(db, rng, 'SELECT DISTINCT topic FROM support_tickets'); if (!t) return null;
      return { params: { topic: t.topic },
        en: [`How many support tickets about ${t.topic.replace('_', ' ')} are still open (not closed)?`, `Count the unresolved tickets whose topic is ${t.topic}.`],
        ar: [`كم عدد تذاكر الدعم المفتوحة (غير المغلقة) التي موضوعها ${t.topic}؟`],
        sql: `SELECT COUNT(*) AS n FROM support_tickets WHERE topic = '${esc(t.topic)}' AND closed_at IS NULL` };
    },
  }),
];
