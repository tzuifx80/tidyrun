# TidyRun

[![npm](https://img.shields.io/npm/v/tidyrun)](https://www.npmjs.com/package/tidyrun)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-green)](https://nodejs.org)

**Cut noisy coding-agent tool output and safely reuse deterministic work — locally, without another LLM.**

TidyRun is not another coding agent. It is a local optimization layer around
deterministic tool work: compress test/build logs, reuse verified commands,
and keep full output recoverable.

```bash
npx tidyrun@latest init
tidyrun run -- npm test
tidyrun stats --last
```

No API key · No extra model · Telemetry off · `TIDYRUN_BYPASS=1` to disable

## Quick start

```bash
npx tidyrun@latest init
tidyrun run -- npm test          # compress noisy output
tidyrun run -- npm test          # reuse if state unchanged
tidyrun cat <artifact-id>        # recover full raw output when needed
tidyrun doctor                   # health check
```

Requires Node.js 22+. Works with Codex, Claude Code, Gemini CLI, Cursor, and
any shell workflow via `tidyrun run -- <command>` or native hooks where
available.

## What it is (and isn't)

| | TidyRun | Another coding agent / LLM summarizer |
|---|---|---|
| Adds an LLM | No | Yes |
| Runs locally | Yes | Often cloud |
| Compresses terminal output | Yes | Sometimes |
| Reuses verified commands | Yes | Rarely |
| Raw output recoverable | Yes (`tidyrun cat`) | Varies |

TidyRun sits between your agent and noisy developer tools — caching,
compressing, and guarding context without changing the model.

## Trust

- **Local-first** — artifacts and cache stay on your machine
- **No API key** — nothing to sign up for
- **No extra LLM** — deterministic rules and parsers only
- **Telemetry disabled** by default
- **Conservative reuse** — failed or uncertain commands re-run normally
- **Fail-open** — optimizer errors fall through to plain execution
- **Bypass** — `TIDYRUN_BYPASS=1` disables all optimizations

## Measured results

### Deterministic fixtures

Reproducible: `npm run benchmark:suite` · [methodology](docs/BENCHMARKING.md)

| Fixture | Baseline | TidyRun | Change |
|---|---:|---:|---:|
| Verification parity | 3/3 | 3/3 | equal |
| Verbose JS test output | 64,939 B | 20,037 B | **−69%** |
| Python test output | 19,776 B | 922 B | **−95%** |
| Repeated typecheck time | 17,947 ms | 9,111 ms | **−49%** |

Fixture results — not guarantees for every coding session.

### Initial real Codex study

10 tasks · Codex · gpt-5.4-mini · low reasoning · two small repos

| Metric | Baseline | TidyRun | Change |
|---|---:|---:|---:|
| Task success | 10/10 | 10/10 | equal |
| Agent-visible tool output | 61,401 B | 52,654 B | −14.2% |
| Extra LLM calls | 0 | 0 | — |
| Input tokens | 1,072,013 | 1,204,738 | +12.4% |
| Output tokens | 9,885 | 12,650 | +28.0% |
| Wall time | 297 s | 414 s | +39% |

In this small study TidyRun reduced tool-output bytes while preserving task
success, but **total model tokens and wall time increased**. TidyRun does not
claim universal token or latency savings. See
[limitations](benchmarks/final-launch-report.md).

## Supported workflows

| Integration | Depth | How |
|---|---|---|
| Codex | Wrapper | `tidyrun run -- <cmd>` |
| Gemini CLI | Native hook | `tidyrun hook gemini` |
| Claude Code / Cursor | Partial | Managed rules + wrapper |
| Generic shell | Wrapper | `tidyrun run -- <cmd>` |
| MCP | Available | `tidyrun mcp` |

No official partnerships implied. Wrapper paths work everywhere; native hooks
depend on the host agent.

## Demo

Terminal recording: [`docs/tidyrun-demo.cast`](docs/tidyrun-demo.cast) ·
[replay instructions](docs/DEMO.md)

## Try it on a real repo

Run TidyRun on a noisy project and open an
[efficiency report](.github/ISSUE_TEMPLATE/efficiency_report.md) or
[bug report](.github/ISSUE_TEMPLATE/bug_report.md). Useful feedback:

- compression that hides too much or too little
- reuse that looks unsafe
- strong improvements on specific agents or commands
- agent-specific integration issues

## CLI reference

```bash
tidyrun init | run -- <cmd> | stats [--last] | doctor | cat <id>
tidyrun cache stats | clean --artifacts | sync | mcp
```

## Development

```bash
git clone https://github.com/tzuifx80/tidyrun.git
cd tidyrun && npm ci && npm test && npm run build
```

Apache-2.0 · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) ·
[Roadmap](docs/ROADMAP.md)
