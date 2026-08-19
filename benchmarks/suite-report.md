# LeanAgent deterministic suite

Benchmark commit: `af36cf5fd17079d84bb0925c74948a669ae74fc5`

# LeanAgent benchmark: verbose-test-diagnostics

Task: Preserve actionable failures while removing repetitive test progress output
Agent: generic-shell
Model: not applicable

| Run | Exit | Command time | End-to-end | Raw bytes | Agent-visible bytes | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 1 | 81 ms | 81 ms | 64939 | 64939 | 0 |
| LeanAgent | 1 | 78 ms | 92 ms | 64939 | 20050 | 0 |

Observed agent-visible output reduction: **69%**

LeanAgent overhead (observed): 7 ms; snapshot 0 ms; compression 1 ms; artifacts 4 ms.

Quality parity: **PASS**

Output bytes are observed. Avoided bytes are derived from raw command output minus the exact representation delivered by LeanAgent. Provider token usage is not inferred.
No startingCommit supplied; use a pinned commit for agent studies.

---

# LeanAgent benchmark: repeated-safe-command

Task: Run the same deterministic typecheck twice without replaying unchanged work
Agent: generic-shell
Model: not applicable

| Run | Exit | Command time | End-to-end | Raw bytes | Agent-visible bytes | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 0 | 17527 ms | 17527 ms | 1444 | 1444 | 0 |
| LeanAgent | 0 | 8998 ms | 9169 ms | 1444 | 1444 | 1 |

Observed agent-visible output reduction: **0%**

LeanAgent overhead (observed): 165 ms; snapshot 161 ms; compression 0 ms; artifacts 3 ms.

Quality parity: **PASS**

Output bytes are observed. Avoided bytes are derived from raw command output minus the exact representation delivered by LeanAgent. Provider token usage is not inferred.
No startingCommit supplied; use a pinned commit for agent studies.

---

# LeanAgent benchmark: python-verbose-diagnostics

Task: Preserve the actionable Python failure while removing repetitive progress output
Agent: generic-shell
Model: not applicable

| Run | Exit | Command time | End-to-end | Raw bytes | Agent-visible bytes | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 1 | 134 ms | 134 ms | 19776 | 19776 | 0 |
| LeanAgent | 1 | 128 ms | 134 ms | 19776 | 961 | 0 |

Observed agent-visible output reduction: **95%**

LeanAgent overhead (observed): 4 ms; snapshot 0 ms; compression 0 ms; artifacts 3 ms.

Quality parity: **PASS**

Output bytes are observed. Avoided bytes are derived from raw command output minus the exact representation delivered by LeanAgent. Provider token usage is not inferred.
No startingCommit supplied; use a pinned commit for agent studies.
