# TidyRun deterministic suite

Benchmark commit: `c0e0e3e2ea156ba77a7a7ad8054e1003e4b1e952`

# TidyRun benchmark: verbose-test-diagnostics

Task: Preserve actionable failures while removing repetitive test progress output
Agent: generic-shell
Model: not applicable

| Run | Exit | Command time | End-to-end | Raw bytes | Agent-visible bytes | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 1 | 80 ms | 80 ms | 64939 | 64939 | 0 |
| TidyRun | 1 | 77 ms | 93 ms | 64939 | 20037 | 0 |

Observed agent-visible output reduction: **69%**

TidyRun overhead (observed): 8 ms; snapshot 0 ms; compression 1 ms; artifacts 6 ms.

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
| Baseline | 0 | 19451 ms | 19451 ms | 1392 | 1392 | 0 |
| TidyRun | 0 | 10465 ms | 10710 ms | 1392 | 1392 | 1 |

Observed agent-visible output reduction: **0%**

TidyRun overhead (observed): 234 ms; snapshot 226 ms; compression 0 ms; artifacts 7 ms.

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
| Baseline | 1 | 154 ms | 154 ms | 19776 | 19776 | 0 |
| TidyRun | 1 | 134 ms | 141 ms | 19776 | 922 | 0 |

Observed agent-visible output reduction: **95%**

TidyRun overhead (observed): 4 ms; snapshot 0 ms; compression 0 ms; artifacts 3 ms.

Quality parity: **PASS**

Output bytes are observed. Avoided bytes are derived from raw command output minus the exact representation delivered by TidyRun. Provider token usage is not inferred.
No startingCommit supplied; use a pinned commit for agent studies.
