/** Worked examples. None is identical to a task template; they teach conventions (first column = answer, one row for scalars). */
export interface FewShot { q: string; sql: string; shape: 'scalar' | 'list' }

export const FEWSHOTS: FewShot[] = [
  { q: 'How many orders were placed through the web channel?', sql: "SELECT COUNT(*) AS n FROM orders WHERE channel = 'web'", shape: 'scalar' },
  { q: 'What is the total delivered revenue in March 2025?', sql: "SELECT ROUND(SUM(oi.quantity * oi.unit_price * (1 - oi.discount_pct / 100.0)), 2) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'delivered' AND substr(o.order_date, 1, 7) = '2025-03'", shape: 'scalar' },
  { q: 'Which product had the most units sold in delivered orders in 2024?', sql: "SELECT p.name FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id WHERE o.status = 'delivered' AND substr(o.order_date, 1, 4) = '2024' GROUP BY p.id ORDER BY SUM(oi.quantity) DESC, p.name LIMIT 1", shape: 'scalar' },
  { q: 'List the names of customers in Jeddah with the enterprise segment.', sql: "SELECT cu.name FROM customers cu JOIN cities ci ON ci.id = cu.city_id WHERE ci.name = 'Jeddah' AND cu.segment = 'enterprise' ORDER BY cu.name", shape: 'list' },
  { q: 'What is the average payment amount for card payments in 2025?', sql: "SELECT ROUND(AVG(amount), 2) AS avg_amount FROM payments WHERE method = 'card' AND substr(paid_at, 1, 4) = '2025'", shape: 'scalar' },
  { q: 'How many support tickets were closed within 24 hours?', sql: 'SELECT COUNT(*) AS n FROM support_tickets WHERE closed_at IS NOT NULL AND (julianday(closed_at) - julianday(opened_at)) * 24 <= 24', shape: 'scalar' },
  { q: 'Which city had the third-highest number of customers?', sql: 'SELECT name FROM (SELECT ci.name AS name, COUNT(cu.id) AS n, ROW_NUMBER() OVER (ORDER BY COUNT(cu.id) DESC, ci.name) AS rn FROM cities ci JOIN customers cu ON cu.city_id = ci.id GROUP BY ci.id) WHERE rn = 3', shape: 'scalar' },
  { q: 'Which two regions had the highest total refund amounts in 2025, in order?', sql: "SELECT r.name FROM returns rt JOIN order_items oi ON oi.id = rt.order_item_id JOIN orders o ON o.id = oi.order_id JOIN customers c ON c.id = o.customer_id JOIN cities ci ON ci.id = c.city_id JOIN regions r ON r.id = ci.region_id WHERE substr(rt.returned_at, 1, 4) = '2025' GROUP BY r.id ORDER BY SUM(rt.refund_amount) DESC, r.name LIMIT 2", shape: 'list' },
];
