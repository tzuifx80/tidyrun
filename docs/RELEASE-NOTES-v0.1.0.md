# LeanAgent v0.1.0

## What LeanAgent does

LeanAgent is a local optimization layer for AI coding agents. It compresses
noisy tool output, safely reuses unchanged successful deterministic commands,
and records recoverable artifacts without another LLM.

## Measured results

- Deterministic Windows fixture suite: latest checked-in report is the source of
  truth for output bytes, cache hits, wall time, and verification parity.
- Controlled Codex study: 10/10 baseline tasks and 10/10 LeanAgent tasks passed
  independent acceptance checks. Codex tool output was 61,401 B baseline versus 52,654 B with LeanAgent (−14.2%); tool calls were 75 versus 75 (0.0%).
- Wall time was slower in this study (297,526 ms versus 413,745 ms aggregate),
  so the launch claim is context/tool-work reduction, not universal speedup.
- Provider token telemetry is recorded where Codex supplied it; it is not
  converted into billing claims.

## Supported agents

Codex was the only authenticated provider with a completed controlled study in
this environment. Gemini CLI was installed but unauthenticated. OpenCode was
installed, but its tested provider paths did not produce a completed task.
See [SUPPORTED-AGENTS.md](SUPPORTED-AGENTS.md) for capability boundaries.

## Installation

```bash
npx leanagent init
leanagent run -- npm test
```

Requires Node.js 22 or newer.

## Known limitations

- Native interception is host-dependent; generic wrapping remains the reliable
  path for Codex and other clients without a stable output hook.
- Agent-visible output is measured directly; token savings are not inferred.
- Short commands can lose to local startup/snapshot overhead.
- `LeanAgent` is also the name of a formal-theorem-proving research project;
  this package is unrelated and makes no affiliation claim.

## How to contribute

See [CONTRIBUTING.md](../CONTRIBUTING.md). High-value contributions include
provider adapters, output parsers, language fixtures, benchmark tasks, and
regression tests for safety and cache invalidation.
