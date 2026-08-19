# Competitive landscape (checked 2026-08-19)

This is a snapshot, not a claim that the space is static.

## Closest overlaps

- [Token Optimizer MCP](https://github.com/ooples/token-optimizer-mcp) targets multiple coding-agent clients with MCP/plugin hooks, caching, output optimization, and its own measurement report.
- [Token-Saver](https://github.com/ppgranger/token-saver) is a deterministic CLI-output compressor for coding assistants and explicitly documents no extra LLM calls.
- [Compressor](https://github.com/anvanster/compressor) provides agent hooks/instruction packs and publishes success-checked context benchmarks.
- [LeanAgent (Lean Dojo)](https://github.com/lean-dojo/LeanAgent) is an established formal-theorem-proving research project using the same name; it is a domain collision, not a code or npm collision.

`npm view leanagent version` and `npm view @leanagent/core version` returned 404
on the check date. The GitHub name collision is still material search noise, so
launch copy should lead with the coding-agent optimization description rather
than implying affiliation with Lean Dojo.

## LeanAgent's narrow distinction

LeanAgent is a local shell/runtime layer rather than a second model or a hosted
MCP analytics service. Its strongest evidence is conservative, verified reuse of
unchanged successful commands combined with recoverable output compression and
repository fingerprints. Provider interception is intentionally documented as
partial/fallback where the host does not expose a safe hook.

The distinction is not exclusivity: users should compare safety, provider
coverage, recovery semantics, and measured results rather than rely on a generic
"token optimizer" label.
