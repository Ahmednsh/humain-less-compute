CREATE TABLE regions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE cities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  region_id INTEGER NOT NULL REFERENCES regions(id)
);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  segment TEXT NOT NULL CHECK (segment IN ('retail','wholesale','enterprise')),
  created_at TEXT NOT NULL
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  unit_price REAL NOT NULL,
  cost REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('sales_rep','account_manager','support_agent','regional_manager')),
  city_id INTEGER NOT NULL REFERENCES cities(id),
  hired_at TEXT NOT NULL,
  manager_id INTEGER REFERENCES employees(id)
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  order_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','shipped','delivered','cancelled','returned')),
  channel TEXT NOT NULL CHECK (channel IN ('web','store','phone'))
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0
);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('card','bank_transfer','cash','wallet')),
  amount REAL NOT NULL
);
CREATE TABLE shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  shipped_at TEXT NOT NULL,
  delivered_at TEXT,
  carrier TEXT NOT NULL
);
CREATE TABLE returns (
  id INTEGER PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id),
  returned_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  refund_amount REAL NOT NULL
);
CREATE TABLE support_tickets (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_id INTEGER REFERENCES orders(id),
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','urgent')),
  topic TEXT NOT NULL
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_items_order ON order_items(order_id);
CREATE INDEX idx_items_product ON order_items(product_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_ship_order ON shipments(order_id);
CREATE INDEX idx_returns_item ON returns(order_item_id);
CREATE INDEX idx_tickets_customer ON support_tickets(customer_id);
