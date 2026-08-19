# LeanAgent final launch report

- Benchmark commit: `a1fb14917b2a149929f689edc9b41944bb5dc4c9`
- Observed: 2026-08-19T13:26:09.654Z
- Agent: Codex 0.147.0, model gpt-5.4-mini, reasoning low
- Repositories: fixtures/python-project, fixtures/typescript-app

## Real-agent quality and efficiency

| Metric | Baseline | LeanAgent | Change |
|---|---:|---:|---:|
| Independent task acceptance | 10/10 | 10/10 | parity |
| Codex tool-output bytes | 61,401 | 52,654 | −14.2% |
| Tool calls | 75 | 75 | −0.0% |
| Wall time (ms) | 297,526 | 413,745 | +39.1% |
| Provider input tokens | 1,072,013 | 1,204,738 | observed, not billing |
| Provider output tokens | 9,885 | 12,650 | observed, not billing |
| LeanAgent overhead (ms) | — | 1,788 | observed |
| Additional LeanAgent LLM calls | 0 | 0 | observed |

Quality parity: **10/10**.

## Deterministic fixture suite

| Metric | Baseline | LeanAgent | Change |
|---|---:|---:|---:|
| Fixture verification parity | 3/3 | 3/3 | parity |
| Command output bytes | 86,159 | 22,455 | −73.9% delivered |
| End-to-end time (ms) | 17,557 | 9,026 | −48.6% |
| Verified cache hits | — | 1 | observed |

## Tasks

| Task | Repository | Start commit | A | B | Parity |
|---|---|---|---|---|---|
| py-addition-bug | python | 02bd222627afc42e610c3085d3dc2bf3f1516fb8 | PASS | PASS | PASS |
| py-negative-edge | python | 65dae235c201facf0cbfc38b3e91ad4d5e2a9104 | PASS | PASS | PASS |
| py-optional-offset | python | e7fb9bde26168df02be8a075a8be5fdeb1102c9c | PASS | PASS | PASS |
| py-input-validation | python | 3514695959dc117a58ab53df38a24ef90c7a2cf2 | PASS | PASS | PASS |
| py-high-output-diagnostic | python | 6127bf76de9e3d0ee6927a6839125c3a06a4adb6 | PASS | PASS | PASS |
| ts-addition-bug | typescript | 216bb4e34f481dcd0c3b5cd52dc7c97e481d2442 | PASS | PASS | PASS |
| ts-multiply-feature | typescript | 6a77a9b8d5fca83c644a40da25b765e51a9a4b07 | PASS | PASS | PASS |
| ts-finite-inputs | typescript | 6ec9cf42c82f29c8ca1ce0710857d79e00d282a1 | PASS | PASS | PASS |
| ts-script-repair | typescript | 18737c312be79e21e0f49149466cee9e9c1c4787 | PASS | PASS | PASS |
| ts-clamp-feature | typescript | 98fee642e8db4c290cb47c2552cd89b8a2cfe88b | PASS | PASS | PASS |

## Negative results and limitations

- Aggregate wall time increased in the LeanAgent treatment; this study does not support a speedup claim.
- Provider token telemetry was observed but is not presented as billing savings.
- The one-shot coding tasks did not exercise verified command reuse; deterministic fixtures cover that mechanism separately.

Provider results: Gemini CLI was installed but unauthenticated; OpenCode credentials were detected but its tested provider paths produced no completed task. Token usage is **observed telemetry only**; no billing estimate is made.
