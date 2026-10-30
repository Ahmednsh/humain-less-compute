# Experiment log

One row per real run, appended automatically by `eval`. Logs live in `results/runs/`.

| run id | policy | task set | n | accuracy | T1/T2/T3 | p95 | tokens in/out | cost / task | cost / success | small % | escalated % | verified % | notes |
|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| dev-P0 | P0 | dev | 150 | 100.0% | 100%/100%/100% | 3370 ms | 3461/168 | $0.0086 | $0.0086 | 0% | 0% | 0% | baseline small=anthropic/claude-haiku-5.5 large=anthropic/claude-sonnet-5.5 θ=4 conc=4 |
| dev-S-small-anthropic-claude-haiku-5.5 | S | dev | 150 | 100.0% | 100%/100%/100% | 5213 ms | 3461/306 | $0.0005 | $0.0005 | 100% | 0% | 0% | small only small=anthropic/claude-haiku-5.5 large=anthropic/claude-sonnet-5.5 θ=4 conc=4 |
| bakeoff-meta-llama_llama-3.3-70b-instruct | S | dev | 45 | 86.7% | 100%/83%/76% | 4660 ms | 2044/115 | $0.0003 | $0.0003 | 100% | 0% | 0% | small-model bake-off, first 45 dev tasks small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| bakeoff-google_gemini-2.5-flash-lite | S | dev | 45 | 84.4% | 100%/92%/65% | 6847 ms | 2215/502 | $0.0003 | $0.0003 | 100% | 0% | 0% | small-model bake-off, first 45 dev tasks small=google/gemini-2.5-flash-lite large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| bakeoff-mistralai_mistral-small-3.2-24b-instruct | S | dev | 45 | 77.8% | 94%/75%/65% | 14705 ms | 2136/141 | $0.0002 | $0.0003 | 100% | 0% | 0% | small-model bake-off, first 45 dev tasks small=mistralai/mistral-small-3.2-24b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| bakeoff-openai_gpt-5.4-nano | S | dev | 45 | 95.6% | 100%/100%/88% | 4704 ms | 1894/170 | $0.0006 | $0.0006 | 100% | 0% | 0% | small-model bake-off, first 45 dev tasks small=openai/gpt-5.4-nano large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| bakeoff-qwen_qwen3-32b | S | dev | 45 | 86.7% | 100%/92%/71% | 50683 ms | 2239/1017 | $0.0005 | $0.0005 | 100% | 0% | 0% | small-model bake-off, first 45 dev tasks small=qwen/qwen3-32b large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| bakeoff-openai_gpt-oss-120b | S | dev | 45 | 95.6% | 100%/100%/88% | 8060 ms | 2102/174 | $0.0001 | $0.0001 | 100% | 0% | 0% | small-model bake-off, first 45 dev tasks small=openai/gpt-oss-120b large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| dev-S | S | dev | 150 | 84.7% | 98%/90%/66% | 7006 ms | 2042/114 | $0.0003 | $0.0003 | 100% | 0% | 0% | small-only-llama small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=2 |
| dev-P1-theta3 | P1 | dev | 150 | 97.3% | 98%/94%/100% | 2706 ms | 2744/150 | $0.0052 | $0.0054 | 45% | 0% | 0% | router-sweep small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=3 conc=2 |
| dev-P1-theta5 | P1 | dev | 150 | 96.7% | 98%/92%/100% | 4844 ms | 2518/147 | $0.0033 | $0.0035 | 70% | 3% | 0% | router-sweep small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=5 conc=2 |
| dev-P1-theta6 | P1 | dev | 150 | 96.0% | 98%/92%/98% | 8749 ms | 2471/146 | $0.0028 | $0.0029 | 77% | 4% | 0% | router-sweep small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=6 conc=2 |
| dev-P2-iter1 | P2 | dev | 150 | 96.7% | 94%/96%/100% | 6576 ms | 876/151 | $0.0025 | $0.0026 | 52% | 0% | 0% | ladder small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=2 |
| dev-P3-iter1 | P3 | dev | 150 | 96.7% | 92%/98%/100% | 8288 ms | 1390/298 | $0.0050 | $0.0052 | 52% | 0% | 42% | ladder small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=2 |
| dev-P1-theta4 | P1 | dev | 150 | 98.0% | 100%/94%/100% | 3524 ms | 2644/144 | $0.0046 | $0.0047 | 52% | 0% | 0% | router-sweep small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=4 |
| dev-P3 | P3 | dev | 150 | 100.0% | 100%/100%/100% | 4323 ms | 1041/160 | $0.0030 | $0.0030 | 52% | 0% | 7% | ladder iteration 2 small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| dev-P2 | P2 | dev | 150 | 99.3% | 100%/98%/100% | 2987 ms | 953/150 | $0.0027 | $0.0028 | 52% | 0% | 0% | ladder iteration 2 small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| holdout-P0 | P0 | holdout | 150 | 99.3% | 100%/100%/98% | 3107 ms | 3717/183 | $0.0093 | $0.0093 | 0% | 0% | 0% | held-out, single run small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| holdout-P3 | P3 | holdout | 150 | 98.7% | 100%/98%/98% | 4419 ms | 1023/170 | $0.0030 | $0.0030 | 58% | 0% | 8% | held-out, single run small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| dev-V | V | dev | 150 | 100.0% | 100%/100%/100% | 7112 ms | 1903/369 | $0.0068 | $0.0068 | 52% | 0% | 100% | verify always contrast small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| r3_modelswap-P3-small-qwen-qwen3.7-flash | P3 | r3_modelswap | 60 | 100.0% | 100%/100%/100% | 28985 ms | 1150/749 | $0.0027 | $0.0027 | 63% | 5% | 7% | R3 small-model swap, 60 tasks small=qwen/qwen3.7-flash large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| r3_modelswap-P3 | P3 | r3_modelswap | 60 | 98.3% | 96%/100%/100% | 4177 ms | 1037/154 | $0.0028 | $0.0029 | 63% | 0% | 12% | R3 reference small, 60 tasks small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| r1_renamed-P3 | P3 | r1_renamed | 60 | 100.0% | 100%/100%/100% | 4239 ms | 1152/183 | $0.0034 | $0.0034 | 53% | 0% | 12% | R1 renamed schema, 60 tasks small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| r2_arabic-P3 | P3 | r2_arabic | 60 | 100.0% | 100%/100%/100% | 4538 ms | 831/200 | $0.0031 | $0.0031 | 53% | 0% | 8% | R2 arabic, 60 tasks small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 conc=3 |
| r1_renamed-P0 | P0 | r1_renamed | 56 | 98.2% | 94%/100%/100% | 2847 ms | 3784/178 | $0.0093 | $0.0095 | 0% | 0% | 0% | R1 renamed schema; 56 of 60 tasks (OpenRouter balance exhausted) small=meta-llama/llama-3.3-70b-instruct large=anthropic/claude-sonnet-5.5 θ=4 |
