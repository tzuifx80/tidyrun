# TidyRun launch report

> **Status:** v0.1.1 shipped · npm `tidyrun@0.1.1` · release SHA `d50f1448`

For current install and benchmark claims, see the [README](../README.md) and
[benchmarking methodology](BENCHMARKING.md).

## Deterministic fixtures

| Fixture | Baseline | TidyRun | Change |
|---|---:|---:|---:|
| Verification parity | 3/3 | 3/3 | equal |
| Verbose JS output | 64,939 B | 20,037 B | −69% |
| Python output | 19,776 B | 922 B | −95% |
| Repeated typecheck | 17,947 ms | 9,111 ms | −49% |

## Initial Codex study (10 tasks)

| Metric | Baseline | TidyRun |
|---|---:|---:|
| Task success | 10/10 | 10/10 |
| Tool output | 61,401 B | 52,654 B (−14.2%) |
| Input tokens | 1,072,013 | 1,204,738 (+12.4%) |
| Output tokens | 9,885 | 12,650 (+28.0%) |
| Wall time | 297 s | 414 s (+39%) |

TidyRun does not claim universal token or latency savings.
