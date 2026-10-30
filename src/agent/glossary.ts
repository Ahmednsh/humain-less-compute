/** Business definitions. Each line carries the keywords that make it relevant to a question (pruned mode). */
export interface GlossaryLine { text: string; keywords: string[] }

export const GLOSSARY: GlossaryLine[] = [
  { text: 'Line revenue = quantity * unit_price * (1 - discount_pct / 100.0), computed on order_items.', keywords: ['revenue', 'sales', 'aov', 'order value', 'margin', 'growth', 'net', 'إيراد', 'مبيعات', 'هامش', 'نمو', 'قيمة طلب'] },
  { text: '"Delivered revenue" means revenue of orders whose status = \'delivered\' only, unless the question says otherwise.', keywords: ['revenue', 'delivered', 'aov', 'order value', 'margin', 'growth', 'net', 'إيراد', 'مسلّم', 'مسلم', 'هامش', 'نمو'] },
  { text: 'Average order value (AOV) = total revenue / COUNT(DISTINCT orders.id).', keywords: ['aov', 'average order value', 'order value', 'متوسط قيمة'] },
  { text: 'Net revenue = delivered revenue minus returns.refund_amount of items belonging to those delivered orders.', keywords: ['net', 'refund', 'صافي', 'مسترد'] },
  { text: 'Margin = line revenue - quantity * products.cost.', keywords: ['margin', 'هامش'] },
  { text: 'Delivery days = julianday(shipments.delivered_at) - julianday(shipments.shipped_at); only shipments with delivered_at NOT NULL count as delivered.', keywords: ['delivery', 'deliver', 'days', 'carrier', 'ship', 'توصيل', 'تسليم', 'شحن', 'أيام', 'ناقل'] },
  { text: 'Ticket resolution hours = (julianday(closed_at) - julianday(opened_at)) * 24 for closed tickets; an open ticket has closed_at IS NULL.', keywords: ['ticket', 'resolution', 'open', 'closed', 'support', 'تذكرة', 'تذاكر', 'حل', 'مفتوح', 'مغلق', 'دعم'] },
  { text: 'Return rate = number of rows in returns / number of order_items rows of shipped orders (orders that have a shipment), grouped as asked.', keywords: ['return rate', 'returned', 'return', 'إرجاع', 'مرتجع'] },
  { text: 'Dates are ISO text: order_date is YYYY-MM-DD; timestamps are YYYY-MM-DD HH:MM:SS. Use substr(col,1,4) for the year, substr(col,1,7) for YYYY-MM. Quarters are calendar quarters (Q1 = Jan–Mar).', keywords: ['year', 'month', 'quarter', 'q1', 'q2', 'q3', 'q4', '2024', '2025', '2026', 'since', 'before', 'after', 'سنة', 'عام', 'شهر', 'ربع', 'منذ', 'قبل', 'بعد'] },
  { text: 'Cancellation rate = cancelled orders / all orders in the same group.', keywords: ['cancel', 'إلغاء', 'ملغ'] },
  { text: 'Employees report to employees.manager_id; a manager\'s team revenue is the revenue of orders whose employee_id is one of their direct reports.', keywords: ['manager', 'team', 'report', 'مدير', 'فريق'] },
  { text: 'A customer\'s region is reached through customers.city_id -> cities.region_id -> regions.', keywords: ['region', 'منطقة'] },
  { text: '"Units" or "items sold" means SUM(order_items.quantity). "Order lines" means COUNT of order_items rows.', keywords: ['units', 'items', 'quantity', 'sold', 'وحدات', 'كمية', 'عناصر'] },
];

export function glossaryFor(question: string | null): string {
  const q = question?.toLowerCase() ?? null;
  const lines = q == null ? GLOSSARY : GLOSSARY.filter(l => l.keywords.some(k => q.includes(k)));
  return lines.map(l => `- ${l.text}`).join('\n');
}
