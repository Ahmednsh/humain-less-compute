# humain-less-compute

**HUMAIN Future AI Builders Hackathon (30–31 Oct 2026) — Challenge 2: Deliver AI with Less Compute.**

Goal: complete AI tasks at the same accuracy and latency floors as an "always use the big model" baseline, at a fraction of the compute — and prove it with measurements.

The system is a budget-aware controller that sits in front of the models and decides, per task:

- **Model choice** — route easy work to a small model, escalate hard work to a large one.
- **Context that earns its tokens** — only send the prompt/history the task actually needs.
- **Verification where it pays** — verify only where confidence is low or a mistake is expensive.

Everything is judged on **cost per successful task**, under explicit **accuracy and latency floors**, against a measured baseline, with an ablation per component and a held-out test set that lives outside this repository.

## Results

Full tables with every column: [results/report.md](results/report.md) · [results/report.html](results/report.html) · per-run rows in [results/EXPERIMENTS.md](results/EXPERIMENTS.md) · per-task logs in `results/runs/`. Rebuild from the logs with `npx tsx scripts/build-report.ts`; reproduce from scratch with `bash scripts/run-ladder.sh`.

Baseline P0 = `claude-sonnet-5.5` on every question with the full 12-table schema, glossary and examples. Small tier = `meta-llama/llama-3.3-70b-instruct`, chosen by a measured bake-off of six cheap models ([DECISIONS.md](DECISIONS.md) D-017). Floors were fixed before the first optimisation run: accuracy ≥ P0 − 2 pp, p95 latency ≤ 1.25 × P0.

**Held-out set — 150 unseen tasks, six never-seen question types, secret seed, generated outside this repository, run once after all thresholds were frozen:**

| policy | accuracy | p95 | prompt tokens / task | cost / successful task | Δ vs P0 |
|---|---:|---:|---:|---:|---:|
| P0 large always | 99.3 % | 3.1 s | 3 717 | $0.0093 | — |
| **P3 full system** | **98.7 %** | 4.4 s | 1 023 | **$0.0030** | **−68 %** |

**Ablation ladder — dev set, 150 tasks (50 per difficulty tier):**

| policy | accuracy | p95 | prompt tokens / task | cost / successful task | Δ vs P0 | floors acc / p95 |
|---|---:|---:|---:|---:|---:|---|
| P0 large always | 100.0 % | 3.4 s | 3 461 | $0.0086 | — | reference |
| S small only | 84.7 % | 7.0 s | 2 042 | $0.0003 | −96 % | ❌ / ❌ |
| P1 + router (θ = 4) | 98.0 % | 3.5 s | 2 644 | $0.0047 | −46 % | ✅ / ✅ |
| P2 + context pruning | 99.3 % | 3.0 s | 953 | $0.0028 | −68 % | ✅ / ✅ |
| P3 + selective verification (full system) | 100.0 % | 4.3 s | 1 041 | $0.0030 | −65 % | ✅ / ❌ (by 0.1 s) |
| V verify always | 100.0 % | 7.1 s | 1 903 | $0.0068 | −21 % | ✅ / ❌ |

**Robustness — P3 under changed conditions, no retuning (60 tasks each):** renamed schema 100 % at $0.0034 · Arabic questions 100 % at $0.0031 · small model swapped to `qwen/qwen3.7-flash` 100 % at $0.0027 but p95 29 s (the swap is safe for accuracy and cost, not latency — and the controller shows it).

**What the ladder says.** Routing alone halves cost inside both floors. Pruning is the largest single saving and makes the system *faster* than the baseline. Selective verification buys the last 0.7 pp on dev for +$0.0003 per task and costs about 1.3 s of p95 (0.3 s of p50), because a verification is a second, sequential large-model call; verify-always buys nothing more at 2.3 × the cost. The one floor the full system misses is p95 (1.25 × a single flagship call), by 0.1 s on dev and 0.5 s on held-out; P2 is the Pareto choice when p95 is binding, P3 when accuracy is. Neither floor was moved after the fact.

**How the numbers were earned (D-016 to D-021).** Both Claude tiers scored 100 % on the dev set, so the "small" tier had to be a genuinely small model, picked by a 45-task bake-off. The router threshold came from a sweep (θ = 3…6). The first full run of pruning and verification scored 96.7 %; the logs showed one systematic small-model mistake under pruned context (quarter filters) and a verifier that spent 85 % of its budget checking the large model's own answers. One glossary line, one example and one rule change later, iteration 2 reached 99.3 % and 100 %. Iteration-1 rows stay in the experiment log. Total OpenRouter spend for everything: about USD 8.

## Status

Submission state — code, 102 tests, CI, decision log (21 entries), results, slides (`docs/slides/`) and platform texts (`docs/submission.md`) complete. See `docs/superpowers/` for the spec and plan.

## Quick start

```bash
npm install
npm test                                   # unit + component tests (no API key needed)
npm run gen:db                             # deterministic 12-table company database → data/company.sqlite
npm run gen:tasks                          # 150 dev tasks with exact gold answers → data/dev.jsonl
npx tsx scripts/pruner-recall.ts           # does the context pruner send every table the gold SQL needs?
npm run cli -- eval --policy P0 --tasks data/dev.jsonl --db data/company.sqlite      # baseline (needs .env)
npm run cli -- eval --policy P3 --tasks data/dev.jsonl --db data/company.sqlite      # full system
npm run cli -- report --runs results/runs/<a>.jsonl,results/runs/<b>.jsonl --baseline P0 --html results/report.html
```

Policies: `P0` large model always (baseline) · `S` small only · `P1` + router · `P2` + context pruning · `P3` + selective verification (full system) · `V` verify always. Every real run appends a row to `results/EXPERIMENTS.md` and leaves its per-task JSONL log in `results/runs/`.

`--mock` runs the whole pipeline with a scripted model (used by CI); `--holdout` task generation refuses any output path inside the repository.

## Models

All models are accessed through [OpenRouter](https://openrouter.ai). Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. The `.env` file is git-ignored and must never be committed.

## Licence

MIT — see [LICENSE](LICENSE). Third-party dependencies are restricted to permissive licences (MIT / Apache-2.0 / BSD); no GPL/AGPL or other copyleft code, models, or datasets.
