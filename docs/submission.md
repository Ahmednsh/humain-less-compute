# Platform submission texts (copy into the project page)

**Challenge:** 2 — Deliver AI with Less Compute

**One-sentence description**
A budget-aware controller for "ask-your-data" analytics that routes each question to a small or large model, sends only the schema it needs and verifies only where a mistake is likely, cutting cost per correct answer by 68 % on a held-out set at −0.6 pp accuracy.

**Links**
- Source code: https://github.com/Ahmednsh/humain-less-compute
- Presentation: `docs/slides/deck.pdf` (9 slides; source `docs/slides/deck.pptx`, generator `docs/slides/build-deck.cjs`)
- Results page: `results/report.html` in the repository (also `results/report.md`)
- Demo video: https://www.loom.com/share/afff211b81bf43da9d86bb30e869d4d9 (Loom, public link; run of show in docs/slides/demo-narration.md)

**Issue & Solution**
Most LLM products send every request to their largest model with the whole schema, a long glossary and many examples, and apply the same checking to a trivial lookup and to a multi-join financial question. Most of those tokens are never read by the task, failed attempts still burn compute, and "cheap" only counts if the answer is right and on time.

The solution is a controller in front of two model tiers (small: Llama 3.3 70B, large: Claude Sonnet 5.5, both via OpenRouter, ≈20× price gap). Per question it (1) estimates difficulty from the text alone and routes to a tier, (2) prunes the 12-table schema to the tables the question needs plus the join path, with only the glossary lines and examples that apply, (3) executes the SQL read-only with free checks, and (4) pays for a large-model second opinion only when the small model answered with low confidence, complex SQL or a money aggregate, escalating once if the check fails. Every call is logged with tokens, USD and latency.

Measured on 150 dev tasks over a synthetic 12-table company database with exact gold answers: the baseline (large model always) costs $0.0086 per correct answer; the full system costs $0.0030 (−65 %) at the same 100 % accuracy, with p95 latency 4.3 s vs 3.4 s. On a held-out set of 150 unseen tasks including six never-seen question types, generated with a secret seed outside the repository and run once: $0.0093 → $0.0030 per correct answer (−68 %), accuracy 99.3 % → 98.7 %. Each component earns its own row in the ablation (router −46 %, pruning −68 %, verification +0.7 pp), the naive extremes lose (small-only 84.7 %; verify-always 2.3× the cost for the same accuracy), and the system holds up under a renamed schema, Arabic questions and a swapped small model without retuning.

**How it works (3 steps)**
1. **Route** — a zero-token lexical difficulty score sends easy questions to the small model and hard ones straight to the large one (θ chosen by a sweep on the dev set).
2. **Prune** — only the tables the question mentions (plus the foreign-key path between them), the glossary lines it needs and at most two worked examples go into the prompt: 3 461 → ~1 000 prompt tokens.
3. **Verify where it pays** — free checks on every answer (SQL ran, non-empty, shape matches); a large-model verification only for risky small-tier answers; one escalation if it fails. Failed and verified attempts are counted in the cost.

**Testing & evidence**
109 unit and component tests (every gold SQL hand-checked on a fixture; pruner recall measured at 100 %); a mock end-to-end run (`npm test`) wired into CI (GitHub Actions is paused on this account until 1 Nov; all 109 tests pass locally); every real run is a committed JSONL log and a row in `results/EXPERIMENTS.md`; the report is rebuilt from the logs with one command. Decision log with chosen / why / rejected for 21 decisions in `DECISIONS.md`.

**Limitations**
Synthetic data and templated questions (paraphrased, not human-written); one database domain; a lexical router; model availability and prices are a 30 Oct 2026 snapshot of OpenRouter; the p95 floor (1.25 × a single flagship call) is missed by the full system by 0.1–0.5 s, pruning alone meets it; two days, one person.

**Why consider me for the traineeship (free text)**
I treat an AI system as something you measure before you believe: I fixed the metrics and floors before the first paid run, logged every experiment including the ones that failed, found and fixed my own weaknesses from the logs (a question ambiguity, a pruning blind spot, a verifier that was checking the expensive model against itself), chose the small model by a bake-off rather than by reputation, and kept a held-out set I never looked at. The whole thing is reproducible from one command. That is how I would like to build at HUMAIN.
