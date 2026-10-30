// Child process that executes read-only SQL for the controller. Plain CommonJS so it needs no loader.
// A synchronous SQLite call cannot be interrupted from JavaScript; the parent kills this whole process on timeout.
'use strict';
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(process.argv[2], { readOnly: true });
process.on('message', ({ id, sql, rowCap }) => {
  try {
    const stmt = db.prepare(sql);
    const rows = [];
    let truncated = false;
    for (const row of stmt.iterate()) {
      if (rows.length >= rowCap) { truncated = true; break; }
      rows.push(row);
    }
    const columns = rows[0] ? Object.keys(rows[0]) : stmt.columns().map(c => c.name);
    process.send({ id, result: { ok: true, rows, columns, truncated } });
  } catch (e) {
    process.send({ id, result: { ok: false, error: String((e && e.message) || e) } });
  }
});
process.send({ ready: true });
