# humain-less-compute

**HUMAIN Future AI Builders Hackathon (30–31 Oct 2026) — Challenge 2: Deliver AI with Less Compute.**

Goal: complete AI tasks at the same accuracy and latency floors as an "always use the big model" baseline, at a fraction of the compute — and prove it with measurements.

The system is a budget-aware controller that sits in front of the models and decides, per task:

- **Model choice** — route easy work to a small model, escalate hard work to a large one.
- **Context that earns its tokens** — only send the prompt/history the task actually needs.
- **Verification where it pays** — verify only where confidence is low or a mistake is expensive.

Everything is judged on **cost per successful task**, under explicit **accuracy and latency floors**, against a measured baseline, with an ablation per component and a held-out test set that lives outside this repository.

## Status

Day 0 — repository scaffold. No code yet. See [DECISIONS.md](DECISIONS.md) for the decision log.

## Models

All models are accessed through [OpenRouter](https://openrouter.ai). Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. The `.env` file is git-ignored and must never be committed.

## Licence

MIT — see [LICENSE](LICENSE). Third-party dependencies are restricted to permissive licences (MIT / Apache-2.0 / BSD); no GPL/AGPL or other copyleft code, models, or datasets.
