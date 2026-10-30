| policy | n | accuracy | T1 / T2 / T3 | p50 | p95 | tokens in/out per task | cost / task | cost / success | Δ cost / success | small % | escalated % | verified % | floors |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **P3** + selective verification (full) · r1_renamed-P3 | 60 | 100.0% | 100% / 100% / 100% | 1543 ms | 4239 ms | 1152 / 183 | $0.0034 | $0.0034 | n/a | 53% | 0% | 12% | reference |
| **P3** + selective verification (full) · r2_arabic-P3 | 60 | 100.0% | 100% / 100% / 100% | 1716 ms | 4538 ms | 831 / 200 | $0.0031 | $0.0031 | n/a | 53% | 0% | 8% | reference |
| **P3** + selective verification (full) · r3_modelswap-P3 | 60 | 98.3% | 96% / 100% / 100% | 1541 ms | 4177 ms | 1037 / 154 | $0.0028 | $0.0029 | n/a | 63% | 0% | 12% | reference |
| **P3** + selective verification (full) · r3_modelswap-P3-small-qwen-qwen3.7-flash | 60 | 100.0% | 100% / 100% / 100% | 4225 ms | 28985 ms | 1150 / 749 | $0.0027 | $0.0027 | n/a | 63% | 5% | 7% | reference |

Floors (relative to none): accuracy ≥ baseline − 2 pp; p95 latency ≤ 1.25× baseline. Cost per success = total spend ÷ correct answers (failed and escalated attempts included).
