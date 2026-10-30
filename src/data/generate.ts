import type { DatabaseSync } from 'node:sqlite';
import { createRng } from './rng.js';

export interface Scale { customers: number; products: number; employees: number; orders: number; tickets: number }
export type Counts = Record<string, number>;
const DEFAULT: Scale = { customers: 400, products: 120, employees: 40, orders: 6000, tickets: 800 };

const REGIONS = ['Riyadh', 'Makkah', 'Eastern Province', 'Madinah', 'Qassim', 'Asir', 'Tabuk', 'Hail'];
const CITIES: [string, number][] = [
  ['Riyadh', 0], ['Al Kharj', 0], ['Al Majmaah', 0], ['Jeddah', 1], ['Makkah', 1], ['Taif', 1], ['Rabigh', 1],
  ['Dammam', 2], ['Khobar', 2], ['Dhahran', 2], ['Jubail', 2], ['Al Ahsa', 2], ['Qatif', 2],
  ['Madinah', 3], ['Yanbu', 3], ['Al Ula', 3], ['Buraydah', 4], ['Unaizah', 4], ['Ar Rass', 4],
  ['Abha', 5], ['Khamis Mushait', 5], ['Tabuk', 6], ['Duba', 6], ['Hail', 7], ['Baqaa', 7],
];
const CATEGORIES = ['Beverages', 'Dairy', 'Bakery', 'Snacks', 'Household', 'Personal Care', 'Electronics', 'Stationery'];
const FIRST = ['Ahmed', 'Mohammed', 'Fahad', 'Khalid', 'Saud', 'Abdullah', 'Nasser', 'Faisal', 'Sara', 'Noura', 'Reem', 'Lama', 'Hessa', 'Maha', 'Dana', 'Amal'];
const LAST = ['Al-Qahtani', 'Al-Otaibi', 'Al-Harbi', 'Al-Shammari', 'Al-Dossari', 'Al-Ghamdi', 'Al-Zahrani', 'Al-Mutairi', 'Al-Subaie', 'Al-Anazi'];
const COMPANIES = ['Trading Est.', 'Supermarkets', 'Logistics', 'Hypermarket', 'Retail Co.', 'Markets', 'Wholesale', 'Distribution'];
const PRODUCT_WORDS: Record<string, string[]> = {
  Beverages: ['Orange Juice', 'Sparkling Water', 'Cola', 'Iced Tea', 'Energy Drink'],
  Dairy: ['Fresh Milk', 'Laban', 'Yogurt', 'Cheese Slices', 'Butter'],
  Bakery: ['Arabic Bread', 'Croissant', 'Toast', 'Cake Mix', 'Samoli'],
  Snacks: ['Potato Chips', 'Dates Box', 'Mixed Nuts', 'Chocolate Bar', 'Popcorn'],
  Household: ['Dish Soap', 'Laundry Detergent', 'Trash Bags', 'Paper Towels', 'Bleach'],
  'Personal Care': ['Shampoo', 'Toothpaste', 'Hand Soap', 'Lotion', 'Razor Pack'],
  Electronics: ['USB Cable', 'Power Bank', 'Earbuds', 'LED Bulb', 'Phone Charger'],
  Stationery: ['Notebook', 'Pen Set', 'Stapler', 'A4 Paper', 'Markers'],
};
const VARIANTS = ['Classic', 'Family', 'Mini', 'Premium', 'Pack of 6', '1L', '500g'];
const CARRIERS = ['SMSA', 'Aramex', 'Naqel', 'DHL'];
const TOPICS = ['delivery_delay', 'damaged_item', 'billing', 'missing_item', 'account', 'product_question'];
const REASONS = ['damaged', 'wrong_item', 'not_needed', 'quality', 'late'];

const START = Date.UTC(2024, 0, 1);
const END = Date.UTC(2026, 8, 30);
const DAY = 86_400_000;
const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const fmtTs = (ms: number) => { const d = new Date(ms); return `${fmtDate(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
const money = (x: number) => Math.round(x * 100) / 100;

export function generateCompany(db: DatabaseSync, seed: number, scale: Partial<Scale> = {}): Counts {
  const S = { ...DEFAULT, ...scale };
  const rng = createRng(seed);
  const counts: Counts = {};
  const ins = (table: string, cols: string[]) =>
    db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);

  db.exec('BEGIN');
  const r = ins('regions', ['name']); REGIONS.forEach(n => r.run(n)); counts.regions = REGIONS.length;
  const c = ins('cities', ['name', 'region_id']); CITIES.forEach(([n, ri]) => c.run(n, ri + 1)); counts.cities = CITIES.length;
  const cat = ins('categories', ['name']); CATEGORIES.forEach(n => cat.run(n)); counts.categories = CATEGORIES.length;

  // products: category round-robin so every category is populated
  const p = ins('products', ['sku', 'name', 'category_id', 'unit_price', 'cost', 'active']);
  const prices: number[] = [];
  for (let i = 1; i <= S.products; i++) {
    const ci = (i - 1) % CATEGORIES.length;
    const name = `${rng.pick(PRODUCT_WORDS[CATEGORIES[ci]!]!)} ${rng.pick(VARIANTS)}`;
    const price = money(rng.int(3, 400) * (0.8 + rng.next() * 0.4));
    prices.push(price);
    p.run(`SKU-${String(i).padStart(4, '0')}`, name, ci + 1, price, money(price * (0.45 + rng.next() * 0.3)), rng.chance(0.92) ? 1 : 0);
  }
  counts.products = S.products;

  // employees: regional managers first so manager_id references exist
  const e = ins('employees', ['name', 'role', 'city_id', 'hired_at', 'manager_id']);
  const nManagers = Math.max(2, Math.floor(S.employees / 10));
  for (let i = 1; i <= S.employees; i++) {
    const role = i <= nManagers ? 'regional_manager' : rng.pick(['sales_rep', 'sales_rep', 'account_manager', 'support_agent']);
    const hired = Date.UTC(rng.int(2018, 2025), rng.int(0, 11), rng.int(1, 28));
    e.run(`${rng.pick(FIRST)} ${rng.pick(LAST)}`, role, rng.int(1, CITIES.length), fmtDate(hired), i <= nManagers ? null : rng.int(1, nManagers));
  }
  counts.employees = S.employees;
  const salesIds = (db.prepare("SELECT id FROM employees WHERE role IN ('sales_rep','account_manager') ORDER BY id").all() as { id: number }[]).map(x => x.id);
  if (salesIds.length === 0) throw new Error('generator needs at least one sales employee');

  const cu = ins('customers', ['name', 'city_id', 'segment', 'created_at']);
  for (let i = 1; i <= S.customers; i++) {
    const seg = rng.pick(['retail', 'retail', 'retail', 'wholesale', 'wholesale', 'enterprise']);
    const name = seg === 'retail' ? `${rng.pick(FIRST)} ${rng.pick(LAST)}` : `${rng.pick(LAST).replace('Al-', '')} ${rng.pick(COMPANIES)}`;
    cu.run(name, rng.int(1, CITIES.length), seg, fmtDate(Date.UTC(rng.int(2022, 2025), rng.int(0, 11), rng.int(1, 28))));
  }
  counts.customers = S.customers;

  const o = ins('orders', ['customer_id', 'employee_id', 'order_date', 'status', 'channel']);
  const oi = ins('order_items', ['order_id', 'product_id', 'quantity', 'unit_price', 'discount_pct']);
  const pay = ins('payments', ['order_id', 'paid_at', 'method', 'amount']);
  const sh = ins('shipments', ['order_id', 'shipped_at', 'delivered_at', 'carrier']);
  const ret = ins('returns', ['order_item_id', 'returned_at', 'reason', 'refund_amount']);
  let items = 0, pays = 0, ships = 0, rets = 0, itemId = 0;
  for (let i = 1; i <= S.orders; i++) {
    const t = START + Math.floor(rng.next() * (END - START));
    const status = rng.pick(['delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'shipped', 'pending', 'cancelled', 'returned']);
    o.run(rng.int(1, S.customers), rng.pick(salesIds), fmtDate(t), status, rng.pick(['web', 'web', 'store', 'phone']));
    const n = rng.int(1, 5);
    let total = 0;
    const lineValue = new Map<number, number>(); // itemId -> qty * unit_price
    for (let k = 0; k < n; k++) {
      const pid = rng.int(1, S.products);
      const qty = rng.int(1, 12);
      const disc = rng.chance(0.3) ? rng.pick([5, 10, 15]) : 0;
      const price = prices[pid - 1]!;
      oi.run(i, pid, qty, price, disc);
      itemId++; items++;
      lineValue.set(itemId, qty * price);
      total += qty * price * (1 - disc / 100);
    }
    if (status !== 'cancelled' && status !== 'pending') {
      pay.run(i, fmtTs(t + rng.int(0, 2) * DAY), rng.pick(['card', 'card', 'bank_transfer', 'cash', 'wallet']), money(total));
      pays++;
    }
    if (status === 'shipped' || status === 'delivered' || status === 'returned') {
      const shipped = t + rng.int(1, 3) * DAY;
      sh.run(i, fmtTs(shipped), status === 'shipped' ? null : fmtTs(shipped + rng.int(1, 7) * DAY), rng.pick(CARRIERS));
      ships++;
    }
    if (status === 'returned' || (status === 'delivered' && rng.chance(0.04))) {
      const id = rng.pick([...lineValue.keys()]);
      const fraction = rng.pick([1, 1, 0.5, 0.25]);
      ret.run(id, fmtTs(t + rng.int(5, 20) * DAY), rng.pick(REASONS), money(lineValue.get(id)! * fraction));
      rets++;
    }
  }
  counts.orders = S.orders; counts.order_items = items; counts.payments = pays; counts.shipments = ships; counts.returns = rets;

  const tk = ins('support_tickets', ['customer_id', 'order_id', 'opened_at', 'closed_at', 'priority', 'topic']);
  for (let i = 1; i <= S.tickets; i++) {
    const t = START + Math.floor(rng.next() * (END - START));
    tk.run(rng.int(1, S.customers), rng.chance(0.7) ? rng.int(1, S.orders) : null, fmtTs(t), rng.chance(0.85) ? fmtTs(t + rng.int(1, 240) * HOUR) : null, rng.pick(['low', 'medium', 'medium', 'high', 'urgent']), rng.pick(TOPICS));
  }
  counts.support_tickets = S.tickets;
  db.exec('COMMIT');
  return counts;
}
