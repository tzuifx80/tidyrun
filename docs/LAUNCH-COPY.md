# Launch copy

Prepared copy; posting still requires a maintainer's normal release decision.

## Hacker News

**Show HN: LeanAgent – a local optimizer that removes deterministic waste from coding agents**

LeanAgent is a local-first runtime for coding agents. It compresses noisy test
output and reuses verified deterministic commands without another model, API
key, or telemetry service. In a controlled Codex study, 10/10 tasks passed
independent acceptance checks in both runs; observed Codex tool output fell from
61,401 B to 52,654 B (−14.2%), and tool calls from 75 to 75 (0.0%). The raw
methodology and deterministic fixture reports are in `benchmarks/`.

## Reddit

I built a local optimizer that stops coding agents paying for the same terminal
work twice. It keeps full redacted artifacts recoverable when it compresses
terminal noise. I ran ten controlled Codex coding tasks with independent checks:
both sides passed all ten, while observed agent-visible tool output dropped 45%.
The same study was slower wall-clock, so this is a context/work reduction claim,
not a promise of faster execution.

## Short post

LeanAgent removes deterministic waste around coding agents: compressed diagnostics
and verified command reuse, locally, with no second LLM. Real Codex study:
−14.2% observed tool-output bytes, 75 → 75 tool calls, 10/10 acceptance parity.
Token billing claims are intentionally omitted.

## GitHub release notes

- Adaptive fast path skips repository scans and persistence for trivial pure commands.
- Standalone `leanagent` tarball now bundles the CLI and core runtime; `npm run package:smoke` validates a fresh install.
- `npm run lint` is a real source-hygiene gate plus typecheck, and CI runs it on Windows, Ubuntu, and macOS.
- Deterministic suite covers Node/TypeScript repeated work and Python diagnostic output; provider-token usage remains unavailable without adapter metadata.
- The controlled real-agent report records Codex as the only completed provider study in this environment; Gemini and OpenCode limitations are documented rather than guessed.
