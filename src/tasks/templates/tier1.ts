import { def, esc, pickRow, year, SEGMENTS, STATUSES, PRIORITIES, ROLE_LABEL, ROLE_LABEL_AR, SEGMENT_AR, STATUS_AR, YEARS, type Template } from './shared.js';

export const TIER1: Template[] = [
  def({
    id: 't1_count_customers_segment', tier: 1, answerType: 'number', tables: ['customers'],
    sample(rng) {
      const segment = rng.pick(SEGMENTS);
      return { params: { segment },
        en: [`How many customers are in the ${segment} segment?`, `What is the number of ${segment} customers?`, `Count the customers whose segment is ${segment}.`],
        ar: [`كم عدد العملاء في شريحة ${SEGMENT_AR[segment]}؟`],
        sql: `SELECT COUNT(*) AS n FROM customers WHERE segment = '${segment}'` };
    },
  }),
  def({
    id: 't1_product_price', tier: 1, answerType: 'number', tables: ['products'],
    sample(rng, db) {
      const p = pickRow<{ sku: string }>(db, rng, 'SELECT sku FROM products'); if (!p) return null;
      return { params: { sku: p.sku },
        en: [`What is the unit price of the product with SKU ${p.sku}?`, `How much does product ${p.sku} cost per unit (unit price)?`],
        ar: [`ما سعر الوحدة للمنتج الذي رمزه ${p.sku}؟`],
        sql: `SELECT unit_price FROM products WHERE sku = '${esc(p.sku)}'` };
    },
  }),
  def({
    id: 't1_count_orders_status', tier: 1, answerType: 'number', tables: ['orders'],
    sample(rng) {
      const status = rng.pick(STATUSES);
      return { params: { status },
        en: [`How many orders have the status ${status}?`, `What is the total number of ${status} orders?`],
        ar: [`كم عدد الطلبات التي حالتها ${STATUS_AR[status]} (${status})؟`],
        sql: `SELECT COUNT(*) AS n FROM orders WHERE status = '${status}'` };
    },
  }),
  def({
    id: 't1_employees_role_city', tier: 1, answerType: 'list', tables: ['employees', 'cities'],
    sample(rng, db) {
      const r = pickRow<{ role: string; city: string }>(db, rng, 'SELECT e.role AS role, c.name AS city FROM employees e JOIN cities c ON c.id = e.city_id GROUP BY e.role, c.name'); if (!r) return null;
      return { params: { role: r.role, city: r.city },
        en: [`List the names of employees whose role is ${r.role} and who are based in ${r.city}.`, `Which employees are ${ROLE_LABEL[r.role]}s located in ${r.city}? Give their names.`],
        ar: [`اذكر أسماء الموظفين الذين دورهم ${ROLE_LABEL_AR[r.role]} (${r.role}) في مدينة ${r.city}.`],
        sql: `SELECT e.name FROM employees e JOIN cities c ON c.id = e.city_id WHERE e.role = '${r.role}' AND c.name = '${esc(r.city)}' ORDER BY e.name` };
    },
  }),
  def({
    id: 't1_count_products_category', tier: 1, answerType: 'number', tables: ['products', 'categories'],
    sample(rng, db) {
      const c = pickRow<{ name: string }>(db, rng, 'SELECT name FROM categories'); if (!c) return null;
      return { params: { category: c.name },
        en: [`How many active products are in the ${c.name} category?`, `Count the products in category ${c.name} that are currently active.`],
        ar: [`كم عدد المنتجات النشطة في فئة ${c.name}؟`],
        sql: `SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = '${esc(c.name)}' AND p.active = 1` };
    },
  }),
  def({
    id: 't1_count_tickets_priority', tier: 1, answerType: 'number', tables: ['support_tickets'],
    sample(rng) {
      const priority = rng.pick(PRIORITIES); const y = rng.pick(YEARS);
      return { params: { priority, year: y },
        en: [`How many support tickets with ${priority} priority were opened in ${y}?`, `In ${y}, how many ${priority}-priority tickets were opened?`],
        ar: [`كم عدد تذاكر الدعم ذات الأولوية ${priority} التي فُتحت في عام ${y}؟`],
        sql: `SELECT COUNT(*) AS n FROM support_tickets WHERE priority = '${priority}' AND ${year('opened_at', y)}` };
    },
  }),
  def({
    id: 't1_customer_city', tier: 1, answerType: 'string', tables: ['customers', 'cities'],
    sample(rng, db) {
      const c = pickRow<{ name: string }>(db, rng, 'SELECT name FROM customers GROUP BY name HAVING COUNT(*) = 1'); if (!c) return null;
      return { params: { customer: c.name },
        en: [`In which city is the customer "${c.name}" located?`, `What city does the customer ${c.name} belong to?`],
        ar: [`في أي مدينة يقع العميل "${c.name}"؟`],
        sql: `SELECT ci.name FROM customers cu JOIN cities ci ON ci.id = cu.city_id WHERE cu.name = '${esc(c.name)}'` };
    },
  }),
  def({
    id: 't1_count_cities_region', tier: 1, answerType: 'number', tables: ['cities', 'regions'],
    sample(rng, db) {
      const r = pickRow<{ name: string }>(db, rng, 'SELECT name FROM regions'); if (!r) return null;
      return { params: { region: r.name },
        en: [`How many cities are in the ${r.name} region?`, `What is the number of cities that belong to the region ${r.name}?`],
        ar: [`كم عدد المدن في منطقة ${r.name}؟`],
        sql: `SELECT COUNT(*) AS n FROM cities ci JOIN regions r ON r.id = ci.region_id WHERE r.name = '${esc(r.name)}'` };
    },
  }),
  def({
    id: 't1_max_unit_price_category', tier: 1, answerType: 'number', tables: ['products', 'categories'],
    sample(rng, db) {
      const c = pickRow<{ name: string }>(db, rng, 'SELECT name FROM categories'); if (!c) return null;
      return { params: { category: c.name },
        en: [`What is the highest unit price among products in the ${c.name} category?`, `What is the most expensive unit price in category ${c.name}?`],
        ar: [`ما أعلى سعر وحدة بين منتجات فئة ${c.name}؟`],
        sql: `SELECT MAX(p.unit_price) AS max_price FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = '${esc(c.name)}'` };
    },
  }),
];
