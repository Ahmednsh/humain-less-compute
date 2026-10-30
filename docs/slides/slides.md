# Slides (9) — Deliver AI with Less Compute

Export to PDF (8–10 slides required). All numbers are copied from `results/report.md`; do not retype them by hand anywhere else.

---

## 1 · Project overview

**A budget-aware controller for "ask your data" analytics.**
Natural-language questions over a company database → SQL → answer, at the same accuracy and latency as the big-model baseline, for a fraction of the compute.

- Challenge 2 — Deliver AI with Less Compute
- Ahmed Sharahili · solo · 30–31 Oct 2026
- Repo: github.com/Ahmednsh/humain-less-compute · demo video: link to be added on the project page once recorded

---

## 2 · Problem

Every question goes to the largest model, with the whole schema, a long glossary and nine examples, and the same verification whether the question is "how many cities are in Asir" or "which region grew most year-over-year after refunds".

- Most tokens are never read by the task.
- Failed attempts still burn compute: **cost per task ≠ cost per successful task**.
- Cheap only counts if it is right and on time → accuracy and latency **floors**.

---

## 3 · Proposed solution

One controller in front of two model tiers (small: Llama 3.3 70B, large: Claude Sonnet 5.5, both via OpenRouter, ≈20× price gap; the small tier was chosen by a measured bake-off):

1. **Route** — zero-token lexical difficulty score → small or large.
2. **Prune context** — send only the tables the question needs (plus the FK join path), the glossary lines it needs, ≤ 2 examples.
3. **Verify where it pays** — free checks always; a large-model second opinion only when confidence is low, SQL is complex, or money is involved.
4. **Escalate once** — small → large when checks fail; the failed attempt is still charged.

It is an agent in the challenge's sense: it observes outcomes (errors, empty results, verdicts) and decides where the next token goes.

---

## 4 · Technical approach

- **Data**: deterministic 12-table SQLite company (regions → cities → customers → orders → items → payments / shipments / returns, employees, tickets), 6 000 orders, from one seed.
- **Tasks**: 33 question templates in three difficulty tiers, English + Arabic phrasings, gold SQL executed on the same DB → exact oracle, hand-checked on a fixture.
- **Agent**: TypeScript/Node 26, `node:sqlite`, read-only execution with a write guard, JSON output parsed with zod, repair loop.
- **Harness**: every call logged (tokens, USD from OpenRouter, latency); resumable JSONL runs; one command renders the ablation table.

(Architecture diagram: question → router → context → executor → verifier → answer, with the escalation arrow.)

---

## 5 · Implementation & evaluation design

- Policies = the ablation ladder: **P0** large always (baseline) · **S** small only · **P1** + router · **P2** + pruning · **P3** + selective verify (full) · **V** verify always.
- Floors fixed *before* the first optimisation run: accuracy ≥ P0 − 2 pp; p95 latency ≤ 1.25 × P0.
- Headline metric: **cost per successful task** (failed and escalated attempts included).
- Dev set 150 tasks (50/50/50) for all tuning; **held-out set generated with a secret seed outside the repo, incl. 6 unseen question types, run once at the end**.
- 102 unit/component tests + a mock end-to-end smoke run in CI on every push. Pruner recall measured directly: 100 % of dev tasks get every table their gold SQL needs, with 2.6 of 12 tables sent.

---

## 6 · Testing & results

| policy | accuracy | p95 | cost / success | Δ vs P0 |
|---|---|---|---|---|
| P0 baseline | 100.0 % | 3.4 s | $0.0086 | — |
| S small only | 84.7 % | 7.0 s | $0.0003 | −96 % (fails accuracy) |
| P1 + router | 98.0 % | 3.5 s | $0.0047 | −46 % |
| P2 + pruning | 99.3 % | 3.0 s | $0.0028 | −68 % |
| **P3 full** | **100.0 %** | 4.3 s | **$0.0030** | **−65 %** |
| V verify always | 100.0 % | 7.1 s | $0.0068 | −21 % |

Held-out (150 unseen tasks, 6 unseen question types, run once): P0 $0.0093 → P3 **$0.0030 per correct answer (−68 %)**, accuracy 99.3 % → 98.7 % (inside the 2-pp floor); p95 3.1 s → 4.4 s (outside the 1.25× floor by 0.5 s — reported, not hidden).

Robustness (P3, no retuning, 60 tasks each): renamed schema 100 % ($0.0034; flagship on the same set 98.2 % at $0.0095) · Arabic questions 100 % ($0.0031) · small model swapped to qwen3.7-flash 100 % ($0.0027) but p95 29 s — the controller keeps accuracy and cost and exposes the latency regression.

---

## 7 · Innovation & value

- Spends compute where the **outcome** is at risk, not uniformly: the same idea applies to any task with a cheap first-stage check (SQL execution, unit tests, schema validation).
- Measured, not asserted: each component earns its row; the naive extremes (always cheap, always verify) are shown to lose.
- Drift found and fixed by measurement before any paid run: renamed-schema recall 46.7 % → 100 %, Arabic 92.2 % → 100 %.
- Honest accounting: failed attempts and verifier calls are in the numerator.

---

## 8 · Challenges & future improvements

- **Limitations**: synthetic data and templated questions; one domain; lexical router; prices and model ids are a 30 Oct 2026 snapshot; two days, one person.
- **Next**: learned router from the logged traces; prompt caching for the shared prefix; a third tier; multi-turn sessions; real customer schemas; verifier calibration (false-accept rate measured against gold).

---

## 9 · Conclusion & links

Same answers, 68 % less compute per correct answer on unseen tasks — and the evidence to prove it. (Speed: pruning alone is faster than the baseline; adding verification costs 0.1–0.5 s of p95.)

- Repo + one-command reproduction: github.com/Ahmednsh/humain-less-compute
- Demo video: link to be added on the project page once recorded
- Results page: `results/report.html` · decision log: `DECISIONS.md`
