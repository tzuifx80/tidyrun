# TidyRun

> **Stop feeding your coding agent noisy tool output.**

TidyRun locally compresses developer-tool output and safely reuses
deterministic commands when relevant state hasn't changed.

```bash
npx tidyrun init
tidyrun run -- npm test
```

- **No extra LLM**
- **Local-first**
- **Raw output remains recoverable** (`tidyrun cat <id>`)

## What it does

- **Output compression** — structured extraction for pytest, Vitest/Jest, tsc,
  Cargo, Go, and generic diagnostics
- **Verified command reuse** — replays safe deterministic commands when
  repository state is unchanged
- **Large-file guard** — summarizes lockfiles, binaries, and generated files
- **Fail-open** — optimization errors fall through to normal execution

## Measured results

### Deterministic fixture suite

Run locally: `npm run benchmark:suite`

| Fixture | Baseline | TidyRun | Change |
|---|---:|---:|---:|
| Quality parity | 3/3 | 3/3 | equal |
| Verbose JS test output | 64,939 B | 20,037 B | **−69%** |
| Python test output | 19,776 B | 922 B | **−95%** |
| Repeated typecheck time | 17,947 ms | 9,111 ms | **−49%** |

These are deterministic fixtures, not general coding-session guarantees.

### Initial real Codex experiment

10 tasks, Codex 0.147.0, gpt-5.4-mini, low reasoning, two small fixture repos.

| Metric | Baseline | TidyRun | Change |
|---|---:|---:|---:|
| Task success | 10/10 | 10/10 | equal |
| Agent-visible tool output | 61,401 B | 52,654 B | −14.2% |
| Tool calls | 75 | 75 | 0% |
| Input tokens | 1,072,013 | 1,204,738 | +12.4% |
| Output tokens | 9,885 | 12,650 | +28.0% |
| Wall time | 297 s | 414 s | +39% |

In our first 10-task Codex study, TidyRun reduced tool-output bytes by 14.2%
while maintaining 10/10 task success. Total model tokens and wall time
increased in that small study, so **TidyRun v0.1 does not claim general
model-token or latency savings.**

See [`benchmarks/final-launch-report.md`](benchmarks/final-launch-report.md)
and [`docs/BENCHMARKING.md`](docs/BENCHMARKING.md) for methodology.

## Install

```bash
npx tidyrun init
```

Requires Node.js 22 or newer.

## CLI

```bash
tidyrun init              # setup config + managed rules
tidyrun run -- <command>  # compress + cache
tidyrun stats [--last]    # session metrics
tidyrun doctor            # health check
tidyrun cat <artifact>    # recover full output
tidyrun clean --artifacts # remove local state
```

`TIDYRUN_BYPASS=1` disables all optimizations.

## Providers

| Provider | Status |
|---|---|
| Codex (OpenAI) | FULL — `tidyrun run --` wrapper |
| Gemini CLI | FULL — native JSON hook handler |
| Claude Code / Cursor | PARTIAL — managed rules + wrapper |
| Generic shell | FULL — `tidyrun run --` wrapper |

## Demo

Terminal recording: [`docs/tidyrun-demo.cast`](docs/tidyrun-demo.cast)

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Apache-2.0. See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md).
