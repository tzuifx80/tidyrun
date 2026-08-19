# TidyRun deterministic suite

Benchmark commit: `230fd665047fe875b38378835c3608e8a0208e20`

# TidyRun benchmark: verbose-test-diagnostics

Task: Preserve actionable failures while removing repetitive test progress output
Agent: generic-shell
Model: not applicable

| Run | Exit | Command time | End-to-end | Raw bytes | Agent-visible bytes | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 1 | 77 ms | 77 ms | 64939 | 64939 | 0 |
| TidyRun | 1 | 79 ms | 94 ms | 64939 | 20037 | 0 |

Observed agent-visible output reduction: **69%**

TidyRun overhead (observed): 7 ms; snapshot 0 ms; compression 1 ms; artifacts 5 ms.

Quality parity: **PASS**

Output bytes are observed. Avoided bytes are derived from raw command output minus the exact representation delivered by TidyRun. Provider token usage is not inferred.
No startingCommit supplied; use a pinned commit for agent studies.

---

# TidyRun benchmark: repeated-safe-command

Task: Run the same deterministic typecheck twice without replaying unchanged work
Agent: generic-shell
Model: not applicable

| Run | Exit | Command time | End-to-end | Raw bytes | Agent-visible bytes | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 0 | 19287 ms | 19287 ms | 3144 | 3144 | 0 |
| TidyRun | 0 | 8836 ms | 9030 ms | 3144 | 3144 | 1 |

Observed agent-visible output reduction: **0%**

TidyRun overhead (observed): 186 ms; snapshot 182 ms; compression 0 ms; artifacts 3 ms.

Quality parity: **PASS**

Output bytes are observed. Avoided bytes are derived from raw command output minus the exact representation delivered by TidyRun. Provider token usage is not inferred.
No startingCommit supplied; use a pinned commit for agent studies.

---

# TidyRun benchmark: python-verbose-diagnostics

Task: Preserve the actionable Python failure while removing repetitive progress output
Agent: generic-shell
Model: not applicable

| Run | Exit | Command time | End-to-end | Raw bytes | Agent-visible bytes | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 1 | 135 ms | 135 ms | 19776 | 19776 | 0 |
| TidyRun | 1 | 129 ms | 136 ms | 19776 | 922 | 0 |

Observed agent-visible output reduction: **95%**

TidyRun overhead (observed): 4 ms; snapshot 0 ms; compression 0 ms; artifacts 3 ms.

Quality parity: **PASS**

Output bytes are observed. Avoided bytes are derived from raw command output minus the exact representation delivered by TidyRun. Provider token usage is not inferred.
No startingCommit supplied; use a pinned commit for agent studies.
