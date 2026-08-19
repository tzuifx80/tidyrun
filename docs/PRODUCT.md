# LeanAgent product contract

Canonical engineering spec distilled from the LeanAgent OS brief. Implementation must remain local-first, deterministic, agent-neutral, reversible, and honest about metrics.

## Product

LeanAgent automatically removes wasted work from AI coding agents without requiring another AI model. Quality beats savings. If an optimization is not safe, allow the original operation.

## Hard rules

- Local-first: no account, no cloud, no default telemetry, no uploading repos
- Core engine: zero additional model calls
- Agent-neutral adapters with documented capability levels
- Conservative invalidation
- Every optimization explains what, why, evidence, fallback
- User can disable a rule, fetch full output, bypass one op, disable per session

## Required systems

Event bus; session + repository state; rule/decision engine; artifact store; dependency-aware work cache; output filters; loop detector; failed-approach memory; incremental test selection; repo index; `leanagent.yaml`; `leanagent sync`; generic `leanagent run`; optional MCP; profiler/stats; benchmark harness; plugin boundaries; CLI; Apache-2.0; Windows/macOS/Linux.

## Success

Same or better task quality with materially less wasted work, proven by reproducible before/after benchmarks. Never invent token/dollar/CO2 savings.

## Failure modes to avoid

Analytics-only dashboard, hidden LLM, unsafe cache, hidden test failures, one-agent-only design, more overhead than savings.
