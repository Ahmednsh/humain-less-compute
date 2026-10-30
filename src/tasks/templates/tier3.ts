import { def, scalar, topIsUnique, topLabel, year, inPeriod, pickPeriod, REVENUE, YEARS, type Template } from './shared.js';

export const TIER3: Template[] = [
  def({
    id: 't3_top3_employees_net_revenue', tier: 3, answerType: 'ordered_list', moneyAggregate: true, tables: ['orders', 'order_items', 'employees', 'returns'],
    sample(rng, db) {
      const p = pickPeriod(rng);
      const ranked = `WITH rev AS (SELECT o.employee_id, SUM(${REVENUE}) AS r FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'delivered' AND ${inPeriod('o.order_date', p)} GROUP BY o.employee_id), ref AS (SELECT o.employee_id, SUM(rt.refund_amount) AS f FROM returns rt JOIN order_items oi ON oi.id = rt.order_item_id JOIN orders o ON o.id = oi.order_id WHERE o.status = 'delivered' AND ${inPeriod('o.order_date', p)} GROUP BY o.employee_id) SELECT e.name AS label, ROUND(rev.r - COALESCE(ref.f, 0), 2) AS metric FROM rev JOIN employees e ON e.id = rev.employee_id LEFT JOIN ref ON ref.employee_id = rev.employee_id ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked, 3)) return null;
      return { params: { period: p.label },
        en: [`Who were the top 3 employees by net revenue in ${p.label}? Net revenue is delivered revenue minus refunds on those delivered orders. List them in descending order.`, `Rank the three employees with the highest net revenue in ${p.label} (delivered order revenue minus refunds of returned items from those orders), best first.`],
        ar: [`من هم أفضل 3 موظفين من حيث صافي الإيرادات في ${p.ar} (إيرادات الطلبات المسلّمة ناقص المبالغ المستردة لتلك الطلبات)؟ رتّبهم تنازلياً.`], sql: topLabel(ranked, 3) };
    },
  }),
  def({
    id: 't3_month_highest_return_rate', tier: 3, answerType: 'string', tables: ['orders', 'order_items', 'shipments', 'returns'],
    sample(rng, db) {
      const y = rng.pick(YEARS);
      const ranked = `WITH shipped AS (SELECT substr(o.order_date, 1, 7) AS m, COUNT(oi.id) AS n FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN shipments s ON s.order_id = o.id WHERE ${year('o.order_date', y)} GROUP BY m), ret AS (SELECT substr(o.order_date, 1, 7) AS m, COUNT(rt.id) AS n FROM returns rt JOIN order_items oi ON oi.id = rt.order_item_id JOIN orders o ON o.id = oi.order_id WHERE ${year('o.order_date', y)} GROUP BY m) SELECT shipped.m AS label, 1.0 * COALESCE(ret.n, 0) / shipped.n AS metric FROM shipped LEFT JOIN ret ON ret.m = shipped.m ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked)) return null;
      return { params: { year: y },
        en: [`Which month of ${y} (format YYYY-MM, by order date) had the highest return rate, defined as returned items divided by order items of shipped orders?`, `In ${y}, which order month had the highest ratio of returned items to items in shipped orders? Answer as YYYY-MM.`],
        ar: [`ما الشهر (بصيغة YYYY-MM حسب تاريخ الطلب) في عام ${y} الذي سجّل أعلى معدل إرجاع، أي عدد العناصر المرتجعة مقسوماً على عناصر الطلبات المشحونة؟`], sql: topLabel(ranked) };
    },
  }),
  def({
    id: 't3_customers_slow_tickets_many_orders', tier: 3, answerType: 'number', tables: ['support_tickets', 'orders'],
    sample(rng) {
      const n = rng.pick([2, 3, 4, 5, 6, 8]);
      return { params: { min_orders: n },
        en: [`How many customers have an average ticket resolution time (hours between opened_at and closed_at, closed tickets only) above the overall average across all closed tickets, and have placed at least ${n} orders?`, `Count the customers with at least ${n} orders whose average support-ticket resolution time exceeds the average resolution time of all closed tickets.`],
        ar: [`كم عدد العملاء الذين يتجاوز متوسط زمن حل تذاكرهم (بالساعات، للتذاكر المغلقة فقط) المتوسط العام لجميع التذاكر المغلقة، ولديهم ${n} طلبات على الأقل؟`],
        sql: `WITH res AS (SELECT customer_id, AVG((julianday(closed_at) - julianday(opened_at)) * 24) AS h FROM support_tickets WHERE closed_at IS NOT NULL GROUP BY customer_id), overall AS (SELECT AVG((julianday(closed_at) - julianday(opened_at)) * 24) AS h FROM support_tickets WHERE closed_at IS NOT NULL), oc AS (SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY customer_id) SELECT COUNT(*) AS n FROM res JOIN oc ON oc.customer_id = res.customer_id WHERE res.h > (SELECT h FROM overall) AND oc.n >= ${n}` };
    },
  }),
  def({
    id: 't3_region_yoy_growth', tier: 3, answerType: 'string', moneyAggregate: true, tables: ['orders', 'order_items', 'customers', 'cities', 'regions'],
    sample(rng, db) {
      const dir = rng.pick(['highest', 'lowest'] as const);
      const win = rng.pick([{ key: 'full', en: '', ar: '', a: ['2024-01-01', '2025-01-01'], b: ['2025-01-01', '2026-01-01'] }, { key: 'H1', en: 'first-half ', ar: 'النصف الأول من ', a: ['2024-01-01', '2024-07-01'], b: ['2025-01-01', '2025-07-01'] }, { key: 'H2', en: 'second-half ', ar: 'النصف الثاني من ', a: ['2024-07-01', '2025-01-01'], b: ['2025-07-01', '2026-01-01'] }]);
      const period = (lo: string, hi: string) => `o.order_date >= '${lo}' AND o.order_date < '${hi}'`;
      const ranked = `WITH r AS (SELECT rg.name AS region, CASE WHEN ${period(win.a[0]!, win.a[1]!)} THEN 'a' ELSE 'b' END AS y, SUM(${REVENUE}) AS rev FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN customers c ON c.id = o.customer_id JOIN cities ci ON ci.id = c.city_id JOIN regions rg ON rg.id = ci.region_id WHERE o.status = 'delivered' AND ((${period(win.a[0]!, win.a[1]!)}) OR (${period(win.b[0]!, win.b[1]!)})) GROUP BY rg.name, y) SELECT a.region AS label, (b.rev - a.rev) / a.rev AS metric FROM r a JOIN r b ON b.region = a.region AND a.y = 'a' AND b.y = 'b' ORDER BY metric ${dir === 'highest' ? 'DESC' : 'ASC'}, label`;
      if (!topIsUnique(db, ranked)) return null;
      const span = win.key === 'full' ? 'from 2024 to 2025' : `comparing ${win.en}2025 with ${win.en}2024`;
      const spanAr = win.key === 'full' ? 'من 2024 إلى 2025' : `بمقارنة ${win.ar}2025 مع ${win.ar}2024`;
      return { params: { direction: dir, window: win.key },
        en: [`Which region had the ${dir} year-over-year growth in delivered revenue ${span}? (A decline is lower growth than any increase; do not use absolute change.)`, `${span.charAt(0).toUpperCase() + span.slice(1)}, which region had the ${dir === 'highest' ? 'strongest' : 'weakest'} percentage growth in delivered revenue? A decline counts as weaker growth than any increase.`],
        ar: [`ما المنطقة التي سجّلت ${dir === 'highest' ? 'أعلى' : 'أدنى'} نسبة نمو في إيرادات الطلبات المسلّمة ${spanAr}؟`], sql: topLabel(ranked) };
    },
  }),
  def({
    id: 't3_product_margin_rank', tier: 3, answerType: 'ordered_list', moneyAggregate: true, tables: ['orders', 'order_items', 'products'],
    sample(rng, db) {
      const p = pickPeriod(rng);
      const ranked = `SELECT p.name AS label, ROUND(SUM(${REVENUE} - oi.quantity * p.cost), 2) AS metric FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id WHERE o.status = 'delivered' AND ${inPeriod('o.order_date', p)} GROUP BY p.id ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked, 3)) return null;
      return { params: { period: p.label },
        en: [`What were the top 3 products by total margin in ${p.label}, where margin is line revenue minus quantity times product cost, delivered orders only? List product names, highest first.`, `Rank the three highest-margin products of ${p.label} (delivered orders; margin = revenue after discount − quantity × cost), best first.`],
        ar: [`ما أفضل 3 منتجات من حيث إجمالي هامش الربح في ${p.ar} (الطلبات المسلّمة فقط؛ الهامش = الإيراد بعد الخصم ناقص الكمية × التكلفة)؟ رتّبها من الأعلى.`], sql: topLabel(ranked, 3) };
    },
  }),
  def({
    id: 't3_customers_no_orders_since', tier: 3, answerType: 'number', tables: ['customers', 'orders'],
    sample(rng) {
      const d = rng.pick(['2024-07-01', '2025-01-01', '2025-04-01', '2025-07-01', '2025-10-01', '2026-01-01', '2026-04-01']);
      return { params: { date: d },
        en: [`How many customers who were created before ${d} have not placed any order on or after ${d}?`, `Count the customers registered before ${d} with no orders dated ${d} or later.`],
        ar: [`كم عدد العملاء الذين أُنشئت حساباتهم قبل ${d} ولم يقدّموا أي طلب في ${d} أو بعده؟`],
        sql: `SELECT COUNT(*) AS n FROM customers c WHERE c.created_at < '${d}' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.order_date >= '${d}')` };
    },
  }),
  def({
    id: 't3_segment_avg_items_per_order_max', tier: 3, answerType: 'string', tables: ['orders', 'order_items', 'customers'],
    sample(rng, db) {
      const p = pickPeriod(rng);
      const ranked = `SELECT c.segment AS label, 1.0 * SUM(oi.quantity) / COUNT(DISTINCT o.id) AS metric FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN customers c ON c.id = o.customer_id WHERE o.status = 'delivered' AND ${inPeriod('o.order_date', p)} GROUP BY c.segment ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked)) return null;
      return { params: { period: p.label },
        en: [`Which customer segment had the highest average number of units per delivered order in ${p.label}?`, `For delivered orders in ${p.label}, which segment's orders contained the most units on average (total quantity divided by number of orders)?`],
        ar: [`ما شريحة العملاء التي سجّلت أعلى متوسط لعدد الوحدات في الطلب المسلّم خلال ${p.ar}؟`], sql: topLabel(ranked) };
    },
  }),
  def({
    id: 't3_employee_cancel_rate_max', tier: 3, answerType: 'string', tables: ['orders', 'employees'],
    sample(rng, db) {
      const p = pickPeriod(rng);
      for (const n of [...rng.shuffle([5, 10, 20]), 3, 2, 1]) {
        const ranked = `SELECT e.name AS label, 1.0 * SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) / COUNT(*) AS metric FROM orders o JOIN employees e ON e.id = o.employee_id WHERE ${inPeriod('o.order_date', p)} GROUP BY e.id HAVING COUNT(*) >= ${n} ORDER BY metric DESC, label`;
        const qualifiers = scalar(db, `SELECT COUNT(*) FROM (${ranked})`) as number;
        if (qualifiers >= 2 && topIsUnique(db, ranked)) {
          return { params: { period: p.label, min_orders: n },
            en: [`Among employees who handled at least ${n} orders in ${p.label}, who had the highest cancellation rate (cancelled orders divided by all their orders in that period)?`, `Which employee with ${n} or more orders in ${p.label} had the largest share of cancelled orders?`],
            ar: [`من بين الموظفين الذين تعاملوا مع ${n} طلبات على الأقل في ${p.ar}، من صاحب أعلى معدل إلغاء (الطلبات الملغاة مقسومة على كل طلباته في تلك الفترة)؟`], sql: topLabel(ranked) };
        }
      }
      return null;
    },
  }),
  def({
    id: 't3_second_best_category_revenue', tier: 3, answerType: 'string', moneyAggregate: true, tables: ['orders', 'order_items', 'products', 'categories'],
    sample(rng, db) {
      const p = pickPeriod(rng);
      const ranked = `SELECT c.name AS label, SUM(${REVENUE}) AS metric FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id WHERE o.status = 'delivered' AND ${inPeriod('o.order_date', p)} GROUP BY c.id ORDER BY metric DESC, label`;
      if (!topIsUnique(db, ranked, 2)) return null;
      return { params: { period: p.label },
        en: [`Which product category had the second-highest delivered revenue in ${p.label}?`, `In ${p.label}, which category ranked number two by revenue from delivered orders?`],
        ar: [`ما فئة المنتجات التي احتلت المرتبة الثانية من حيث إيرادات الطلبات المسلّمة في ${p.ar}؟`],
        sql: `SELECT label FROM (SELECT label, metric, ROW_NUMBER() OVER (ORDER BY metric DESC, label) AS rn FROM (${ranked})) WHERE rn = 2` };
    },
  }),
];
