# LeanAgent final launch report

- Benchmark commit: `d74ae8670dedf79f94e136202ea853dacd82535f`
- Observed: 2026-08-19T13:07:20.046Z
- Agent: Codex 0.147.0, model gpt-5.4-mini, reasoning low
- Repositories: fixtures/python-project, fixtures/typescript-app

## Real-agent quality and efficiency

| Metric | Baseline | LeanAgent | Change |
|---|---:|---:|---:|
| Independent task acceptance | 10/10 | 10/10 | parity |
| Codex tool-output bytes | 57,199 | 31,235 | −45.4% |
| Tool calls | 67 | 59 | −11.9% |
| Wall time (ms) | 277,394 | 386,891 | +39.5% |
| Provider input tokens | 915,228 | 1,144,972 | observed, not billing |
| Provider output tokens | 10,331 | 12,082 | observed, not billing |
| LeanAgent overhead (ms) | — | 1,961 | observed |
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
| py-addition-bug | python | 9ea35ffca4ce44cfe68ba0a6c6bffed0bf974d2f | PASS | PASS | PASS |
| py-negative-edge | python | f3f7230e3121f6154bdfcd997e3e167c3d858f48 | PASS | PASS | PASS |
| py-optional-offset | python | 9dce7b99c1ed4f609976728327ab72037b02bdd4 | PASS | PASS | PASS |
| py-input-validation | python | d7e1d208928b9b4855f7e1ed675fcc58c6b165c7 | PASS | PASS | PASS |
| py-high-output-diagnostic | python | af6ca240735299f6f7ec5ed14bd09a7864ca2f97 | PASS | PASS | PASS |
| ts-addition-bug | typescript | 28794d8ffcbd51c0cc271b41ea705c2f2be9cd9e | PASS | PASS | PASS |
| ts-multiply-feature | typescript | 24b6e3652861f1acecc4c231a3c962f54e9c0494 | PASS | PASS | PASS |
| ts-finite-inputs | typescript | 2bf0760c9e237ea1418931af456e45e3e92be541 | PASS | PASS | PASS |
| ts-script-repair | typescript | f44bf7541dcfa909c339407d7eba7dd7a87a0043 | PASS | PASS | PASS |
| ts-clamp-feature | typescript | d8a03e761dab498137f46d47c0f1d2b60dc28d90 | PASS | PASS | PASS |

## Negative results and limitations

- Aggregate wall time increased in the LeanAgent treatment; this study does not support a speedup claim.
- Provider token telemetry was observed but is not presented as billing savings.
- The one-shot coding tasks did not exercise verified command reuse; deterministic fixtures cover that mechanism separately.

Provider results: Gemini CLI was installed but unauthenticated; OpenCode credentials were detected but its tested provider paths produced no completed task. Token usage is **observed telemetry only**; no billing estimate is made.
