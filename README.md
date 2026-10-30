# humain-less-compute

**HUMAIN Future AI Builders Hackathon (30–31 Oct 2026) — Challenge 2: Deliver AI with Less Compute.**

Goal: complete AI tasks at the same accuracy and latency floors as an "always use the big model" baseline, at a fraction of the compute — and prove it with measurements.

The system is a budget-aware controller that sits in front of the models and decides, per task:

- **Model choice** — route easy work to a small model, escalate hard work to a large one.
- **Context that earns its tokens** — only send the prompt/history the task actually needs.
- **Verification where it pays** — verify only where confidence is low or a mistake is expensive.

Everything is judged on **cost per successful task**, under explicit **accuracy and latency floors**, against a measured baseline, with an ablation per component and a held-out test set that lives outside this repository.

## Results so far (dev set, 150 tasks; interim — final numbers land in `results/report.md`)

Baseline P0 = `claude-sonnet-5.5` on every question with the full 12-table schema. Small tier = `meta-llama/llama-3.3-70b-instruct`, chosen by a measured bake-off of six cheap models ([DECISIONS.md](DECISIONS.md) D-017). Floors fixed before any optimisation: accuracy ≥ P0 − 2 pp, p95 latency ≤ 1.25 × P0.

| policy | accuracy | p95 | prompt tokens / task | cost / successful task | Δ vs P0 | floors |
|---|---:|---:|---:|---:|---:|---|
| P0 large always | 100.0 % | 3.4 s | 3 461 | $0.0086 | — | reference |
| S small only | 84.7 % | 7.0 s | 2 042 | $0.0003 | −96 % | ❌ acc ❌ p95 |
| P1 + router (θ = 4) | 98.0 % | 3.5 s | 2 644 | $0.0047 | −46 % | ✅ ✅ |
| P2 + context pruning (iteration 1) | 96.7 % | 6.6 s | 876 | $0.0026 | −70 % | ❌ ❌ |
| P3 + selective verification (iteration 1) | 96.7 % | 8.3 s | 1 390 | $0.0052 | −40 % | ❌ ❌ |
| P3 full system (iteration 2, 117 of 150 run so far) | 100.0 % | — | — | ≈ $0.0030 | ≈ −65 % | pending |

What the ladder taught (all from the logs, see D-016 to D-019): both Claude tiers saturate this task set, so the small tier had to be a genuinely small model; the router alone already halves cost inside both floors; pruning cuts prompt tokens by 75 % but exposed one systematic small-model mistake (quarter filters) that one glossary line and one example fixed; and the first verifier design spent 85 % of its budget checking the large model's own answers — verification now applies only to small-tier answers. The θ sweep, the bake-off and the iteration-1 runs stay in `results/EXPERIMENTS.md`.

Pending (budget-bound): finish P3 iteration 2 and P2 iteration 2, the verify-always contrast (V), robustness R1 (renamed schema) / R2 (Arabic questions) / R3 (swapped small model), and the single held-out run (P0 and P3) on a set generated with a secret seed outside this repository that includes six never-seen question types.

## Status

Day 2 — harness, data, templates, controller, CLI and 102 tests complete; baseline, router sweep and iteration-1 ladder measured; iteration 2 in progress. See [DECISIONS.md](DECISIONS.md) for the decision log and `docs/superpowers/` for the spec and plan.

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
