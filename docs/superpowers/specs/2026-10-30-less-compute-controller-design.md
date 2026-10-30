# Design: a budget-aware controller for "ask-your-data" analytics tasks

**Challenge:** HUMAIN Future AI Builders Hackathon 2026, Challenge 2 — *Deliver AI with Less Compute*.
**Author:** Ahmed Sharahili (solo). **Date:** 2026-10-30. **Status:** approved for planning under the `/goal` autonomy directive; every decision below is also logged in `DECISIONS.md` and can be overridden by the participant.

## 1. Intent

Build a system that answers natural-language questions over a company database by generating and executing SQL, and that spends **as little compute as possible per correct answer** without dropping below an accuracy floor or a latency floor. Prove it with a measured baseline, an ablation per component, robustness experiments, and a final run on a held-out set that lives outside the repository.

**Who it is for.** Judges who evaluate submitted evidence only (they do not run code): HUMAIN AI/agentic-platform engineers, a quality-engineering director, and business/investment people. The artifact must therefore be (a) a reproducible harness with inspectable code and (b) one clear results table a non-engineer can read.

**Success looks like.**
- A results table where the full system reaches the same accuracy as the "large model always" baseline (within the floor) at a large reduction in **cost per successful task**, with p95 latency inside the floor.
- Each row of the ablation ladder (baseline → +router → +context pruning → +selective verification) is reproducible by one command.
- Robustness experiments show the controller adapts when the schema, the language, or the small model changes.
- A held-out run, never looked at or tuned against, confirms the dev-set numbers.

**What the participant stated.** Challenge 2 is confirmed; model access is OpenRouter; the repo is public under MIT; superpowers process (brainstorm → spec → plan → TDD → verification → review) applies; measure first, log every experiment; held-out set outside the repo; decisions logged with chosen/why/rejected.

**Assumptions made in his absence (flagged for override).**
- Budget: total OpenRouter spend for the whole project ≤ USD 15. The chosen tiers make a full dev-set run cost roughly USD 1–2, so this is comfortable.
- Presentation and slides in English, with the video narration left to the participant (Arabic or English). Judges include non-Arabic-speaking roles; English is the safer default.
- No GPU, no local models. Everything runs on a Windows 11 laptop with Node 26 and Python 3.12.

## 2. Task domain — options considered

The task domain had to satisfy: an **automatic correctness oracle** (no LLM judge needed for the headline metric), **synthetic data that is cheap to generate with known ground truth**, a **real spread of difficulty** so routing has something to route, and **business relevance** the judges recognise.

| Option | Oracle | Data cost | Difficulty spread | Fit to the five challenge axes | Verdict |
|---|---|---|---|---|---|
| **A. Analytics assistant over a synthetic company DB (NL → SQL agent)** | Exact: gold SQL executed on the same DB | Fully programmatic; questions from templates, paraphrased | Wide: single-table lookups → multi-join, window, NULL semantics | Routing (easy vs hard questions), context (send only the relevant tables of a 12-table schema), verification (execute, then LLM-verify only risky queries), cost per success (repair loops burn tokens), floors | **Chosen** |
| B. Structured extraction from synthetic business documents (tickets/invoices) | Field match against generated record | Needs an LLM to render records into prose → label-noise risk, extra cost | Medium | Good, but context pruning is artificial (documents are short) | Rejected |
| C. Code tasks with unit tests as oracle | Strong | Authoring diverse problems + sandboxing untrusted generated code in 2 days | Wide | Good, but public benchmarks carry contamination and licence questions | Rejected |

Why A wins: the oracle is exact and free, the whole dataset is deterministic from a seed, the 12-table schema makes "context that earns its tokens" a real saving rather than a slogan, SQL execution is a free first-stage verifier, and "ask your data in plain language" is a product every judge understands.

## 3. Architecture

```
                 ┌──────────────── controller (per task) ────────────────┐
question ──►  router ──► context builder ──► executor ──► verifier ──► answer
              (tier)     (tables, shots)    (LLM→SQL,     (free checks,
                 │                           run, repair)   selective LLM)
                 └──── escalation path: small → large when risk is high ─┘

eval harness: tasks.jsonl ──► controller(policy) ──► run log (jsonl) ──► report (table, html)
```

All components are pure functions of (task, policy, config) plus the LLM client; each is unit-testable with a mocked client.

### 3.1 Data layer (`src/data/`)
- **Schema:** 12 SQLite tables for a KSA wholesale/retail company: `regions, cities, customers, categories, products, employees, orders, order_items, payments, shipments, returns, support_tickets`. Full DDL is about 1.5–2k tokens, which is what pruning saves.
- **Generator:** deterministic from a 32-bit seed (own `mulberry32` PRNG; no dependency). Sizes: 8 regions, 25 cities, 400 customers, 120 products, 40 employees, 6 000 orders (2024-01-01 → 2026-09-30), ~15 000 order items, payments, shipments, ~5 % returns, 800 tickets. Written to `data/company.sqlite` (git-ignored; regenerated by `npm run gen:db`).
- **Access:** `node:sqlite` (built into Node 26, no native dependency). Agent queries run on a **read-only** connection with a statement timeout and a row cap.

### 3.2 Task layer (`src/tasks/`)
- **Templates:** ~30 question templates, each with a parameter sampler, 2–4 English phrasings, 1–2 Arabic phrasings (robustness only), gold SQL, expected answer type (`number | string | list | ordered_list`), and a difficulty tier used **only for analysis and never shown to the agent**:
  - *Tier 1 (easy):* single table, filter/count/lookup.
  - *Tier 2 (medium):* 1–2 joins, aggregation, date range, group-by with a superlative.
  - *Tier 3 (hard):* 3+ joins, subqueries or window functions, business definitions (net revenue after refunds, return rate, YoY growth, resolution time), NULL and tie handling.
- **Generation:** `npm run gen:tasks -- --seed 1001 --n 150 --out data/dev.jsonl` produces the dev set (50/50/50 by tier). The gold answer is computed by executing the gold SQL, so the oracle is exact by construction.
- **Held-out:** `npm run gen:holdout -- --seed <secret> --out <path outside repo>` uses a different seed and additionally enables 6 templates flagged `holdoutOnly` that are excluded from every dev generation. The held-out file is never opened, printed, or inspected; only aggregate metrics from one final run are reported. See §7.
- **Gold SQL validation:** every template's gold SQL is unit-tested against a tiny hand-computed fixture database (component validation for criterion 3).

### 3.3 LLM client (`src/llm/openrouter.ts`)
- Plain `fetch` to `https://openrouter.ai/api/v1/chat/completions`; no SDK.
- Returns `{text, promptTokens, completionTokens, costUsd, latencyMs, model, generationId}`. Cost comes from OpenRouter's `usage.cost` (requested with `usage: {include: true}`); a price table captured from the public models endpoint on 2026-10-30 is the fallback and is also used to show per-model unit prices in the report.
- Temperature 0, JSON output requested in the prompt and parsed with `zod`; 60 s timeout; 3 attempts with exponential backoff on 429/5xx; concurrency 4 via a tiny semaphore.
- A mock client with scripted responses is used by tests and by the CI smoke eval, so the harness runs end-to-end with no key.

### 3.4 Model tiers (`src/config.ts`)
Two tiers, same vendor family so the comparison is about *size*, not ecosystem:

| Tier | Model (OpenRouter id) | Input $/M | Output $/M |
|---|---|---|---|
| small | `anthropic/claude-haiku-5.5` | 0.10 | 0.50 |
| large | `anthropic/claude-sonnet-5.5` | 2.00 | 10.00 |

Price ratio ≈ 20×. Both are configurable; the robustness experiment R3 swaps the small tier for `qwen/qwen3.7-flash` (0.03 / 0.13) without retuning. Alternatives considered: `openai/gpt-5.4` + `gpt-5.4-nano` (similar ratio, different tokenizer makes token comparisons noisier); `google/gemini-3.1-pro-preview` + `gemini-3.5-flash-lite` (preview status). If a chosen id is unavailable at run time the client fails loudly; the fallback ids are listed in config.

### 3.5 Controller (`src/agent/`)
Policy flags: `{ tier: 'small'|'large'|'auto', prune: boolean, verify: 'none'|'always'|'selective', maxRepairs: number }`.

1. **Router** (`router.ts`). Computes a difficulty score from cheap lexical features of the question only: token count, presence of aggregation/superlative/ratio/growth/period words, number of schema entities mentioned (via the same synonym map the pruner uses), and comparative structures ("both", "per", "more than the average"). `score ≥ θ_hi` → go straight to the large model; otherwise start small. Thresholds live in config and are tuned on the dev set only. The router costs zero tokens.
2. **Context builder** (`context.ts`). *Full* mode sends the complete DDL, a business glossary, and eight few-shot examples. *Pruned* mode selects tables by lexical overlap between the question and table/column names plus a synonym map (revenue → order_items, refund → returns, …), then adds any table needed to connect the selected tables through foreign keys (shortest join path), and includes at most two few-shot examples chosen by overlap. Invariant (unit-tested): the selected set is always FK-connected and always contains every table referenced by the gold SQL for ≥ 97 % of dev tasks (measured, reported; misses are logged as a known limitation).
3. **Executor** (`executor.ts`). Prompts the chosen tier for `{sql, answer_shape, confidence}` as JSON, runs the SQL read-only, and on an SQL error feeds the error back for a repair turn (`maxRepairs`: 1 for small, 2 for large). Rows are normalised to an answer by a deterministic function (single cell → scalar, single column → list, otherwise the first row joined). Every LLM call, its tokens, cost and latency are recorded on the task trace.
4. **Verifier** (`verifier.ts`). Free checks always: SQL ran, result non-empty, result shape matches the declared `answer_shape`, numeric magnitude sanity (no negative counts). *Selective* LLM verification is triggered only when risk is high: self-reported confidence `< τ`, SQL complexity (joins + subqueries + window functions) `≥ c`, or the question is flagged as a money aggregate by the router's features. The verifier is the large tier; it returns `{verdict, corrected_sql?}`; a corrected query is executed once. In *always* mode every task is verified (used to show that blanket verification is not worth its cost).
5. **Escalation.** A task escalates from small to large when: free checks fail after repairs, or the selective verifier rejects the small model's SQL. The large attempt reuses the pruned context. Every escalation is counted and costed.

The controller is an agent in the sense the challenge means: it observes outcomes (errors, empty results, verifier verdicts) and decides, per task, where to spend the next token. It is not a static table of rules.

### 3.6 Evaluation harness (`src/eval/`)
- `run.ts` — runs a named policy over a task file with the real or mock client, writes one JSONL row per task to `results/runs/<timestamp>-<policy>-<taskset>.jsonl` with: task id, tier label, correct, answer, gold, calls[], tokens in/out, cost, latency, route taken, tables sent, verified?, escalated?, repairs.
- `score.ts` — exact match with normalisation: numbers within 0.5 % relative or 0.01 absolute; strings case/whitespace-insensitive; lists order-insensitive unless the template is `ordered_list`.
- `report.ts` — aggregates a run or several runs into the headline table (accuracy, p50/p95 latency, input/output tokens per task, cost per task, **cost per successful task**, % routed small, % escalated, % verified) as Markdown and a static HTML page; appends a row to `results/EXPERIMENTS.md`.

### 3.7 Policies (the ablation ladder)

| Id | Name | tier | prune | verify | Purpose |
|---|---|---|---|---|---|
| P0 | baseline | large | no | none | The "big model always" reference. All floors are defined relative to this row. |
| S | small-only | small | no | none | Shows naive cheapness fails the accuracy floor. |
| P1 | +router | auto | no | none | Model choice per task. |
| P2 | +prune | auto | yes | none | Context that earns its tokens. |
| P3 | +verify (full system) | auto | yes | selective | Verification where it pays. |
| V | verify-always | auto | yes | always | Shows blanket verification is not worth it. |

### 3.8 Floors and metrics (fixed before the first optimisation run)
- **Accuracy floor:** full-system accuracy ≥ baseline accuracy − 2.0 percentage points, on the same task set.
- **Latency floor:** full-system p95 latency ≤ 1.25 × baseline p95 (a cascade can double latency on escalated tasks; p50 alone would hide this).
- **Headline metric:** cost per successful task = total USD spent on the run ÷ number of correct answers. Failed and escalated attempts are included in the numerator.
- Secondary: cost per task, tokens per task, accuracy per tier, escalation rate, verification rate, repair rate.

### 3.9 Robustness experiments (criterion 2)
Each is run for P0 and P3 on a freshly generated dev-like set (new seed), with no threshold changes:
- **R1 schema drift:** a rename map (`customers → clients`, `unit_price → price_per_unit`, …) applied to the DDL and gold SQL; the agent sees only the new names.
- **R2 language shift:** the Arabic phrasings of the same templates.
- **R3 model swap:** the small tier replaced by `qwen/qwen3.7-flash`.
Reported: accuracy, cost per successful task, escalation rate, and whether the floors still hold. A rise in the escalation rate with accuracy preserved is the expected adaptive behaviour.

### 3.10 Error handling
- LLM: timeouts and 429/5xx retried with backoff; after three failures the task is marked `error` (counted as a failure, its cost included).
- SQL: syntax or runtime errors go to the repair loop; a statement timeout or a row-cap hit counts as an error; any write statement is rejected before execution (read-only connection plus a keyword guard).
- JSON: malformed model output triggers one re-ask with the parse error; a second failure counts as a repair.
- Harness: a run is resumable (rows already present for a task id are skipped) so a crash never silently loses paid calls.

### 3.11 Testing strategy (TDD throughout)
- Unit: PRNG determinism; generator row counts and FK integrity; every gold SQL against a hand-computed fixture DB; scorer normalisation; router features and threshold behaviour; pruner FK-connectivity invariant; executor repair loop and write-guard with a mock client; verifier trigger rules; cost arithmetic and percentile math.
- Integration: a 10-task smoke eval with the mock client, run in GitHub Actions on every push (no key required) — the regression check for criterion 3.
- Measurement: the real runs themselves, each committed as a JSONL log plus an `EXPERIMENTS.md` row.

## 4. Repository layout

```
src/
  config.ts            tiers, prices, thresholds, floors
  llm/{openrouter,mock,types}.ts
  data/{schema.sql,generate.ts,db.ts,rng.ts}
  tasks/{templates/*.ts,generate.ts,types.ts}
  agent/{router,context,executor,verifier,controller}.ts
  eval/{run,score,report,metrics}.ts
  cli.ts
tests/                 vitest
data/                  generated (git-ignored except .gitkeep)
results/runs/*.jsonl   committed experiment logs
results/EXPERIMENTS.md one row per run
docs/superpowers/{specs,plans}/
docs/slides/           slide content + demo script
```

Stack: TypeScript (strict) on Node 26, `node:sqlite`, `zod`, `vitest`, `tsx`. All MIT/Apache-2.0 licensed. No GPL/AGPL anywhere.

## 5. Timeline (deadline Saturday 31 Oct 2026, 20:00)

- **Fri evening:** spec, plan, data generator, task templates, LLM client, harness, **baseline run on dev**.
- **Sat 12:00–16:00:** router, pruning, selective verification; ablation runs; robustness runs.
- **Sat 16:00–18:00:** held-out generation and single final run; report; README results section.
- **Sat 18:00–19:30:** slides (9), demo script, video recording by the participant, platform submission.
- **Buffer 30 min.**

## 6. Out of scope (YAGNI)
Multi-turn conversations, a web UI, fine-tuning, embeddings-based retrieval, caching of model responses, more than two tiers, databases other than SQLite, production hardening.

## 7. Held-out protocol
1. The held-out set is generated once, by the committed generator, with a seed chosen by the participant (or by a one-line `crypto.randomInt` call whose output is not printed), into a directory outside the repository, e.g. `C:\D\My Claude Projects\humain-holdout\`.
2. Six templates are flagged `holdoutOnly` and are excluded from every dev generation; they are the "unseen" portion.
3. Nobody, human or assistant, opens the held-out file. The harness reads it; only the aggregate report is read.
4. Exactly one run per policy (P0 and P3) on the held-out set, at the end, after all thresholds are frozen. No re-runs after looking at the numbers.
5. The report states the held-out seed's existence, not its value, and the command used.

## 8. Limitations to state in the submission
Synthetic data and templated questions (paraphrased, but not human-written); one database domain; a lexical router rather than a learned one; model availability and prices are a snapshot of OpenRouter on 30 Oct 2026; two days of work by one person.
