# Experiment log

One row per real run, appended automatically by `eval`. Logs live in `results/runs/`.

| run id | policy | task set | n | accuracy | T1/T2/T3 | p95 | tokens in/out | cost / task | cost / success | small % | escalated % | verified % | notes |
|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| dev-P0 | P0 | dev | 150 | 100.0% | 100%/100%/100% | 3370 ms | 3461/168 | $0.0086 | $0.0086 | 0% | 0% | 0% | baseline small=anthropic/claude-haiku-5.5 large=anthropic/claude-sonnet-5.5 θ=4 conc=4 |
| dev-S | S | dev | 150 | 100.0% | 100%/100%/100% | 5213 ms | 3461/306 | $0.0005 | $0.0005 | 100% | 0% | 0% | small only small=anthropic/claude-haiku-5.5 large=anthropic/claude-sonnet-5.5 θ=4 conc=4 |
| bakeoff-meta-llama_llama-3.3-70b-instruct | S | dev | 45 | 86.7% | 100%/83%/76% | 4660 ms | 2044/115 | $0.0003 | $0.0003 | 100% | 0% | 0% | small-model bake-off, first 45 dev tasks small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| bakeoff-google_gemini-2.5-flash-lite | S | dev | 45 | 84.4% | 100%/92%/65% | 6847 ms | 2215/502 | $0.0003 | $0.0003 | 100% | 0% | 0% | small-model bake-off, first 45 dev tasks small=google/gemini-2.5-flash-lite large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
