# Changelog

## Unreleased hardening

- Safe command reuse now requires a successful result and validates repository,
  environment, configuration, class, and artifact fingerprints; failures remain
  recoverable but execute again.
- Repository/test intelligence now resolves transitive imports, configuration
  fan-out, dynamic imports, and bounded large-file hashing.
- Output filters preserve diagnostic windows across JS/TS, Python, Rust, Go,
  package-manager, and generic logs while retaining raw redacted artifacts.
- Artifact/cache persistence validates integrity, merges concurrent writers, and
  clears/prunes without resurrecting stale metadata.
- Added deep failure-mode tests, package-style plugin examples, measured benchmark
  fixtures, suite reports, and observed optimizer-overhead metrics.
- Added an adaptive cost model and direct fast path for trivial pure commands;
  output compression and artifact persistence now bypass work that cannot repay
  its own overhead.
- The `leanagent` workspace now builds a standalone CLI bundle for clean tarball
  installs, and `npm run lint` performs source hygiene checks plus typechecking.

## 0.1.0

- Local-first runtime and CLI foundation.
- Content-addressed artifacts, conservative command reuse, context guards, output filters, repository indexing, loop detection, MCP, plugin SDK, Gemini hooks, metrics, and benchmark reports.
- Provider capabilities documented as full, hook, rules, MCP, or wrapper fallback rather than assumed.
