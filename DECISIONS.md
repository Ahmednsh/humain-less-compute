# Decision log

Format per entry: **Decision** — what was chosen. **Why** — the reasons. **Rejected** — the alternatives and why not. Entries are append-only; a reversed decision gets a new entry that references the old one.

---

## D-001 · 2026-10-30 · Challenge: #2 "Deliver AI with Less Compute"

**Decision.** Compete in Challenge 2 only (one project, one challenge per the hackathon rules).

**Why.**
- The most measurable of the three: the platform's own examples (model choice per task, context that earns its tokens, verification where it pays, cost per successful task, accuracy/latency floors) are each a directly reportable metric, which maps onto judging criteria 1–3 (held-out task performance, robustness, evaluation & iteration).
- Matches prior hands-on experience: measuring hidden reasoning tokens, multi-provider routing with failover, and an independent verifier in an agent loop.
- Needs no simulated infrastructure, leaving time for ablations, a held-out evaluation, the video and the slides within a 2-day solo build.
- A natural ablation ladder (baseline → +router → +context pruning → +selective verification) is exactly the evidence criterion 3 asks for.

**Rejected.**
- *Challenge 1 (Agentic Recovery of a Failing System)* — visually stronger demo and closest to the agentic-platform judges, but requires building a fault-injected simulated system on top of the agent and the eval harness; too much scope for two days alone.
- *Challenge 3 (Autonomous Enterprise)* — most open-ended and hardest to produce credible held-out performance evidence for.

**Risk noted.** May read as "less agentic" to some judges. Mitigation: the controller is built as an agent that manages its own compute budget and adapts its routing/verification decisions to what it observes, not a static rule table.

## D-002 · 2026-10-30 · Model access: OpenRouter

**Decision.** All model calls go through OpenRouter with a single `OPENROUTER_API_KEY` in `.env` (git-ignored).

**Why.** One key, one API shape, many providers; lets the "small" and "large" model tiers be swapped without code changes and gives per-call token and cost accounting. The hackathon provides no API credits or models, so the participant's own key is the only option.

**Rejected.** Direct per-provider keys — more setup, no cost benefit for a 2-day build. Local models — no GPU budget confirmed; would also make the cost comparison less legible to judges.

## D-003 · 2026-10-30 · Repository visibility: public, MIT licence

**Decision.** Public repository `Ahmednsh/humain-less-compute` under the MIT licence.

**Why.** The participant chose public. The hackathon organizer confirmed in the platform lobby (30 Oct 2026) that a public GitHub repository is acceptable, and the source must be submitted via a GitHub link.

**Noted.** Clause 2.2 of the hackathon Confidentiality & IP Acknowledgement asks for 15 business days' written notice before publishing hackathon materials in a public repository. The organizer's lobby ruling was taken as that permission. Nothing derived from HUMAIN non-public material will be committed; this repository contains only the participant's own work and permissively licensed third-party components.

**Rejected.** Private repository shared with judges — the safer legal default, declined by the participant.

## D-004 · 2026-10-30 · Dependency licence policy

**Decision.** Only MIT / Apache-2.0 / BSD (or equivalent permissive) third-party code, models and datasets. No GPL, AGPL or other copyleft. No scraped datasets. A licence audit is recorded in this log before submission.

**Why.** Required by clause 6.1 of the hackathon Confidentiality & IP Acknowledgement.

## D-005 · 2026-10-30 · Evaluation discipline

**Decision.**
- A measured baseline (large model always, full context, no selective verification) is recorded before any optimisation.
- Every experiment is one row in a tracked log with accuracy, latency (p50/p95), tokens, cost per task and cost per successful task.
- The final held-out test set lives **outside this repository**, is never read during development and is never tuned against. Thresholds are set on a development split only.

**Why.** Judges do not run code; they evaluate the submitted evidence. Criterion 1 is explicitly about unseen/held-out cases and criterion 3 about reproducible, component-validated improvements.

## D-006 · 2026-10-30 · Decisions taken autonomously under `/goal`

**Decision.** The participant set `/goal` ("execute Challenge 2 professionally, precisely, without errors, using superpowers") and is not available to answer design questions. Design decisions D-007 onward were taken by the assistant, each with the alternatives recorded, and are open to override. Where the participant left a question unanswered, the assumption is stated.

**Assumptions.** Budget ≤ USD 15 total on OpenRouter. Slides in English (video narration language left to the participant). No GPU or local models.

## D-007 · 2026-10-30 · Task domain: NL → SQL analytics agent over a synthetic company database

**Decision.** The system answers natural-language analytics questions over a 12-table synthetic SQLite database by generating and executing SQL.

**Why.** Exact, free correctness oracle (gold SQL run on the same DB); fully deterministic synthetic data from a seed; a wide, controllable difficulty spread so routing has something to route; a schema large enough that context pruning is a real saving; SQL execution doubles as a free first-stage verifier; a product every judge understands.

**Rejected.** Structured extraction from synthetic business documents — needs an LLM to render records into prose, which risks label noise and adds cost, and context pruning would be artificial. Code tasks with unit tests — authoring diverse problems plus sandboxing generated code is too much for two days, and public benchmarks raise contamination and licence questions.

## D-008 · 2026-10-30 · Model tiers: `anthropic/claude-haiku-5.5` (small) and `anthropic/claude-sonnet-5.5` (large)

**Decision.** Two tiers from the same vendor family, prices from OpenRouter's public model list on 2026-10-30: small 0.10/0.50 USD per M tokens, large 2.00/10.00 (≈20× ratio). Robustness experiment R3 swaps the small tier for `qwen/qwen3.7-flash`.

**Why.** Same family keeps the comparison about size, not ecosystem or tokenizer; both ids are current and cheap enough that a full dev run costs about USD 1–2.

**Rejected.** `openai/gpt-5.4` + `gpt-5.4-nano` — comparable, kept as fallback in config. Gemini 3.x pro/flash-lite — preview status. A third "medium" tier — adds cascade complexity without changing the story.

## D-009 · 2026-10-30 · Stack: TypeScript on Node 26 with built-in `node:sqlite`

**Decision.** TypeScript (strict), Node 26, `node:sqlite`, `zod`, `vitest`, `tsx`; plain `fetch` for OpenRouter, no SDK.

**Why.** The participant's primary stack; `node:sqlite` removes the only native dependency; a hand-written client exposes OpenRouter's `usage.cost` and generation ids directly. All dependencies are MIT/Apache-2.0.

**Rejected.** Python — faster for statistics, but not the participant's primary stack and the statistics needed are trivial. `better-sqlite3` — native build, unnecessary on Node 26. OpenAI SDK — hides usage fields and adds a dependency.

## D-010 · 2026-10-30 · Metrics and floors, fixed before any optimisation run

**Decision.** Headline metric: cost per successful task (total USD ÷ correct answers; failed and escalated attempts included). Floors relative to the P0 baseline on the same task set: accuracy ≥ baseline − 2.0 pp; p95 latency ≤ 1.25 × baseline p95. Secondary: cost per task, tokens per task, accuracy per difficulty tier, escalation, verification and repair rates.

**Why.** These are the challenge's own words ("cost per successful task", "accuracy and latency floors"); fixing them before the first optimisation run prevents moving the goalposts.

## D-011 · 2026-10-30 · Held-out protocol

**Decision.** Held-out set generated once with a seed not shown to the assistant, into a directory outside the repository, including six `holdoutOnly` templates never used in dev generation. Nobody opens the file; the harness reads it; one final run per reported policy after thresholds are frozen; only aggregates are reported.

**Why.** The participant's rule ("the held-out set lives outside this repo, never read, never tuned against") and judging criterion 1 (unseen cases).

## D-012 · 2026-10-30 · Ablation ladder and robustness experiments

**Decision.** Policies P0 baseline (large, full context, no verify), S small-only, P1 +router, P2 +prune, P3 +selective verify (full system), V verify-always. Robustness: R1 schema rename, R2 Arabic questions, R3 small-model swap, each P0 vs P3 with frozen thresholds.

**Why.** One row per component is the evidence criterion 3 asks for; S and V exist to show that the naive extremes (always cheap, always verify) lose. The robustness set targets criterion 2 with changes a real deployment sees: schema drift, language shift, model churn.

## D-013 · 2026-10-30 · Context pruner links known dimension values; recall measured before any paid run

**Decision.** Besides table/column names and synonyms, the pruner matches region, city and category names read from the database (a value can map to several tables, e.g. "Riyadh" is a region and a city). Measured with `scripts/pruner-recall.ts` on the 150-task dev set: 100 % of tasks receive every table their gold SQL uses, with 2.6 of 12 tables sent on average (was 97.3 % before value linking).

**Why.** Questions phrased as "customers in Eastern Province" never say "region"; schema linking by value is the standard, cheap fix, and the recall script is a zero-cost component validation (judging criterion 3). Tuned on the dev set only.

**Rejected.** Embedding-based retrieval — adds a model call per task and a dependency for a problem that lexical matching already solves here.

## D-014 · 2026-10-30 · Held-out set generated (protocol step 1 executed)

**Decision.** `gen-tasks --holdout` was run once with a seed produced by `crypto.randomInt` and written only to `C:\D\My Claude Projects\humain-holdout\seed.txt` (never printed); output `holdout.jsonl` (150 tasks, 50/50/50, includes the six holdout-only templates) lives in that directory outside the repository. The CLI refuses `--holdout` for any path inside the repository (tested). Nothing from the file has been or will be read; one run each of P0 and P3 will be made after thresholds are frozen.

**Why.** D-011 and judging criterion 1.

## D-015 · 2026-10-30 · Pruner made drift-tolerant after the robustness sets exposed it (before any paid run)

**Finding.** Measuring pruner recall on the robustness task sets (zero LLM cost) showed the context pruner was bound to the original table names: on the renamed schema (R1) only 46.7 % of tasks received every table their gold SQL needs; on the Arabic set (R2) 92.2 % (diacritics such as tanween broke token matching).

**Decision.** (1) A renamed table inherits the synonyms of the concept it matches, decided by name-token overlap and a column-signature table (`quantity` → order lines, `channel`/`status` → orders, …). (2) Arabic diacritics and tatweel are stripped before matching. Recall after the change: dev 100 %, R1 100 %, R2 100 %, R3 100 %, with ~2.5 of 12 tables sent on average.

**Why.** Criterion 2 (robustness to changed inputs) and criterion 3 (component validation). The fix was motivated by measurement, not by the paid runs, and was made before thresholds were frozen; the held-out set was not involved.

**Rejected.** Re-generating R1 with a "friendlier" rename map — would have hidden a real weakness.
