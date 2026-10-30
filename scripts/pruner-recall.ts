/**
 * Component validation for the context pruner (zero LLM cost):
 * for every task in a task file, does the pruned table set contain every table its gold SQL references?
 * usage: npx tsx scripts/pruner-recall.ts data/dev.jsonl data/company.sqlite
 */
import { readFileSync } from 'node:fs';
import { openDb, introspectSchema } from '../src/data/db.js';
import { selectTables, buildValueIndex } from '../src/agent/context.js';
import type { Task } from '../src/tasks/types.js';

const [tasksPath = 'data/dev.jsonl', dbPath = 'data/company.sqlite'] = process.argv.slice(2);
const db = openDb(dbPath, { readOnly: true });
const schema = introspectSchema(db);
const names = schema.tables.map(t => t.name);
const values = buildValueIndex(db);
const tasks: Task[] = readFileSync(tasksPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Task);

let hit = 0; const misses: { id: string; missing: string[]; sent: string[] }[] = []; let sentTotal = 0;
for (const t of tasks) {
  const referenced = names.filter(n => new RegExp(`\\b${n}\\b`, 'i').test(t.goldSql));
  const sent = selectTables(t.question, schema, values);
  sentTotal += sent.length;
  const missing = referenced.filter(n => !sent.includes(n));
  if (missing.length === 0) hit++; else misses.push({ id: t.id, missing, sent });
}
console.log(`pruner recall: ${hit}/${tasks.length} = ${((100 * hit) / tasks.length).toFixed(1)}% of tasks received every table their gold SQL uses`);
console.log(`average tables sent: ${(sentTotal / tasks.length).toFixed(2)} of ${names.length}`);
for (const m of misses) console.log(`  miss ${m.id}: missing ${m.missing.join(',')} (sent ${m.sent.join(',')})`);
