| policy | n | accuracy | T1 / T2 / T3 | p50 | p95 | tokens in/out per task | cost / task | cost / success | Δ cost / success | small % | escalated % | verified % | floors |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **P0** baseline: large always · dev-P0 | 150 | 100.0% | 100% / 100% / 100% | 1545 ms | 3370 ms | 3461 / 168 | $0.0086 | $0.0086 | 0% | 0% | 0% | 0% | reference |
| **S** small only · dev-S | 150 | 84.7% | 98% / 90% / 66% | 1919 ms | 7006 ms | 2042 / 114 | $0.0003 | $0.0003 | -96% | 100% | 0% | 0% | ❌ acc ❌ p95 |
| **P1** + router · dev-P1-theta4 | 150 | 98.0% | 100% / 94% / 100% | 1723 ms | 3524 ms | 2644 / 144 | $0.0046 | $0.0047 | -46% | 52% | 0% | 0% | ✅ acc ✅ p95 |
| **P2** + context pruning · dev-P2-iter1 | 150 | 96.7% | 94% / 96% / 100% | 1917 ms | 6576 ms | 876 / 151 | $0.0025 | $0.0026 | -70% | 52% | 0% | 0% | ❌ acc ❌ p95 |
| **P3** + selective verification (full) · dev-P3-iter1 | 150 | 96.7% | 92% / 98% / 100% | 3621 ms | 8288 ms | 1390 / 298 | $0.0050 | $0.0052 | -40% | 52% | 0% | 42% | ❌ acc ❌ p95 |

Floors (relative to P0): accuracy ≥ baseline − 2 pp; p95 latency ≤ 1.25× baseline. Cost per success = total spend ÷ correct answers (failed and escalated attempts included).
