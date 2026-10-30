#!/usr/bin/env bash
# Reproduce the whole evaluation ladder on the dev set, then the robustness sets.
# Needs OPENROUTER_API_KEY in .env. Every run appends to results/EXPERIMENTS.md and is resumable.
# usage: bash scripts/run-ladder.sh [theta]
set -euo pipefail
cd "$(dirname "$0")/.."
THETA="${1:-4}"
DB=data/company.sqlite
[ -f "$DB" ] || npm run -s gen:db
[ -f data/dev.jsonl ] || npm run -s gen:tasks
[ -f data/company_renamed.sqlite ] || npx tsx src/cli.ts gen-db --seed 42 --rename --out data/company_renamed.sqlite
[ -f data/r1_renamed.jsonl ] || npx tsx src/cli.ts gen-tasks --db data/company_renamed.sqlite --seed 2001 --n 90 --rename --out data/r1_renamed.jsonl
[ -f data/r2_arabic.jsonl ] || npx tsx src/cli.ts gen-tasks --db "$DB" --seed 2002 --n 90 --lang ar --out data/r2_arabic.jsonl
[ -f data/r3_modelswap.jsonl ] || npx tsx src/cli.ts gen-tasks --db "$DB" --seed 2003 --n 90 --out data/r3_modelswap.jsonl

run() { # policy taskset db extra...   (log path = defaultRunPath: results/runs/<taskset>-<policy>[-thetaN][-small-...].jsonl)
  local policy="$1" tasks="$2" db="$3"; shift 3
  if [ "$THETA" != "4" ]; then set -- --theta "$THETA" "$@"; fi
  npx tsx src/cli.ts eval --policy "$policy" --tasks "$tasks" --db "$db" "$@"
}

echo "== dev ladder (theta=$THETA)"
for p in P0 S P1 P2 P3 V; do run "$p" data/dev.jsonl "$DB"; done

echo "== R1 schema rename"
run P0 data/r1_renamed.jsonl data/company_renamed.sqlite
run P3 data/r1_renamed.jsonl data/company_renamed.sqlite
echo "== R2 arabic"
run P0 data/r2_arabic.jsonl "$DB"
run P3 data/r2_arabic.jsonl "$DB"
echo "== R3 small-model swap (P3 with default small, then qwen)"
run P3 data/r3_modelswap.jsonl "$DB"
run P3 data/r3_modelswap.jsonl "$DB" --small qwen/qwen3.7-flash

echo "== report (results/report.md + results/report.html)"
npx tsx scripts/build-report.ts
