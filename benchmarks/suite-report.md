# LeanAgent benchmark: verbose-test-diagnostics

Task: Preserve actionable failures while removing repetitive test progress output
Agent: generic-shell
Model: not applicable

| Run | Exit | Command time | End-to-end | Raw bytes | Agent-visible bytes | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 1 | 76 ms | 76 ms | 64939 | 64939 | 0 |
| LeanAgent | 1 | 71 ms | 86 ms | 64939 | 20050 | 0 |

Observed agent-visible output reduction: **69%**

LeanAgent overhead (observed): 6 ms; snapshot 0 ms; compression 1 ms; artifacts 4 ms.

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
| Baseline | 0 | 17326 ms | 17326 ms | 1444 | 1444 | 0 |
| LeanAgent | 0 | 8725 ms | 8810 ms | 1444 | 1444 | 1 |

Observed agent-visible output reduction: **0%**

LeanAgent overhead (observed): 79 ms; snapshot 75 ms; compression 0 ms; artifacts 3 ms.

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
| Baseline | 1 | 672 ms | 672 ms | 19776 | 19776 | 0 |
| LeanAgent | 1 | 128 ms | 135 ms | 19776 | 961 | 0 |

Observed agent-visible output reduction: **95%**

LeanAgent overhead (observed): 3 ms; snapshot 0 ms; compression 0 ms; artifacts 3 ms.

Quality parity: **PASS**

Output bytes are observed. Avoided bytes are derived from raw command output minus the exact representation delivered by LeanAgent. Provider token usage is not inferred.
No startingCommit supplied; use a pinned commit for agent studies.
