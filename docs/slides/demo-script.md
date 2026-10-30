# Demo video script (≤ 3 minutes)

Platform rule: the video shows the solution working; it does not repeat the slides. Record the terminal and the HTML report. Narration language: participant's choice (Arabic or English); on-screen text is English.

**Before recording:** `npm run gen:db && npm run gen:tasks`; have `results/report.html` from the final runs open in a browser tab; terminal font large; `.env` present; pick 8 dev tasks that include at least one escalation and one verification (`--limit 8` on a task file reordered for the demo, or a dedicated `data/demo.jsonl`).

| time | on screen | say |
|---|---|---|
| 0:00–0:20 | Title card: *Deliver AI with Less Compute — a budget-aware controller for ask-your-data analytics*. Then the 12-table schema diagram (from the slides). | Companies send every question to their biggest model with the whole schema and the whole history. Most of that compute is wasted. This controller decides, per question, which model to use, which tables to send, and when a second opinion is worth paying for. |
| 0:20–1:40 | Terminal: `npm run cli -- eval --policy P3 --tasks data/demo.jsonl --db data/company.sqlite --limit 8`. Point at the live lines: `route=small`, `tables=2`, `ver=0`, then a hard question with `route=large ver=1`, then one with `esc=1`. | Watch the decisions. An easy count goes to the small model with two tables instead of twelve. A year-over-year growth question scores high on the router and goes straight to the large model and gets verified, because a wrong money number is expensive. Here the small model's SQL failed its free checks, so the controller escalated once; the cost of the failed attempt is still counted. Every line is a logged JSON row with tokens, cost and latency. |
| 1:40–2:30 | Browser: `results/report.html`. Hover the rows P0 → P1 → P2 → P3; then the robustness table. | Same 150 questions, six policies. The baseline is the large model always. Adding the router, then pruning, then selective verification, each row cuts cost per successful task while accuracy stays inside the two-point floor and p95 latency inside 1.25× the baseline. Verify-always shows blanket verification is not worth it. On a renamed schema, Arabic questions, and a swapped small model, the controller adapts: escalation rises, accuracy holds. |
| 2:30–2:50 | Report: the held-out section. | The final numbers come from a held-out set generated with a secret seed outside the repository, including six question types never seen during development, run once. |
| 2:50–3:00 | README limitations. | Synthetic data, one domain, a lexical router, two days. Everything is reproducible with one command. Thank you. |

Cut anything that runs long; the ablation table and the held-out line are the two things that must be on screen.
