# Contributing

## Setup

Requirements: Node.js 22 or newer.

```bash
git clone <repo-url>
cd tidyrun
npm ci
npm run typecheck
npm test
npm run build
```

Workspaces: `packages/core` (engine), `packages/cli` (CLI), `packages/plugin-sdk` (extensions), `packages/tidyrun` (published bundle).

## Where to contribute

| Area | Location |
|---|---|
| Output parsers | `packages/core/src/compress.ts` |
| Optimization rules | `packages/core/src/rules.ts` |
| Provider adapters | `packages/core/src/adapters.ts` |
| Benchmarks | `benchmarks/`, `scripts/run-benchmark-suite.mjs` |
| CLI | `packages/cli/src/main.ts` |

## Good first contributions

- Playwright / Docker / Rust output parser fixtures
- Cross-platform path edge-case tests
- Provider adapter capability notes (no credentials in repo)
- Pinned deterministic benchmark tasks with acceptance checks
- Documented negative benchmark results

## Pull requests

Include verification commands. Keep changes local-first, cross-platform, and fail-open. Do not claim token savings without provider telemetry.
