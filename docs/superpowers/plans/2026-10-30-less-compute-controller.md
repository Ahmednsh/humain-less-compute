# Less-Compute Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An NL→SQL analytics agent whose controller routes, prunes context and verifies selectively, plus the harness that proves it cuts cost per successful task against a measured baseline under accuracy and latency floors.

**Architecture:** Deterministic synthetic SQLite company DB and templated tasks with exact gold answers; a controller made of pure, mock-testable units (router → context → executor → verifier → escalation); an eval harness that logs every call to JSONL and renders the ablation table. Everything is driven from one CLI.

**Tech Stack:** TypeScript strict, Node 26 (`node:sqlite`), `zod`, `vitest`, `tsx`, plain `fetch` to OpenRouter.

**Spec:** `docs/superpowers/specs/2026-10-30-less-compute-controller-design.md`

## Global Constraints

- Node ≥ 26 (uses `node:sqlite`). TypeScript `strict: true`, ESM (`"type": "module"`).
- Dependencies limited to MIT/Apache-2.0/BSD: `zod`, `typescript`, `tsx`, `vitest`, `@types/node`. Nothing GPL/AGPL.
- Secrets only via `.env` (`OPENROUTER_API_KEY`), loaded with `process.loadEnvFile()`; never logged, never committed.
- The difficulty tier of a task is never passed to the agent; only `question` reaches the controller.
- Held-out set: generated only with `--holdout`, only to a path outside the repo, never read by a human or the assistant.
- Every real run appends a row to `results/EXPERIMENTS.md` and commits its JSONL log.
- Model ids and prices: small `anthropic/claude-haiku-5.5` (0.10/0.50 USD per M), large `anthropic/claude-sonnet-5.5` (2.00/10.00). Floors: accuracy ≥ P0 − 2.0 pp; p95 latency ≤ 1.25 × P0 p95.
- Temperature 0 on every call. Concurrency 4. Timeout 60 s. 3 attempts on 429/5xx.

## Review Focus

1. Model returns prose or fenced ```json around the JSON → parser must strip fences and retry once (Task 10 test `parses fenced json`).
2. Model SQL is a write (`DELETE`, `UPDATE`, `DROP`, `PRAGMA`, `ATTACH`) or multi-statement → rejected before execution, counted as SQL error (Task 2 test `rejects writes and multi-statements`).
3. Numeric gold vs. model string with thousands separators or currency, e.g. `"SAR 1,234.50"` → scored as correct within tolerance (Task 4 test `parses formatted numbers`).
4. Pruner selects tables with no FK path between them (e.g. `returns` and `employees`) → must add connecting tables so the LLM can join (Task 9 test `connects disconnected tables`).
5. Harness crash mid-run → re-running the same command must skip already-logged task ids and not double-spend (Task 14 test `resumes without duplicates`).

---

### Task 1: Project scaffold, PRNG, CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `data/.gitkeep`, `results/runs/.gitkeep`
- Create: `src/data/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Produces: `createRng(seed: number): Rng` where `Rng = { next(): number; int(min: number, max: number): number; pick<T>(a: readonly T[]): T; chance(p: number): boolean; shuffle<T>(a: T[]): T[] }`. `next()` ∈ [0,1). `int` is inclusive both ends.

- [ ] **Step 1: Write package.json and configs**

```json
{
  "name": "humain-less-compute",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=26" },
  "scripts": {
    "cli": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "gen:db": "tsx src/cli.ts gen-db --seed 42 --out data/company.sqlite",
    "gen:tasks": "tsx src/cli.ts gen-tasks --db data/company.sqlite --seed 1001 --n 150 --out data/dev.jsonl",
    "smoke": "tsx src/cli.ts eval --policy P3 --tasks data/smoke.jsonl --db data/company.sqlite --mock --out results/runs/smoke.jsonl"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  },
  "dependencies": { "zod": "^3.23.0" }
}
```

`tsconfig.json`:
```json
{ "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "strict": true, "noUncheckedIndexedAccess": true, "esModuleInterop": true, "skipLibCheck": true, "types": ["node"], "outDir": "dist", "rootDir": "." }, "include": ["src", "tests"] }
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 } });
```

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 26 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run gen:db
      - run: npx tsx src/cli.ts gen-tasks --db data/company.sqlite --seed 7 --n 10 --out data/smoke.jsonl
      - run: npm run smoke
```

- [ ] **Step 2: Install** — Run: `npm install` (then verify `package-lock.json` exists).

- [ ] **Step 3: Write the failing test** `tests/rng.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createRng } from '../src/data/rng.js';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42), b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('differs across seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it('int is inclusive and in range', () => {
    const r = createRng(3); const seen = new Set<number>();
    for (let i = 0; i < 500; i++) { const v = r.int(1, 3); expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(3); seen.add(v); }
    expect(seen.size).toBe(3);
  });
  it('shuffle keeps elements', () => {
    expect(createRng(5).shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});
```

- [ ] **Step 4: Run** `npx vitest run tests/rng.test.ts` → FAIL (module not found).

- [ ] **Step 5: Implement** `src/data/rng.ts`

```ts
export interface Rng {
  next(): number; int(min: number, max: number): number;
  pick<T>(a: readonly T[]): T; chance(p: number): boolean; shuffle<T>(a: T[]): T[];
}
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (a) => { if (a.length === 0) throw new Error('pick from empty'); return a[Math.floor(next() * a.length)]!; },
    chance: (p) => next() < p,
    shuffle: (a) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [c[i], c[j]] = [c[j]!, c[i]!]; } return c; },
  };
  return rng;
}
```

- [ ] **Step 6: Run** → PASS. **Step 7: Commit** `chore: scaffold project, add seeded PRNG`.

---

### Task 2: Schema and safe DB access

**Files:**
- Create: `src/data/schema.sql`, `src/data/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `openDb(path: string, opts?: { readOnly?: boolean }): DatabaseSync`; `createSchema(db): void` (executes schema.sql); `runReadOnly(db, sql: string, opts?: { rowCap?: number }): { ok: true; rows: Row[]; columns: string[]; truncated: boolean } | { ok: false; error: string }` where `Row = Record<string, unknown>`; `introspectSchema(db): SchemaInfo` with `SchemaInfo = { tables: TableInfo[] }`, `TableInfo = { name: string; columns: { name: string; type: string; pk: boolean }[]; fks: { from: string; table: string; to: string }[] }`; `schemaToDdl(info: SchemaInfo, tables?: string[]): string`.

- [ ] **Step 1: Write `src/data/schema.sql`**

```sql
CREATE TABLE regions (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE cities (id INTEGER PRIMARY KEY, name TEXT NOT NULL, region_id INTEGER NOT NULL REFERENCES regions(id));
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city_id INTEGER NOT NULL REFERENCES cities(id), segment TEXT NOT NULL CHECK (segment IN ('retail','wholesale','enterprise')), created_at TEXT NOT NULL);
CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE products (id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category_id INTEGER NOT NULL REFERENCES categories(id), unit_price REAL NOT NULL, cost REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('sales_rep','account_manager','support_agent','regional_manager')), city_id INTEGER NOT NULL REFERENCES cities(id), hired_at TEXT NOT NULL, manager_id INTEGER REFERENCES employees(id));
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), employee_id INTEGER NOT NULL REFERENCES employees(id), order_date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','shipped','delivered','cancelled','returned')), channel TEXT NOT NULL CHECK (channel IN ('web','store','phone')));
CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, unit_price REAL NOT NULL, discount_pct REAL NOT NULL DEFAULT 0);
CREATE TABLE payments (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), paid_at TEXT NOT NULL, method TEXT NOT NULL CHECK (method IN ('card','bank_transfer','cash','wallet')), amount REAL NOT NULL);
CREATE TABLE shipments (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), shipped_at TEXT NOT NULL, delivered_at TEXT, carrier TEXT NOT NULL);
CREATE TABLE returns (id INTEGER PRIMARY KEY, order_item_id INTEGER NOT NULL REFERENCES order_items(id), returned_at TEXT NOT NULL, reason TEXT NOT NULL, refund_amount REAL NOT NULL);
CREATE TABLE support_tickets (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), order_id INTEGER REFERENCES orders(id), opened_at TEXT NOT NULL, closed_at TEXT, priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','urgent')), topic TEXT NOT NULL);
CREATE INDEX idx_orders_customer ON orders(customer_id); CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_items_order ON order_items(order_id); CREATE INDEX idx_items_product ON order_items(product_id);
CREATE INDEX idx_payments_order ON payments(order_id); CREATE INDEX idx_ship_order ON shipments(order_id);
CREATE INDEX idx_returns_item ON returns(order_item_id); CREATE INDEX idx_tickets_customer ON support_tickets(customer_id);
```

- [ ] **Step 2: Write the failing test** `tests/db.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { openDb, createSchema, runReadOnly, introspectSchema, schemaToDdl } from '../src/data/db.js';

function mem() { const db = openDb(':memory:'); createSchema(db); return db; }

describe('db', () => {
  it('creates 12 tables and introspects fks', () => {
    const info = introspectSchema(mem());
    expect(info.tables.map(t => t.name).sort()).toEqual(['categories','cities','customers','employees','order_items','orders','payments','products','regions','returns','shipments','support_tickets']);
    const orders = info.tables.find(t => t.name === 'orders')!;
    expect(orders.fks).toContainEqual({ from: 'customer_id', table: 'customers', to: 'id' });
  });
  it('schemaToDdl can restrict to tables', () => {
    const ddl = schemaToDdl(introspectSchema(mem()), ['regions']);
    expect(ddl).toContain('CREATE TABLE regions');
    expect(ddl).not.toContain('CREATE TABLE cities');
  });
  it('runs a select and caps rows', () => {
    const db = mem(); db.exec("INSERT INTO regions(name) VALUES ('a'),('b'),('c')");
    const r = runReadOnly(db, 'SELECT name FROM regions ORDER BY id', { rowCap: 2 });
    expect(r.ok && r.rows.length === 2 && r.truncated).toBe(true);
  });
  it('rejects writes and multi-statements', () => {
    const db = mem();
    for (const sql of ['DELETE FROM regions', 'UPDATE regions SET name=1', 'DROP TABLE regions', 'PRAGMA foreign_keys=0', "ATTACH 'x' AS y", 'SELECT 1; DELETE FROM regions', 'INSERT INTO regions(name) VALUES (1)']) {
      const r = runReadOnly(db, sql); expect(r.ok, sql).toBe(false);
    }
    expect(runReadOnly(db, 'WITH t AS (SELECT 1 AS x) SELECT x FROM t').ok).toBe(true);
  });
  it('returns sql errors as values', () => {
    const r = runReadOnly(mem(), 'SELECT nope FROM regions');
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/no such column/);
  });
});
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** `src/data/db.ts`

```ts
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Row = Record<string, unknown>;
export interface TableInfo { name: string; columns: { name: string; type: string; pk: boolean }[]; fks: { from: string; table: string; to: string }[] }
export interface SchemaInfo { tables: TableInfo[] }
export type QueryResult = { ok: true; rows: Row[]; columns: string[]; truncated: boolean } | { ok: false; error: string };

export function openDb(path: string, opts: { readOnly?: boolean } = {}): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: opts.readOnly ?? false });
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
export function createSchema(db: DatabaseSync): void {
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
}
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|pragma|attach|detach|vacuum|reindex|begin|commit|rollback)\b/i;
export function isSafeSelect(sql: string): string | null {
  const s = sql.trim().replace(/;\s*$/, '');
  if (s.includes(';')) return 'multiple statements are not allowed';
  if (!/^(select|with)\b/i.test(s)) return 'only SELECT statements are allowed';
  if (FORBIDDEN.test(s)) return 'statement contains a forbidden keyword';
  return null;
}
export function runReadOnly(db: DatabaseSync, sql: string, opts: { rowCap?: number } = {}): QueryResult {
  const guard = isSafeSelect(sql); if (guard) return { ok: false, error: guard };
  const cap = opts.rowCap ?? 200;
  try {
    const stmt = db.prepare(sql.trim().replace(/;\s*$/, ''));
    const rows: Row[] = []; let truncated = false;
    for (const row of stmt.iterate() as Iterable<Row>) { if (rows.length >= cap) { truncated = true; break; } rows.push(row); }
    const columns = rows[0] ? Object.keys(rows[0]) : stmt.columns().map(c => c.name);
    return { ok: true, rows, columns, truncated };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
export function introspectSchema(db: DatabaseSync): SchemaInfo {
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(r => r.name);
  return { tables: names.map(name => ({
    name,
    columns: (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string; pk: number }[]).map(c => ({ name: c.name, type: c.type, pk: c.pk > 0 })),
    fks: (db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as { from: string; table: string; to: string }[]).map(f => ({ from: f.from, table: f.table, to: f.to })),
  })) };
}
export function schemaToDdl(info: SchemaInfo, tables?: string[]): string {
  const keep = tables ? new Set(tables) : null;
  return info.tables.filter(t => !keep || keep.has(t.name)).map(t => {
    const cols = t.columns.map(c => `  ${c.name} ${c.type}${c.pk ? ' PRIMARY KEY' : ''}`);
    const fks = t.fks.map(f => `  FOREIGN KEY (${f.from}) REFERENCES ${f.table}(${f.to})`);
    return `CREATE TABLE ${t.name} (\n${[...cols, ...fks].join(',\n')}\n);`;
  }).join('\n');
}
```
Note: `stmt.columns()` exists in Node ≥ 23.11; if the typecheck complains, fall back to `[]` when there are no rows.

- [ ] **Step 5: Run** → PASS. **Step 6: Commit** `feat: schema and guarded read-only query execution`.

---

### Task 3: Deterministic data generator

**Files:**
- Create: `src/data/generate.ts`
- Test: `tests/generate.test.ts`

**Interfaces:**
- Produces: `generateCompany(db: DatabaseSync, seed: number, scale?: Partial<Scale>): Counts` where `Scale = { customers: number; products: number; employees: number; orders: number; tickets: number }` (defaults 400/120/40/6000/800) and `Counts` has a count per table. Dates ISO `YYYY-MM-DD` (and `YYYY-MM-DD HH:MM:SS` for timestamps) between `2024-01-01` and `2026-09-30`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { openDb, createSchema } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';

const small = { customers: 30, products: 20, employees: 8, orders: 200, tickets: 40 };
function build(seed: number) { const db = openDb(':memory:'); createSchema(db); const counts = generateCompany(db, seed, small); return { db, counts }; }
const q = (db: any, sql: string) => (db.prepare(sql).get() as any);

describe('generateCompany', () => {
  it('produces the requested counts and nonempty children', () => {
    const { db, counts } = build(1);
    expect(counts.orders).toBe(200); expect(counts.customers).toBe(30);
    expect(q(db, 'SELECT COUNT(*) c FROM order_items').c).toBeGreaterThan(200);
    expect(q(db, 'SELECT COUNT(*) c FROM returns').c).toBeGreaterThan(0);
    expect(q(db, "SELECT COUNT(*) c FROM shipments WHERE delivered_at IS NULL").c).toBeGreaterThan(0);
  });
  it('is deterministic', () => {
    const a = build(9).db, b = build(9).db;
    const dump = (db: any) => db.prepare('SELECT * FROM order_items ORDER BY id').all();
    expect(dump(a)).toEqual(dump(b));
    expect(dump(build(10).db)).not.toEqual(dump(a));
  });
  it('keeps referential integrity', () => {
    const { db } = build(2);
    expect(q(db, 'PRAGMA foreign_key_check').c ?? db.prepare('PRAGMA foreign_key_check').all().length).toBe(0);
    expect(q(db, "SELECT COUNT(*) c FROM orders WHERE order_date < '2024-01-01' OR order_date > '2026-09-30'").c).toBe(0);
  });
  it('spreads order statuses and every month has orders', () => {
    const { db } = build(3);
    expect(q(db, 'SELECT COUNT(DISTINCT status) c FROM orders').c).toBe(5);
    expect(q(db, "SELECT COUNT(DISTINCT substr(order_date,1,7)) c FROM orders").c).toBeGreaterThanOrEqual(30);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `src/data/generate.ts`

```ts
import type { DatabaseSync } from 'node:sqlite';
import { createRng, type Rng } from './rng.js';

export interface Scale { customers: number; products: number; employees: number; orders: number; tickets: number }
export type Counts = Record<string, number>;
const DEFAULT: Scale = { customers: 400, products: 120, employees: 40, orders: 6000, tickets: 800 };

const REGIONS = ['Riyadh', 'Makkah', 'Eastern Province', 'Madinah', 'Qassim', 'Asir', 'Tabuk', 'Hail'];
const CITIES: [string, number][] = [['Riyadh',0],['Al Kharj',0],['Al Majmaah',0],['Jeddah',1],['Makkah',1],['Taif',1],['Dammam',2],['Khobar',2],['Dhahran',2],['Jubail',2],['Al Ahsa',2],['Madinah',3],['Yanbu',3],['Buraydah',4],['Unaizah',4],['Abha',5],['Khamis Mushait',5],['Tabuk',6],['Duba',6],['Hail',7],['Baqaa',7],['Qatif',2],['Rabigh',1],['Al Ula',3],['Ar Rass',4]];
const CATEGORIES = ['Beverages', 'Dairy', 'Bakery', 'Snacks', 'Household', 'Personal Care', 'Electronics', 'Stationery'];
const FIRST = ['Ahmed','Mohammed','Fahad','Khalid','Saud','Abdullah','Nasser','Faisal','Sara','Noura','Reem','Lama','Hessa','Maha','Dana','Amal'];
const LAST = ['Al-Qahtani','Al-Otaibi','Al-Harbi','Al-Shammari','Al-Dossari','Al-Ghamdi','Al-Zahrani','Al-Mutairi','Al-Subaie','Al-Anazi'];
const COMPANIES = ['Trading Est.','Supermarkets','Logistics','Hypermarket','Retail Co.','Markets','Wholesale','Distribution'];
const PRODUCT_WORDS: Record<string, string[]> = { Beverages: ['Orange Juice','Sparkling Water','Cola','Iced Tea','Energy Drink'], Dairy: ['Fresh Milk','Laban','Yogurt','Cheese Slices','Butter'], Bakery: ['Arabic Bread','Croissant','Toast','Cake Mix','Samoli'], Snacks: ['Potato Chips','Dates Box','Mixed Nuts','Chocolate Bar','Popcorn'], Household: ['Dish Soap','Laundry Detergent','Trash Bags','Paper Towels','Bleach'], 'Personal Care': ['Shampoo','Toothpaste','Hand Soap','Lotion','Razor Pack'], Electronics: ['USB Cable','Power Bank','Earbuds','LED Bulb','Phone Charger'], Stationery: ['Notebook','Pen Set','Stapler','A4 Paper','Markers'] };
const CARRIERS = ['SMSA', 'Aramex', 'Naqel', 'DHL'];
const TOPICS = ['delivery_delay', 'damaged_item', 'billing', 'missing_item', 'account', 'product_question'];
const REASONS = ['damaged', 'wrong_item', 'not_needed', 'quality', 'late'];

const START = Date.UTC(2024, 0, 1), END = Date.UTC(2026, 8, 30);
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const fmtTs = (ms: number) => { const d = new Date(ms); return `${fmtDate(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
const DAY = 86400000;

export function generateCompany(db: DatabaseSync, seed: number, scale: Partial<Scale> = {}): Counts {
  const S = { ...DEFAULT, ...scale }; const rng = createRng(seed); const counts: Counts = {};
  const ins = (table: string, cols: string[]) => db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  db.exec('BEGIN');
  const r = ins('regions', ['name']); REGIONS.forEach(n => r.run(n)); counts.regions = REGIONS.length;
  const c = ins('cities', ['name', 'region_id']); CITIES.forEach(([n, ri]) => c.run(n, ri + 1)); counts.cities = CITIES.length;
  const cat = ins('categories', ['name']); CATEGORIES.forEach(n => cat.run(n)); counts.categories = CATEGORIES.length;
  // products
  const p = ins('products', ['sku', 'name', 'category_id', 'unit_price', 'cost', 'active']); const prices: number[] = [];
  for (let i = 1; i <= S.products; i++) { const ci = (i - 1) % CATEGORIES.length; const words = PRODUCT_WORDS[CATEGORIES[ci]!]!; const name = `${rng.pick(words)} ${rng.pick(['Classic','Family','Mini','Premium','Pack of 6','1L','500g'])}`; const price = Math.round(rng.int(3, 400) * 100 * (0.8 + rng.next() * 0.4)) / 100; prices.push(price); p.run(`SKU-${String(i).padStart(4, '0')}`, name, ci + 1, price, Math.round(price * (0.45 + rng.next() * 0.3) * 100) / 100, rng.chance(0.92) ? 1 : 0); }
  counts.products = S.products;
  // employees (managers first)
  const e = ins('employees', ['name', 'role', 'city_id', 'hired_at', 'manager_id']); const nManagers = Math.max(2, Math.floor(S.employees / 10));
  for (let i = 1; i <= S.employees; i++) { const role = i <= nManagers ? 'regional_manager' : rng.pick(['sales_rep', 'sales_rep', 'account_manager', 'support_agent']); e.run(`${rng.pick(FIRST)} ${rng.pick(LAST)}`, role, rng.int(1, CITIES.length), fmtDate(Date.UTC(rng.int(2018, 2025), rng.int(0, 11), rng.int(1, 28))), i <= nManagers ? null : rng.int(1, nManagers)); }
  counts.employees = S.employees;
  const salesIds = (db.prepare("SELECT id FROM employees WHERE role IN ('sales_rep','account_manager')").all() as { id: number }[]).map(x => x.id);
  // customers
  const cu = ins('customers', ['name', 'city_id', 'segment', 'created_at']);
  for (let i = 1; i <= S.customers; i++) { const seg = rng.pick(['retail', 'retail', 'retail', 'wholesale', 'wholesale', 'enterprise']); const name = seg === 'retail' ? `${rng.pick(FIRST)} ${rng.pick(LAST)}` : `${rng.pick(LAST).replace('Al-', '')} ${rng.pick(COMPANIES)}`; cu.run(name, rng.int(1, CITIES.length), seg, fmtDate(Date.UTC(rng.int(2022, 2025), rng.int(0, 11), rng.int(1, 28)))); }
  counts.customers = S.customers;
  // orders + children
  const o = ins('orders', ['customer_id', 'employee_id', 'order_date', 'status', 'channel']); const oi = ins('order_items', ['order_id', 'product_id', 'quantity', 'unit_price', 'discount_pct']);
  const pay = ins('payments', ['order_id', 'paid_at', 'method', 'amount']); const sh = ins('shipments', ['order_id', 'shipped_at', 'delivered_at', 'carrier']); const ret = ins('returns', ['order_item_id', 'returned_at', 'reason', 'refund_amount']);
  let items = 0, pays = 0, ships = 0, rets = 0; let itemId = 0;
  for (let i = 1; i <= S.orders; i++) {
    const t = START + Math.floor(rng.next() * (END - START)); const status = rng.pick(['delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'shipped', 'pending', 'cancelled', 'returned']);
    o.run(rng.int(1, S.customers), rng.pick(salesIds), fmtDate(t), status, rng.pick(['web', 'web', 'store', 'phone']));
    const n = rng.int(1, 5); let total = 0; const ids: number[] = [];
    for (let k = 0; k < n; k++) { const pid = rng.int(1, S.products); const qty = rng.int(1, 12); const disc = rng.chance(0.3) ? rng.pick([5, 10, 15]) : 0; oi.run(i, pid, qty, prices[pid - 1]!, disc); itemId++; ids.push(itemId); total += qty * prices[pid - 1]! * (1 - disc / 100); items++; }
    if (status !== 'cancelled' && status !== 'pending') { pay.run(i, fmtTs(t + rng.int(0, 2) * DAY), rng.pick(['card', 'card', 'bank_transfer', 'cash', 'wallet']), Math.round(total * 100) / 100); pays++; }
    if (status === 'shipped' || status === 'delivered' || status === 'returned') { const shipped = t + rng.int(1, 3) * DAY; sh.run(i, fmtTs(shipped), status === 'shipped' ? null : fmtTs(shipped + rng.int(1, 7) * DAY), rng.pick(CARRIERS)); ships++; }
    if (status === 'returned' || (status === 'delivered' && rng.chance(0.04))) { const id = rng.pick(ids); const qty = rng.int(1, 3); ret.run(id, fmtTs(t + rng.int(5, 20) * DAY), rng.pick(REASONS), Math.round(prices[rng.int(1, S.products) - 1]! * qty * 100) / 100); rets++; }
  }
  counts.orders = S.orders; counts.order_items = items; counts.payments = pays; counts.shipments = ships; counts.returns = rets;
  const tk = ins('support_tickets', ['customer_id', 'order_id', 'opened_at', 'closed_at', 'priority', 'topic']);
  for (let i = 1; i <= S.tickets; i++) { const t = START + Math.floor(rng.next() * (END - START)); tk.run(rng.int(1, S.customers), rng.chance(0.7) ? rng.int(1, S.orders) : null, fmtTs(t), rng.chance(0.85) ? fmtTs(t + rng.int(1, 240) * 3600000) : null, rng.pick(['low', 'medium', 'medium', 'high', 'urgent']), rng.pick(TOPICS)); }
  counts.support_tickets = S.tickets;
  db.exec('COMMIT');
  return counts;
}
```
Fix the refund line so the refund uses the returned item's own price: keep a `Map<number, number>` of itemId → unit_price × quantity and use it. (Write it that way; the snippet above is the shape.)

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat: deterministic synthetic company data generator`.

---

### Task 4: Task types, answer normalisation and scorer

**Files:**
- Create: `src/tasks/types.ts`, `src/eval/score.ts`
- Test: `tests/score.test.ts`

**Interfaces:**
- Produces (`types.ts`): `type AnswerType = 'number'|'string'|'list'|'ordered_list'`; `type Answer = number | string | (string|number)[]`; `interface Task { id: string; templateId: string; tier: 1|2|3; lang: 'en'|'ar'; question: string; goldSql: string; gold: Answer; answerType: AnswerType; moneyAggregate: boolean }`.
- Produces (`score.ts`): `rowsToAnswer(rows: Row[], shape: 'scalar'|'list'): Answer | null` (first column; `scalar` → first cell; `list` → first column of all rows; empty rows → null); `scoreAnswer(pred: Answer | null, gold: Answer, type: AnswerType): boolean`; `parseNumber(x: unknown): number | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { rowsToAnswer, scoreAnswer, parseNumber } from '../src/eval/score.js';

describe('score', () => {
  it('parses formatted numbers', () => {
    expect(parseNumber('SAR 1,234.50')).toBe(1234.5); expect(parseNumber('12%')).toBe(12); expect(parseNumber('abc')).toBeNull(); expect(parseNumber(7)).toBe(7);
  });
  it('numbers within tolerance', () => {
    expect(scoreAnswer(1000, 1004, 'number')).toBe(true); expect(scoreAnswer(1000, 1010, 'number')).toBe(false); expect(scoreAnswer('42', 42, 'number')).toBe(true); expect(scoreAnswer([42], 42, 'number')).toBe(true); expect(scoreAnswer(null, 42, 'number')).toBe(false);
  });
  it('strings case and space insensitive', () => {
    expect(scoreAnswer(' eastern  province.', 'Eastern Province', 'string')).toBe(true); expect(scoreAnswer('Riyadh', 'Jeddah', 'string')).toBe(false);
  });
  it('lists order-insensitive, ordered lists not', () => {
    expect(scoreAnswer(['b', 'a'], ['a', 'b'], 'list')).toBe(true); expect(scoreAnswer(['b', 'a'], ['a', 'b'], 'ordered_list')).toBe(false); expect(scoreAnswer(['a'], ['a', 'b'], 'list')).toBe(false);
  });
  it('rowsToAnswer takes the first column', () => {
    expect(rowsToAnswer([{ x: 3, y: 'z' }], 'scalar')).toBe(3); expect(rowsToAnswer([{ n: 'a' }, { n: 'b' }], 'list')).toEqual(['a', 'b']); expect(rowsToAnswer([], 'scalar')).toBeNull();
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `src/eval/score.ts`

```ts
import type { Row } from '../data/db.js';
import type { Answer, AnswerType } from '../tasks/types.js';

export function parseNumber(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x !== 'string') return null;
  const m = x.replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null;
}
const normStr = (s: unknown) => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.。!]+$/, '');
export function rowsToAnswer(rows: Row[], shape: 'scalar' | 'list'): Answer | null {
  if (rows.length === 0) return null; const col = Object.keys(rows[0]!)[0]; if (!col) return null;
  const vals = rows.map(r => r[col] as string | number | null);
  if (shape === 'scalar') return vals[0] == null ? null : vals[0];
  return vals.filter((v): v is string | number => v != null);
}
function numEq(a: number, b: number) { return Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.005); }
export function scoreAnswer(pred: Answer | null, gold: Answer, type: AnswerType): boolean {
  if (pred == null) return false;
  const unwrap = (v: Answer) => Array.isArray(v) && v.length === 1 ? v[0]! : v;
  if (type === 'number') { const g = parseNumber(gold), p = parseNumber(unwrap(pred)); return g != null && p != null && numEq(p, g); }
  if (type === 'string') return normStr(unwrap(pred)) === normStr(unwrap(gold));
  const P = (Array.isArray(pred) ? pred : [pred]).map(v => typeof v === 'number' ? String(v) : normStr(v));
  const G = (Array.isArray(gold) ? gold : [gold]).map(v => typeof v === 'number' ? String(v) : normStr(v));
  if (P.length !== G.length) return false;
  if (type === 'ordered_list') return P.every((v, i) => v === G[i]);
  return [...P].sort().join('\u0001') === [...G].sort().join('\u0001');
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat: task types, answer normalisation and tolerant scorer`.

---

### Task 5: Question templates with gold SQL (tiers 1–3, holdout-only, Arabic)

**Files:**
- Create: `src/tasks/templates/index.ts`, `src/tasks/templates/tier1.ts`, `tier2.ts`, `tier3.ts`, `holdout.ts`
- Test: `tests/templates.test.ts`, `tests/fixtures/fixture.ts`

**Interfaces:**
- Produces: `interface Template { id: string; tier: 1|2|3; answerType: AnswerType; holdoutOnly?: boolean; moneyAggregate?: boolean; tables: string[]; sample(rng: Rng, db: DatabaseSync): TemplateInstance | null }`, `interface TemplateInstance { params: Record<string, string|number>; en: string[]; ar: string[]; sql: string }`, `ALL_TEMPLATES: Template[]`. `sample` returns `null` when a sampled parameter yields an empty/ambiguous gold (caller resamples). Every `sql` returns the answer in the **first column**, one row for scalars.

- [ ] **Step 1: Write the fixture** `tests/fixtures/fixture.ts`: builds an in-memory DB with 2 regions, 3 cities, 4 customers, 2 categories, 4 products, 3 employees, 8 orders across 2024/2025 with known items, 2 returns, 3 tickets — small enough that every expected answer in the tests is computed by hand in a comment next to the insert statements.

- [ ] **Step 2: Write the failing test** `tests/templates.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ALL_TEMPLATES } from '../src/tasks/templates/index.js';
import { fixtureDb } from './fixtures/fixture.js';
import { runReadOnly } from '../src/data/db.js';
import { createRng } from '../src/data/rng.js';
import { rowsToAnswer } from '../src/eval/score.js';

describe('templates', () => {
  it('has ≥ 30 templates, ≥ 8 per tier, 6 holdout-only, each with en and ar phrasings', () => {
    expect(ALL_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    for (const t of [1, 2, 3]) expect(ALL_TEMPLATES.filter(x => x.tier === t && !x.holdoutOnly).length).toBeGreaterThanOrEqual(8);
    expect(ALL_TEMPLATES.filter(x => x.holdoutOnly).length).toBe(6);
    expect(new Set(ALL_TEMPLATES.map(t => t.id)).size).toBe(ALL_TEMPLATES.length);
  });
  it('every template samples and its gold SQL runs on the fixture with a non-null first-column answer', () => {
    const db = fixtureDb();
    for (const t of ALL_TEMPLATES) {
      let inst = null; const rng = createRng(11);
      for (let i = 0; i < 20 && !inst; i++) inst = t.sample(rng, db);
      expect(inst, t.id).not.toBeNull();
      expect(inst!.en.length).toBeGreaterThanOrEqual(2); expect(inst!.ar.length).toBeGreaterThanOrEqual(1);
      const r = runReadOnly(db, inst!.sql); expect(r.ok, `${t.id}: ${(r as any).error}`).toBe(true);
      if (r.ok) expect(rowsToAnswer(r.rows, t.answerType.includes('list') ? 'list' : 'scalar'), t.id).not.toBeNull();
    }
  });
  it('hand-checked gold answers on the fixture', () => {
    const db = fixtureDb(); const by = (id: string) => ALL_TEMPLATES.find(t => t.id === id)!;
    const run = (sql: string) => { const r = runReadOnly(db, sql); if (!r.ok) throw new Error(r.error); return r.rows; };
    // fixture has 3 retail customers
    expect(run(by('t1_count_customers_segment').sample(createRng(1), db)!.sql.replace(/'[a-z]+'/, "'retail'"))[0]).toMatchObject({ n: 3 });
    // fixture: delivered revenue 2024 in region 'North' is 1 order: 2*10*(1-0) + 1*20 = 40
    expect(run(`${by('t2_region_revenue_period').sample(createRng(1), db)!.sql}`).length).toBeGreaterThan(0);
  });
});
```
Write the hand-checked block against the real fixture numbers once the fixture exists (three assertions minimum: one per tier), with the arithmetic in comments.

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement templates.** Shared helpers in `index.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { Rng } from '../../data/rng.js';
import type { AnswerType } from '../types.js';
export interface TemplateInstance { params: Record<string, string | number>; en: string[]; ar: string[]; sql: string }
export interface Template { id: string; tier: 1 | 2 | 3; answerType: AnswerType; holdoutOnly?: boolean; moneyAggregate?: boolean; tables: string[]; sample(rng: Rng, db: DatabaseSync): TemplateInstance | null }
export const REVENUE = 'oi.quantity * oi.unit_price * (1 - oi.discount_pct / 100.0)';
export const YEARS = [2024, 2025] as const;
export const QUARTERS: Record<string, [string, string]> = { Q1: ['01-01', '03-31'], Q2: ['04-01', '06-30'], Q3: ['07-01', '09-30'], Q4: ['10-01', '12-31'] };
export function pickRow<T>(db: DatabaseSync, rng: Rng, sql: string): T | null { const rows = db.prepare(sql).all() as T[]; return rows.length ? rng.pick(rows) : null; }
export function nonEmpty(db: DatabaseSync, sql: string): boolean { const r = db.prepare(sql).get() as Record<string, unknown> | undefined; return !!r && Object.values(r)[0] != null; }
import { TIER1 } from './tier1.js'; import { TIER2 } from './tier2.js'; import { TIER3 } from './tier3.js'; import { HOLDOUT } from './holdout.js';
export const ALL_TEMPLATES: Template[] = [...TIER1, ...TIER2, ...TIER3, ...HOLDOUT];
```

Template catalogue to implement (id — question gist — answer type). Each has ≥2 EN phrasings and ≥1 AR phrasing, and `sample` checks the gold is non-null/unambiguous (resample on ties for superlatives by requiring a strict max).

*Tier 1 (`tier1.ts`, 9):* `t1_count_customers_segment` (number) — how many customers in segment S; `t1_product_price` (number) — unit price of SKU; `t1_count_orders_status` (number) — orders with status X; `t1_employees_role_city` (list) — names of employees with role R in city C; `t1_count_products_category` (number) — active products in category; `t1_count_tickets_priority` (number) — tickets with priority P opened in year Y; `t1_customer_city` (string) — city of customer N; `t1_count_cities_region` (number) — cities in region R; `t1_max_unit_price_category` (number) — highest unit price in category.

*Tier 2 (`tier2.ts`, 9):* `t2_region_revenue_period` (number, money) — delivered revenue in region R during quarter Q of year Y; `t2_top_category_units_year` (string) — category with most units sold in year Y (delivered); `t2_channel_highest_aov` (string, money) — channel with highest average order value in year Y; `t2_customers_both_years` (number) — distinct customers who ordered in both 2024 and 2025; `t2_carrier_avg_delivery_days` (number) — average delivery days for carrier C (delivered shipments); `t2_payment_method_share` (number) — count of payments by method M in year Y; `t2_top_city_orders` (string) — city with most orders in year Y; `t2_segment_revenue_year` (number, money) — delivered revenue from segment S in year Y; `t2_open_tickets_topic` (number) — open (unclosed) tickets per topic T.

*Tier 3 (`tier3.ts`, 9):* `t3_top3_employees_net_revenue` (ordered_list, money) — top 3 employees by delivered revenue minus refunds in year Y, in order; `t3_month_highest_return_rate` (string) — month (`YYYY-MM`) of year Y with highest returned-items/shipped-items ratio; `t3_customers_slow_tickets_many_orders` (number) — customers whose average ticket resolution hours exceed the overall average and who have ≥ N orders; `t3_region_yoy_growth` (string, money) — region with highest YoY % growth in delivered revenue 2024→2025; `t3_product_margin_rank` (ordered_list, money) — top 3 products by total margin (revenue − cost×qty) in year Y; `t3_customers_no_orders_since` (number) — customers created before date D with no orders after date D; `t3_avg_items_per_order_by_segment_max` (string) — segment with highest avg items per delivered order in year Y; `t3_employee_cancel_rate_max` (string) — sales employee (≥ N orders) with highest cancellation rate in year Y; `t3_second_best_category_revenue` (string, money) — second-highest category by delivered revenue in year Y (window function).

*Holdout-only (`holdout.ts`, 6, two per tier):* `h1_count_shipments_carrier_year` (number); `h1_avg_discount_category` (number); `h2_city_most_urgent_tickets_year` (string); `h2_wholesale_customers_per_region_max` (string); `h3_quarter_highest_refund_ratio` (string, money) — quarter of year Y with highest refunds/revenue; `h3_managers_team_revenue_rank` (ordered_list, money) — regional managers ranked by their reports' delivered revenue in year Y, top 3.

Gold SQL pattern example (`t2_region_revenue_period`):
```sql
SELECT ROUND(SUM(${REVENUE}), 2) AS revenue
FROM orders o JOIN order_items oi ON oi.order_id = o.id
JOIN customers c ON c.id = o.customer_id JOIN cities ci ON ci.id = c.city_id JOIN regions r ON r.id = ci.region_id
WHERE o.status = 'delivered' AND r.name = '${region}' AND o.order_date BETWEEN '${y}-${from}' AND '${y}-${to}'
```
Phrasings example: EN `What was the total delivered revenue for the ${region} region in ${q} ${y}?` / `How much revenue did delivered orders generate in ${region} during ${q} ${y}?`; AR `كم إجمالي إيرادات الطلبات المسلّمة في منطقة ${region} خلال ${q} ${y}؟`. State the revenue definition in the glossary (Task 9) exactly as the SQL computes it.

- [ ] **Step 5: Run** → PASS (iterate per template). **Step 6: Commit** `feat: 33 question templates with hand-checked gold SQL`.

---

### Task 6: Task set generation (dev / holdout / Arabic / renamed schema)

**Files:**
- Create: `src/tasks/generate.ts`, `src/data/rename.ts`
- Test: `tests/taskgen.test.ts`

**Interfaces:**
- Produces: `generateTasks(db, opts: { seed: number; n: number; holdout: boolean; lang: 'en'|'ar'; rename?: RenameMap }): Task[]` — balanced across tiers (n/3 each), templates round-robin within a tier, phrasing picked by rng, gold computed by executing `sql` via `runReadOnly` + `rowsToAnswer`; tasks whose gold is null are resampled; ids `${templateId}-${k}`. `holdout: false` excludes `holdoutOnly` templates; `holdout: true` includes all templates. `RENAME_MAP: RenameMap = { tables: Record<string,string>; columns: Record<string,string> }` (`customers→clients`, `orders→sales_orders`, `order_items→sales_order_lines`, `unit_price→price_per_unit`, `order_date→placed_on`, `segment→customer_tier`, `discount_pct→discount_percent`); `applyRenameToDb(db, map)` (ALTER TABLE … RENAME / RENAME COLUMN); `applyRenameToSql(sql, map): string` (word-boundary replace, longest first).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { openDb, createSchema, runReadOnly } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';
import { generateTasks } from '../src/tasks/generate.js';
import { RENAME_MAP, applyRenameToDb, applyRenameToSql } from '../src/data/rename.js';
import { scoreAnswer } from '../src/eval/score.js';

function db() { const d = openDb(':memory:'); createSchema(d); generateCompany(d, 5, { customers: 60, products: 30, employees: 10, orders: 600, tickets: 80 }); return d; }

describe('generateTasks', () => {
  it('balances tiers, excludes holdout templates, is deterministic', () => {
    const d = db(); const a = generateTasks(d, { seed: 1, n: 30, holdout: false, lang: 'en' });
    expect(a.length).toBe(30); for (const t of [1, 2, 3]) expect(a.filter(x => x.tier === t).length).toBe(10);
    expect(a.some(x => x.templateId.startsWith('h'))).toBe(false);
    expect(generateTasks(d, { seed: 1, n: 30, holdout: false, lang: 'en' })).toEqual(a);
    expect(a.every(x => x.gold != null && x.question.length > 10)).toBe(true);
  });
  it('holdout includes holdout-only templates and arabic uses arabic text', () => {
    const d = db(); const h = generateTasks(d, { seed: 2, n: 60, holdout: true, lang: 'ar' });
    expect(h.some(x => x.templateId.startsWith('h'))).toBe(true); expect(h.every(x => /[؀-ۿ]/.test(x.question))).toBe(true);
  });
  it('renamed schema keeps gold answers identical', () => {
    const d1 = db(); const base = generateTasks(d1, { seed: 3, n: 15, holdout: false, lang: 'en' });
    const d2 = db(); applyRenameToDb(d2, RENAME_MAP);
    for (const t of base) { const r = runReadOnly(d2, applyRenameToSql(t.goldSql, RENAME_MAP)); expect(r.ok, t.id).toBe(true); }
    expect(applyRenameToSql('SELECT unit_price FROM order_items oi', RENAME_MAP)).toBe('SELECT price_per_unit FROM sales_order_lines oi');
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `generate.ts` (round-robin per tier, resample up to 25 times, compute gold) and `rename.ts` (map + `ALTER TABLE x RENAME TO y`, `ALTER TABLE t RENAME COLUMN a TO b` — note SQLite keeps FK references consistent on table rename when `PRAGMA legacy_alter_table=OFF`, which is the default). When `rename` is passed to `generateTasks`, the gold SQL is rewritten and the task's `goldSql` stores the rewritten form so the agent and the oracle see the same DB.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat: task set generation with holdout, arabic and schema-rename modes`.

---

### Task 7: LLM client (types, mock, OpenRouter)

**Files:**
- Create: `src/llm/types.ts`, `src/llm/mock.ts`, `src/llm/openrouter.ts`, `src/llm/prices.ts`
- Test: `tests/llm.test.ts`

**Interfaces:**
- Produces: `interface ChatMessage { role: 'system'|'user'|'assistant'; content: string }`; `interface LlmResponse { text: string; promptTokens: number; completionTokens: number; costUsd: number; latencyMs: number; model: string; generationId?: string }`; `interface LlmClient { chat(model: string, messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<LlmResponse> }`; `createOpenRouterClient(opts: { apiKey: string; fetchImpl?: typeof fetch; concurrency?: number; timeoutMs?: number; maxAttempts?: number }): LlmClient`; `createMockClient(script: (model: string, messages: ChatMessage[]) => string | { text: string; promptTokens?: number; completionTokens?: number }): LlmClient & { calls: { model: string; messages: ChatMessage[] }[] }` (mock cost computed from `prices.ts`, latency 1 ms); `PRICES: Record<string, { input: number; output: number }>` USD per token (haiku-5.5 0.10e-6/0.50e-6, sonnet-5.5 2e-6/10e-6, qwen3.7-flash 0.03e-6/0.13e-6, gpt-5.4-nano 0.20e-6/1.25e-6, gpt-5.4 2.5e-6/15e-6); `estimateCost(model, promptTokens, completionTokens): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createOpenRouterClient } from '../src/llm/openrouter.js';
import { createMockClient } from '../src/llm/mock.js';
import { estimateCost } from '../src/llm/prices.js';

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('openrouter client', () => {
  it('sends temperature 0 and usage.include, parses usage and cost', async () => {
    let seen: any; const fetchImpl = (async (_u: string, init: any) => { seen = JSON.parse(init.body); return ok({ id: 'gen-1', choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.0001 } }); }) as any;
    const c = createOpenRouterClient({ apiKey: 'k', fetchImpl });
    const r = await c.chat('m', [{ role: 'user', content: 'x' }]);
    expect(seen.temperature).toBe(0); expect(seen.usage).toEqual({ include: true }); expect(seen.model).toBe('m');
    expect(r).toMatchObject({ text: 'hi', promptTokens: 10, completionTokens: 2, costUsd: 0.0001, generationId: 'gen-1' });
  });
  it('falls back to the price table when cost is missing', async () => {
    const fetchImpl = (async () => ok({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } })) as any;
    const r = await createOpenRouterClient({ apiKey: 'k', fetchImpl }).chat('anthropic/claude-haiku-5.5', []);
    expect(r.costUsd).toBeCloseTo(0.0001 + 0.00005, 9);
  });
  it('retries on 429 then succeeds, gives up after maxAttempts', async () => {
    let n = 0; const fetchImpl = (async () => (++n < 3 ? ok({ error: 'rate' }, 429) : ok({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))) as any;
    const r = await createOpenRouterClient({ apiKey: 'k', fetchImpl, maxAttempts: 3, backoffMs: 1 } as any).chat('m', []); expect(r.text).toBe('ok'); expect(n).toBe(3);
    const bad = (async () => ok({}, 500)) as any;
    await expect(createOpenRouterClient({ apiKey: 'k', fetchImpl: bad, maxAttempts: 2, backoffMs: 1 } as any).chat('m', [])).rejects.toThrow(/500/);
  });
  it('mock client records calls and prices them', async () => {
    const m = createMockClient(() => ({ text: 'y', promptTokens: 100, completionTokens: 10 }));
    const r = await m.chat('anthropic/claude-sonnet-5.5', [{ role: 'user', content: 'q' }]);
    expect(m.calls.length).toBe(1); expect(r.costUsd).toBeCloseTo(estimateCost('anthropic/claude-sonnet-5.5', 100, 10), 12);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** `openrouter.ts` core:

```ts
export function createOpenRouterClient(o: { apiKey: string; fetchImpl?: typeof fetch; concurrency?: number; timeoutMs?: number; maxAttempts?: number; backoffMs?: number }): LlmClient {
  const f = o.fetchImpl ?? fetch; const sem = semaphore(o.concurrency ?? 4); const attempts = o.maxAttempts ?? 3; const backoff = o.backoffMs ?? 1000;
  return { async chat(model, messages, opts = {}) {
    return sem(async () => {
      let lastErr = ''; for (let a = 1; a <= attempts; a++) {
        const t0 = performance.now(); const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 60000);
        try {
          const res = await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${o.apiKey}`, 'content-type': 'application/json', 'HTTP-Referer': 'https://github.com/Ahmednsh/humain-less-compute', 'X-Title': 'humain-less-compute' }, body: JSON.stringify({ model, messages, temperature: 0, max_tokens: opts.maxTokens ?? 800, usage: { include: true } }) });
          const latencyMs = performance.now() - t0;
          if (res.status === 429 || res.status >= 500) { lastErr = `HTTP ${res.status}`; await sleep(backoff * 2 ** (a - 1)); continue; }
          if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
          const j = await res.json() as any; const u = j.usage ?? {}; const pt = u.prompt_tokens ?? 0, ct = u.completion_tokens ?? 0;
          return { text: j.choices?.[0]?.message?.content ?? '', promptTokens: pt, completionTokens: ct, costUsd: typeof u.cost === 'number' ? u.cost : estimateCost(model, pt, ct), latencyMs, model: j.model ?? model, generationId: j.id };
        } catch (e) { if ((e as Error).name === 'AbortError') { lastErr = 'timeout'; continue; } throw e; } finally { clearTimeout(timer); }
      }
      throw new Error(`OpenRouter failed after ${attempts} attempts: ${lastErr}`);
    });
  } };
}
```
`semaphore(n)` returns `<T>(fn: () => Promise<T>) => Promise<T>` with a FIFO queue.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat: OpenRouter client with retries, cost capture and mock`.

---

### Task 8: Config

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts` (one test: `POLICIES.P0` equals `{ tier: 'large', prune: false, verify: 'none' }`, `POLICIES.P3` equals `{ tier: 'auto', prune: true, verify: 'selective' }`; `FLOORS` values).

**Interfaces:**
- Produces: `TIERS = { small: 'anthropic/claude-haiku-5.5', large: 'anthropic/claude-sonnet-5.5' }` (overridable by env `SMALL_MODEL`, `LARGE_MODEL`); `type Policy = { tier: 'small'|'large'|'auto'; prune: boolean; verify: 'none'|'always'|'selective' }`; `POLICIES: Record<'P0'|'S'|'P1'|'P2'|'P3'|'V', Policy>`; `THRESHOLDS = { routerHi: 4, verifyConfidence: 0.75, verifyComplexity: 3, maxRepairs: { small: 1, large: 2 } }`; `FLOORS = { accuracyDropPp: 2.0, p95LatencyFactor: 1.25 }`; `loadApiKey(): string` (calls `process.loadEnvFile('.env')` if the file exists, throws a clear error if the key is missing).

- [ ] Steps: test → fail → implement → pass → commit `feat: config with tiers, policies, thresholds and floors`.

---

### Task 9: Context builder (full and pruned)

**Files:**
- Create: `src/agent/context.ts`, `src/agent/glossary.ts`, `src/agent/fewshots.ts`
- Test: `tests/context.test.ts`

**Interfaces:**
- Produces: `buildContext(q: string, schema: SchemaInfo, mode: 'full'|'pruned'): { ddl: string; tables: string[]; glossary: string; fewshots: { q: string; sql: string }[] }`; `selectTables(q, schema): string[]` (exported for tests); `SYNONYMS: Record<string, string[]>` mapping a table name to trigger words (`order_items: ['revenue','sales','units','sold','items','quantity','margin','discount']`, `returns: ['return','returned','refund']`, `support_tickets: ['ticket','support','resolution','open','closed']`, `shipments: ['ship','shipped','deliver','delivery','carrier','days']`, `payments: ['payment','paid','method','card','cash']`, `employees: ['employee','rep','manager','staff','sales rep']`, `customers: ['customer','client','segment','wholesale','retail','enterprise']`, `products: ['product','sku','price','margin','cost','active']`, `categories: ['category']`, `regions: ['region']`, `cities: ['city','cities']`, `orders: ['order','orders','channel','status','cancelled','delivered','aov']`) plus Arabic triggers (`['إيراد','مبيعات']` → order_items, `['عميل','عملاء']` → customers, `['منطقة']` → regions, `['مدينة']` → cities, `['مرتجع','استرداد']` → returns, `['تذكرة','تذاكر','دعم']` → support_tickets, `['شحن','توصيل','ناقل']` → shipments, `['موظف','مندوب','مدير']` → employees, `['منتج','فئة','سعر']` → products/categories, `['دفع','دفعات']` → payments, `['طلب','طلبات','قناة','حالة']` → orders). Table-name and column-name tokens also match. The result is FK-connected: a BFS over the undirected FK graph adds the shortest connecting path between every pair of selected tables. If nothing matches, fall back to `['orders','order_items','customers','products']`.
- `GLOSSARY` text (full mode only): revenue = quantity × unit_price × (1 − discount_pct/100) on order_items; "delivered revenue" = orders with status 'delivered'; AOV = revenue per order; net revenue = revenue − refund_amount of returns; delivery days = julianday(delivered_at) − julianday(shipped_at); resolution hours = (julianday(closed_at) − julianday(opened_at)) × 24; return rate = returned items / shipped order items; quarters by calendar; dates are ISO text. In pruned mode only the glossary lines whose keywords appear in the question are included (keyword list per line).
- `FEWSHOTS`: 8 (question, sql) pairs covering counts, joins, date ranges, group-by superlative, window ranking, and NULL handling — none identical to a template instance. Pruned mode picks the top 2 by word overlap with the question (0 if overlap is zero).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { openDb, createSchema, introspectSchema } from '../src/data/db.js';
import { selectTables, buildContext } from '../src/agent/context.js';

const schema = () => { const d = openDb(':memory:'); createSchema(d); return introspectSchema(d); };
describe('context', () => {
  it('selects relevant tables for a revenue-by-region question', () => {
    const t = selectTables('What was the total delivered revenue for the Asir region in Q2 2025?', schema());
    for (const n of ['orders', 'order_items', 'customers', 'cities', 'regions']) expect(t).toContain(n);
    expect(t).not.toContain('support_tickets');
  });
  it('connects disconnected tables', () => {
    const t = selectTables('Which employee has the most refunds?', schema());
    for (const n of ['employees', 'returns', 'order_items', 'orders']) expect(t).toContain(n);
  });
  it('arabic question maps to tables', () => {
    expect(selectTables('كم عدد العملاء في منطقة الرياض؟', schema())).toEqual(expect.arrayContaining(['customers', 'cities', 'regions']));
  });
  it('pruned context is much smaller than full', () => {
    const q = 'How many customers are in the wholesale segment?'; const s = schema();
    const full = buildContext(q, s, 'full'), pruned = buildContext(q, s, 'pruned');
    expect(full.tables.length).toBe(12); expect(pruned.tables).toEqual(['customers']);
    expect(pruned.ddl.length * 3).toBeLessThan(full.ddl.length); expect(full.fewshots.length).toBe(8); expect(pruned.fewshots.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`tokenize = q.toLowerCase().match(/[\p{L}\p{N}_]+/gu)`, match tokens and bigrams against synonyms/table/column names, BFS on FK graph, DDL via `schemaToDdl(schema, tables)`). **Step 4:** PASS. **Step 5: Commit** `feat: context builder with lexical table pruning and FK-connected joins`.

---

### Task 10: Executor (prompt → JSON → SQL → repair)

**Files:**
- Create: `src/agent/executor.ts`, `src/agent/prompts.ts`, `src/agent/trace.ts`
- Test: `tests/executor.test.ts`

**Interfaces:**
- Produces (`trace.ts`): `interface CallRecord { purpose: 'generate'|'repair'|'verify'; model: string; promptTokens: number; completionTokens: number; costUsd: number; latencyMs: number }`; `interface AttemptResult { tier: 'small'|'large'; sql: string | null; answerShape: 'scalar'|'list'; confidence: number; rows: Row[] | null; answer: Answer | null; error: string | null; repairs: number; calls: CallRecord[] }`.
- Produces (`executor.ts`): `runAttempt(args: { client: LlmClient; model: string; tier: 'small'|'large'; db: DatabaseSync; question: string; ctx: ReturnType<typeof buildContext>; maxRepairs: number }): Promise<AttemptResult>`; `parseModelJson(text: string): { sql: string; answer_shape: 'scalar'|'list'; confidence: number } | null` (strips ``` fences, finds first `{…}` block, validates with zod; confidence clamped 0–1, default 0.5; answer_shape default 'scalar').
- Produces (`prompts.ts`): `systemPrompt(ctx)` — "You are a senior SQLite analyst… Use only the tables below… Put the answer in the FIRST column, one row for a single value… Return ONLY a JSON object: {"sql": string, "answer_shape": "scalar"|"list", "confidence": number 0..1}"; `repairPrompt(error: string, rowsPreview?: string)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { openDb, createSchema, introspectSchema } from '../src/data/db.js';
import { generateCompany } from '../src/data/generate.js';
import { createMockClient } from '../src/llm/mock.js';
import { buildContext } from '../src/agent/context.js';
import { runAttempt, parseModelJson } from '../src/agent/executor.js';

const setup = () => { const db = openDb(':memory:'); createSchema(db); generateCompany(db, 1, { customers: 20, products: 10, employees: 5, orders: 50, tickets: 10 }); return { db, schema: introspectSchema(db) }; };
const J = (o: unknown) => JSON.stringify(o);

describe('executor', () => {
  it('parses fenced json', () => {
    expect(parseModelJson('Here you go:\n```json\n{"sql":"SELECT 1","answer_shape":"scalar","confidence":0.9}\n```')).toMatchObject({ sql: 'SELECT 1', confidence: 0.9 });
    expect(parseModelJson('{"sql":"SELECT 1"}')).toMatchObject({ sql: 'SELECT 1', answer_shape: 'scalar', confidence: 0.5 });
    expect(parseModelJson('no json here')).toBeNull();
  });
  it('runs sql and extracts the answer', async () => {
    const { db, schema } = setup(); const client = createMockClient(() => J({ sql: 'SELECT COUNT(*) FROM customers', answer_shape: 'scalar', confidence: 0.95 }));
    const r = await runAttempt({ client, model: 'm', tier: 'small', db, question: 'How many customers?', ctx: buildContext('How many customers?', schema, 'pruned'), maxRepairs: 1 });
    expect(r.answer).toBe(20); expect(r.error).toBeNull(); expect(r.repairs).toBe(0); expect(r.calls.length).toBe(1); expect(r.calls[0]!.purpose).toBe('generate');
  });
  it('repairs after an sql error and feeds the error back', async () => {
    const { db, schema } = setup(); let n = 0;
    const client = createMockClient((_m, msgs) => (++n === 1 ? J({ sql: 'SELECT nope FROM customers' }) : (expect(msgs.at(-1)!.content).toMatch(/no such column/), J({ sql: 'SELECT COUNT(*) FROM customers' }))));
    const r = await runAttempt({ client, model: 'm', tier: 'large', db, question: 'q', ctx: buildContext('q', schema, 'full'), maxRepairs: 2 });
    expect(r.answer).toBe(20); expect(r.repairs).toBe(1); expect(r.calls.map(c => c.purpose)).toEqual(['generate', 'repair']);
  });
  it('gives up after maxRepairs and reports the error', async () => {
    const { db, schema } = setup(); const client = createMockClient(() => J({ sql: 'DELETE FROM customers' }));
    const r = await runAttempt({ client, model: 'm', tier: 'small', db, question: 'q', ctx: buildContext('q', schema, 'pruned'), maxRepairs: 1 });
    expect(r.answer).toBeNull(); expect(r.error).toMatch(/only SELECT/); expect(r.calls.length).toBe(2);
    expect((db.prepare('SELECT COUNT(*) c FROM customers').get() as any).c).toBe(20);
  });
  it('treats unparseable output as a repair', async () => {
    const { db, schema } = setup(); let n = 0; const client = createMockClient(() => (++n === 1 ? 'garbage' : J({ sql: 'SELECT 1' })));
    const r = await runAttempt({ client, model: 'm', tier: 'small', db, question: 'q', ctx: buildContext('q', schema, 'pruned'), maxRepairs: 1 });
    expect(r.answer).toBe(1); expect(r.repairs).toBe(1);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (messages = [system, …fewshots as user/assistant pairs, user question]; loop `maxRepairs + 1` times; on parse failure or `runReadOnly` error append assistant text + user repair prompt; on success set `answer = rowsToAnswer(rows, answer_shape)`; on empty rows set `error = 'empty result'` and allow one repair if budget remains). **Step 4:** PASS. **Step 5: Commit** `feat: executor with JSON parsing, safe execution and repair loop`.

---

### Task 11: Router

**Files:**
- Create: `src/agent/router.ts`
- Test: `tests/router.test.ts`

**Interfaces:**
- Produces: `routerFeatures(q: string, schema: SchemaInfo): { tokens: number; agg: number; superlative: boolean; ratioGrowth: boolean; period: boolean; entities: number; comparative: boolean; money: boolean }`; `difficultyScore(f): number` = `agg + (superlative?1:0) + (ratioGrowth?2:0) + (period?1:0) + max(0, entities−2) + (comparative?2:0) + (tokens>18?1:0)`; `route(q, schema, thetaHi: number): { tier: 'small'|'large'; score: number; features }`. Word lists (EN+AR): agg `total|sum|average|avg|count|how many|number of|مجموع|إجمالي|متوسط|كم عدد`; superlative `most|highest|top|largest|best|second|lowest|fewest|أعلى|أكثر|أكبر|أقل|ثاني`; ratioGrowth `rate|ratio|growth|share|percent|margin|net|نسبة|نمو|هامش|صافي`; period `20\d\d|q[1-4]|month|quarter|year|شهر|ربع|سنة|عام`; comparative `both|more than|exceed|above the average|per |for each|at least|على الأقل|أكثر من|لكل`; money `revenue|margin|refund|aov|order value|إيراد|هامش|استرداد`; entities = number of distinct tables matched by `selectTables`' lexical stage (export `matchTables(q, schema)` from context.ts without the FK closure).

- [ ] **Step 1: Write the failing test** — tier-1 question (`How many customers are in the wholesale segment?`) scores ≤ 2 and routes small at θ=4; tier-3 question (`Which region had the highest year-over-year growth in delivered revenue from 2024 to 2025?`) scores ≥ 5 and routes large; Arabic tier-3 question routes large; `money` true for "revenue" and false for "how many cities". **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5: Commit** `feat: zero-token lexical difficulty router`.

---

### Task 12: Verifier

**Files:**
- Create: `src/agent/verifier.ts`
- Test: `tests/verifier.test.ts`

**Interfaces:**
- Produces: `freeChecks(a: AttemptResult): { ok: boolean; reason: string | null }` (fails on `error`, null answer, empty rows, declared `scalar` but >1 row with >1 distinct value, negative count-like numbers when question contains how many/count); `sqlComplexity(sql: string): number` = joins + subselects (`(select`) + windows (`over (`) + ctes (`with`); `shouldVerify(args: { confidence: number; sql: string; money: boolean; thresholds }): { verify: boolean; reasons: string[] }`; `llmVerify(args: { client; model; db; question; ctx; sql; rowsPreview: string }): Promise<{ verdict: 'correct'|'incorrect'; correctedSql: string | null; call: CallRecord }>` — prompt asks for JSON `{"verdict":"correct"|"incorrect","corrected_sql":string|null,"reason":string}`; `applyCorrection(db, correctedSql, shape): { rows; answer } | { error }`.

- [ ] **Step 1: Write the failing test** — `shouldVerify` true for confidence 0.6; true for complexity ≥ 3 (`SELECT … FROM a JOIN b JOIN c JOIN d`); true for money; false for a confident simple non-money query; `freeChecks` flags empty rows and the scalar/multirow mismatch; `llmVerify` with a mock returning `incorrect` + corrected sql yields the corrected answer and a `verify` call record; `sqlComplexity` counts. **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5: Commit** `feat: free checks and selective LLM verification`.

---

### Task 13: Controller (policies and escalation)

**Files:**
- Create: `src/agent/controller.ts`
- Test: `tests/controller.test.ts`

**Interfaces:**
- Produces: `interface TaskOutcome { taskId: string; answer: Answer | null; route: 'small'|'large'; escalated: boolean; verified: boolean; verifyReasons: string[]; verdict: 'correct'|'incorrect'|null; corrected: boolean; tablesSent: string[]; attempts: AttemptResult[]; calls: CallRecord[]; promptTokens: number; completionTokens: number; costUsd: number; latencyMs: number; routerScore: number; error: string | null }`; `runTask(args: { task: Pick<Task,'id'|'question'>; policy: Policy; client: LlmClient; db: DatabaseSync; schema: SchemaInfo; thresholds?: typeof THRESHOLDS; tiers?: typeof TIERS }): Promise<TaskOutcome>`. Flow: route (auto → router; fixed otherwise) → ctx (`prune ? 'pruned' : 'full'`) → attempt → freeChecks → (verify per policy) → escalate once from small to large when freeChecks fail or verdict is `incorrect` without a usable correction; large attempts are never escalated. `latencyMs` is wall-clock for the whole task (sum of sequential call latencies + SQL time).

- [ ] **Step 1: Write the failing test** — with the mock: (a) P0 uses the large model once, no verify; (b) P3 on an easy question uses small, no verify, no escalation; (c) P3 when the small model returns an SQL error twice escalates to large and the final answer comes from large with `escalated: true` and cost summed over all calls; (d) V verifies every task; (e) P3 on a money question verifies with reason `money`; (f) the agent never receives `tier` or `gold` (assert the mock's messages never contain the string `"tier"`). **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5: Commit** `feat: controller with routing, selective verification and escalation`.

---

### Task 14: Eval runner, metrics and report

**Files:**
- Create: `src/eval/run.ts`, `src/eval/metrics.ts`, `src/eval/report.ts`
- Test: `tests/eval.test.ts`

**Interfaces:**
- Produces (`run.ts`): `interface RunRow { runId: string; policy: string; taskId: string; templateId: string; tier: 1|2|3; lang: string; correct: boolean; answer: Answer|null; gold: Answer; route; escalated; verified; verdict; corrected; tablesSent: string[]; promptTokens; completionTokens; costUsd; latencyMs; repairs: number; routerScore; error: string|null; ts: string }`; `runEval(args: { policyName: string; policy: Policy; tasks: Task[]; client; db; schema; outPath: string; concurrency?: number; onRow?: (r: RunRow) => void }): Promise<RunRow[]>` — reads existing `outPath` rows and skips their task ids (resume), appends one JSON line per task as it completes.
- Produces (`metrics.ts`): `summarize(rows: RunRow[]): Summary` with `{ n, accuracy, accuracyByTier: Record<1|2|3, number>, p50LatencyMs, p95LatencyMs, promptTokensPerTask, completionTokensPerTask, costTotal, costPerTask, costPerSuccess, pctSmall, pctEscalated, pctVerified, pctRepaired, errors }`; `percentile(xs: number[], p: number): number` (nearest-rank); `checkFloors(baseline: Summary, candidate: Summary, floors): { accuracyOk: boolean; latencyOk: boolean }`.
- Produces (`report.ts`): `renderMarkdown(rows: { name: string; s: Summary }[], baselineName: string): string` (the headline table with Δ cost per success vs baseline and floor pass/fail marks); `renderHtml(...)`: same table plus per-tier accuracy, in a single self-contained HTML string; `appendExperimentLog(path: string, entry: { runId; policy; taskset; n; summary: Summary; notes: string }): void` (creates the file with a header row if absent).

- [ ] **Step 1: Write the failing test** — `percentile([1,2,3,4,5], 95)` = 5 and `50` = 3; `summarize` on 4 synthetic rows gives accuracy 0.5, costPerSuccess = total/2, pctSmall; `checkFloors` passes at −1.9 pp and fails at −2.1 pp; `resumes without duplicates`: run `runEval` with a mock over 5 tasks to a temp file, run again with a mock that throws if called → second run returns 5 rows and the mock has 0 calls; `renderMarkdown` contains the baseline name and a `✅`/`❌` floor mark; `appendExperimentLog` creates header once and appends two rows. **Step 2:** FAIL. **Step 3:** implement (concurrency via the same semaphore helper, moved to `src/util/semaphore.ts`). **Step 4:** PASS. **Step 5: Commit** `feat: resumable eval runner, metrics, markdown/html report`.

---

### Task 15: CLI and mock smoke eval in CI

**Files:**
- Create: `src/cli.ts`, `src/util/args.ts`
- Modify: `README.md` (usage section), `.gitignore` (add `data/*.sqlite`, `data/*.jsonl`, keep `.gitkeep`)
- Test: `tests/cli.test.ts` (parses `--seed 3 --mock` into `{ seed: 3, mock: true }`)

**Interfaces:**
- Commands: `gen-db --seed N --out PATH [--rename]`; `gen-tasks --db PATH --seed N --n N --out PATH [--holdout] [--lang en|ar] [--rename]` (refuses `--holdout` when `--out` resolves inside the repo); `eval --policy P0|S|P1|P2|P3|V --tasks PATH --db PATH --out PATH [--limit N] [--mock] [--small MODEL] [--large MODEL] [--theta N] [--notes TEXT]` (prints a live line per task: `✔/✘ id route=small esc=0 ver=0 $0.0004 812ms`, then the summary; appends to `results/EXPERIMENTS.md` unless `--mock`); `report --runs a.jsonl,b.jsonl --baseline P0 [--html results/report.html]`.
- The mock used by `--mock` answers every task with the task's own gold SQL for even-indexed tasks and a wrong but valid `SELECT 0` for odd ones (so the smoke run exercises correct, incorrect, verification and escalation paths with zero spend). It must not read `gold` from the task object inside the controller: the CLI constructs the mock closure outside and keys it by question text.

- [ ] Steps: test → fail → implement → run `npm run gen:db`, `npm run gen:tasks`, generate `data/smoke.jsonl` (seed 7, n 10), `npm run smoke` → prints a table → commit `feat: cli with gen-db, gen-tasks, eval, report and mock smoke`. Push and confirm the GitHub Actions run is green.

---

### Task 16: Baseline measurement (P0 and S on dev)

**Files:**
- Create: `results/runs/<ts>-P0-dev.jsonl`, `results/runs/<ts>-S-dev.jsonl`, `results/EXPERIMENTS.md`
- Modify: `DECISIONS.md` (D-013: baseline numbers frozen; floors instantiated as absolute values)

- [ ] **Step 1:** Ensure `.env` has the key (ask the participant if absent; do not proceed with real runs without it). Run a 3-task probe: `npm run cli -- eval --policy P0 --tasks data/dev.jsonl --db data/company.sqlite --limit 3 --out results/runs/probe.jsonl` and inspect that cost and tokens are non-zero and answers parse. Delete the probe file.
- [ ] **Step 2:** `eval --policy P0` over all 150 dev tasks. Record the summary. **Step 3:** `eval --policy S`. **Step 4:** `report --runs …P0…,…S… --baseline P0`. **Step 5:** Add D-013 with the absolute floors (accuracy ≥ P0 − 2 pp; p95 ≤ 1.25 × P0 p95) and commit logs + EXPERIMENTS rows: `exp: baseline P0 and small-only S on dev`.

---

### Task 17: Ablation ladder and threshold selection on dev

- [ ] **Step 1:** `eval --policy P1` with θ ∈ {3, 4, 5, 6} (four runs, `--theta`); pick the smallest θ whose accuracy meets the floor; log all four rows (the sweep is itself evidence). Record the chosen θ in `config.ts` and D-014.
- [ ] **Step 2:** `eval --policy P2`. If pruning drops accuracy by more than 1 pp vs P1, inspect the pruner misses (`tablesSent` vs tables referenced in `goldSql`, computed by a one-off script in `scripts/pruner-miss.ts`) and extend `SYNONYMS`; re-run; log both runs.
- [ ] **Step 3:** `eval --policy P3` (full system). **Step 4:** `eval --policy V`. **Step 5:** `report` over P0,S,P1,P2,P3,V → `results/report.md` + `results/report.html`; commit `exp: ablation ladder on dev`.

---

### Task 18: Robustness experiments

- [ ] **R1:** `gen-db --seed 42 --rename --out data/company_renamed.sqlite`; `gen-tasks --db data/company_renamed.sqlite --seed 2001 --n 90 --rename --out data/r1.jsonl`; run P0 and P3; log.
- [ ] **R2:** `gen-tasks --db data/company.sqlite --seed 2002 --n 90 --lang ar --out data/r2.jsonl`; run P0 and P3; log.
- [ ] **R3:** `gen-tasks --seed 2003 --n 90 --out data/r3.jsonl`; run P3 with `--small qwen/qwen3.7-flash`; compare with P3 on the same set with the default small model; log.
- [ ] Add a "Robustness" table to `results/report.md` (escalation rate and accuracy per experiment); add D-015 with observations; commit `exp: robustness R1 schema rename, R2 arabic, R3 model swap`.

---

### Task 19: Held-out generation and final run

- [ ] **Step 1:** Freeze thresholds (commit). **Step 2:** The participant (or, if absent, a one-liner `node -e "console.log(require('crypto').randomInt(1e9))" > ../humain-holdout/seed.txt` whose output is **not printed to the terminal**) provides the seed; run `gen-tasks --db data/company.sqlite --seed $(cat ../humain-holdout/seed.txt) --n 150 --holdout --out ../humain-holdout/holdout.jsonl`. Never `cat` that file. **Step 3:** One run each: `eval --policy P0 --tasks ../humain-holdout/holdout.jsonl --out results/runs/<ts>-P0-holdout.jsonl` and P3. The run log contains answers and gold per task; it is committed as evidence but not opened by the assistant except through `report`. **Step 4:** `report` → "Held-out" section in `results/report.md`; D-016 states the protocol was followed and lists the exact commands; commit `exp: held-out final run`.

---

### Task 20: Submission package

**Files:**
- Modify: `README.md` (results tables, how to reproduce, limitations, licence audit)
- Create: `docs/slides/slides.md` (9 slides following the platform's 9-section guideline, English), `docs/slides/demo-script.md` (3-minute script: intro 20 s, live `eval --limit 8` on P3 with the per-task decision lines 80 s, open `report.html` 50 s, limitations 20 s), `docs/LICENSE-AUDIT.md` (each dependency and its licence)
- Modify: `DECISIONS.md` (D-017 final numbers and what was left out)

- [ ] **Step 1:** Write README results from `results/report.md` (copy the tables, do not retype numbers). **Step 2:** Slides and demo script. **Step 3:** Licence audit via `npm ls --all --json` + each package's `license` field; confirm no GPL/AGPL. **Step 4:** Run `npm run typecheck && npm test && npm run smoke`. **Step 5:** Invoke `superpowers:requesting-code-review` (or `agent-skills:review`) on the whole repo; fix findings. **Step 6:** Commit `docs: submission package` and push. **Step 7:** Hand the participant: repo URL, `results/report.html`, slide content to export to PDF, the demo script, and the platform fields text (one-sentence description, Issue & Solution, How It Works, "why consider you").

---

## Self-review notes

- Spec coverage: data (T2–3), tasks (T5–6), client (T7), tiers/config (T8), context (T9), executor (T10), router (T11), verifier (T12), controller/escalation (T13), harness/metrics/report/floors (T14), CLI/CI smoke (T15), baseline (T16), ladder (T17), robustness R1–R3 (T18), held-out protocol (T19), submission/limitations/licence (T20). Error handling: LLM retries (T7), SQL guard and errors (T2, T10), JSON re-ask (T10), resume (T14).
- Type consistency: `AttemptResult.calls: CallRecord[]` is reused by `TaskOutcome` and flattened into `RunRow` token/cost sums; `Policy` shape identical in T8 and T13; `buildContext` return type is consumed by T10/T12/T13 as `ReturnType<typeof buildContext>`.
- Review Focus items are pinned to tests in T10 (fenced JSON), T2 (write guard), T4 (formatted numbers), T9 (disconnected tables), T14 (resume).
