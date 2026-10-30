| policy | n | accuracy | T1 / T2 / T3 | p50 | p95 | tokens in/out per task | cost / task | cost / success | Δ cost / success | small % | escalated % | verified % | floors |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **P0** baseline: large always · holdout-P0 | 150 | 99.3% | 100% / 100% / 98% | 1554 ms | 3107 ms | 3717 / 183 | $0.0093 | $0.0093 | 0% | 0% | 0% | 0% | reference |
| **P3** + selective verification (full) · holdout-P3 | 150 | 98.7% | 100% / 98% / 98% | 1427 ms | 4419 ms | 1023 / 170 | $0.0030 | $0.0030 | -68% | 58% | 0% | 8% | ✅ acc ❌ p95 |

Floors (relative to P0): accuracy ≥ baseline − 2 pp; p95 latency ≤ 1.25× baseline. Cost per success = total spend ÷ correct answers (failed and escalated attempts included).
