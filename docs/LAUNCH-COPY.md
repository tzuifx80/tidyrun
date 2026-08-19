# Launch copy (draft)

Prepared for review only. No external posting is authorized by this repository.

## Hacker News

**Show HN: LeanAgent – stop coding agents from repeating deterministic work**

LeanAgent is a local-first runtime for coding agents. It compresses noisy test
output, reuses verified deterministic commands, protects against duplicate
reads, and detects no-progress loops without another model, API key, or
telemetry service. The checked-in deterministic suite reduced agent-visible
output by 74% across three Node/TypeScript/Python fixtures with 3/3 verification
parity; the raw reports and methodology are in `benchmarks/`.

## Reddit

I built a local optimizer that stops coding agents rereading unchanged files and
rerunning unchanged safe commands. It also keeps full redacted artifacts
recoverable when it compresses terminal noise. Current evidence is deterministic
fixture work rather than a broad external-agent study, so the repo publishes the
negative results and local overhead too.

## Short post

LeanAgent removes deterministic waste around coding agents: compressed diagnostics,
verified command reuse, duplicate-read protection, and loop warnings. No second
LLM. Latest checked-in fixtures: −74% agent-visible output, 3/3 verification
parity. Reports are reproducible and token claims are intentionally omitted.

## GitHub release notes

- Adaptive fast path skips repository scans and persistence for trivial pure commands.
- Standalone `leanagent` tarball now bundles the CLI and core runtime; `npm run package:smoke` validates a fresh install.
- `npm run lint` is a real source-hygiene gate plus typecheck, and CI runs it on Windows, Ubuntu, and macOS.
- Deterministic suite covers Node/TypeScript repeated work and Python diagnostic output; provider-token usage remains unavailable without adapter metadata.
