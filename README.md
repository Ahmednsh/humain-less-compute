# humain-less-compute

**HUMAIN Future AI Builders Hackathon (30–31 Oct 2026) — Challenge 2: Deliver AI with Less Compute.**

Goal: complete AI tasks at the same accuracy and latency floors as an "always use the big model" baseline, at a fraction of the compute — and prove it with measurements.

The system is a budget-aware controller that sits in front of the models and decides, per task:

- **Model choice** — route easy work to a small model, escalate hard work to a large one.
- **Context that earns its tokens** — only send the prompt/history the task actually needs.
- **Verification where it pays** — verify only where confidence is low or a mistake is expensive.

Everything is judged on **cost per successful task**, under explicit **accuracy and latency floors**, against a measured baseline, with an ablation per component and a held-out test set that lives outside this repository.

## Status

Day 1 — harness, data, task templates, controller and CLI implemented with tests; waiting on the first real (paid) runs. See [DECISIONS.md](DECISIONS.md) for the decision log and `docs/superpowers/` for the spec and plan.

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
