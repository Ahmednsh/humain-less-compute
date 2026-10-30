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
