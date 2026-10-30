| policy | n | accuracy | T1 / T2 / T3 | p50 | p95 | tokens in/out per task | cost / task | cost / success | Δ cost / success | small % | escalated % | verified % | floors |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **P0** baseline: large always · dev-P0 | 150 | 100.0% | 100% / 100% / 100% | 1545 ms | 3370 ms | 3461 / 168 | $0.0086 | $0.0086 | 0% | 0% | 0% | 0% | reference |
| **S** small only · dev-S | 150 | 84.7% | 98% / 90% / 66% | 1919 ms | 7006 ms | 2042 / 114 | $0.0003 | $0.0003 | -96% | 100% | 0% | 0% | ❌ acc ❌ p95 |
| **P1** + router · dev-P1-theta4 | 150 | 98.0% | 100% / 94% / 100% | 1723 ms | 3524 ms | 2644 / 144 | $0.0046 | $0.0047 | -46% | 52% | 0% | 0% | ✅ acc ✅ p95 |
| **P2** + context pruning · dev-P2 | 150 | 99.3% | 100% / 98% / 100% | 1577 ms | 2987 ms | 953 / 150 | $0.0027 | $0.0028 | -68% | 52% | 0% | 0% | ✅ acc ✅ p95 |
| **P3** + selective verification (full) · dev-P3 | 150 | 100.0% | 100% / 100% / 100% | 1916 ms | 4323 ms | 1041 / 160 | $0.0030 | $0.0030 | -65% | 52% | 0% | 7% | ✅ acc ❌ p95 |
| **V** verify always · dev-V | 150 | 100.0% | 100% / 100% / 100% | 4045 ms | 7112 ms | 1903 / 369 | $0.0068 | $0.0068 | -21% | 52% | 0% | 100% | ✅ acc ❌ p95 |

Floors (relative to P0): accuracy ≥ baseline − 2 pp; p95 latency ≤ 1.25× baseline. Cost per success = total spend ÷ correct answers (failed and escalated attempts included).
