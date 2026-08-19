# LeanAgent

**Stop paying your coding agent to do the same work twice.**

LeanAgent is a local-first optimization runtime for AI coding agents. It removes repeated reads, redundant safe commands, huge irrelevant output, and no-progress loops **without another AI model, API key, account, or telemetry service**.

```text
⚡ reused        unchanged file read
⚡ compressed    test output → relevant failures + LA:// artifact
⚡ cached        verified safe command
⚠ loop           same investigation ×3
```

## Install and use

```bash
npx leanagent init
leanagent run -- npm test
```

Then keep using Codex, Claude Code, Gemini CLI, Cursor, OpenCode, Aider, or another agent. Use native hooks where available, or wrap deterministic shell commands with `leanagent run --`.

LeanAgent classifies commands before doing repository work. Trivial pure commands
use a direct fast path; larger output and long-running deterministic commands use
the full optimizer. The thresholds are configurable under `performance` and are
reported as observed overhead in benchmark reports.

## Measured result

### Demo

Replay the real Windows terminal recording with [asciinema](https://asciinema.org/):
[docs/leanagent-demo.cast](docs/leanagent-demo.cast). It uses a real packaged
LeanAgent run and records the observed compression and verified repeat.

The checked-in high-output fixture (`benchmarks/output-reduction.json`) emits 64,939 bytes of mixed test noise and failures. On this Windows workspace run:

| Metric | Baseline | LeanAgent | Difference |
|---|---:|---:|---:|
| Exit status | 1 | 1 | parity |
| Raw command output | 64,939 B | 64,939 B | same work |
| Agent-visible output | 64,939 B | 20,050 B | **−69%** |

This is an observed deterministic wrapper result, not a claim about model-token billing or every agent. Re-run it with `npm run benchmark` (or `npm run benchmark:suite` for both checked-in fixtures); the generated JSON reports are the source of truth. The benchmark also records negative results: command execution time is not guaranteed to improve, and native provider interception is not assumed where the host does not expose it.

For this deliberately tiny high-output process, end-to-end wrapper time was
164 ms versus 98 ms baseline; the win is context reduction, not execution speed.

The checked-in deterministic suite now covers three shell fixtures (Node
diagnostics, repeated TypeScript typecheck, and Python diagnostics). In the
latest Windows run, the suite delivered **86,159 raw bytes → 22,455 agent-visible
bytes (−74%)** and **17,557 ms baseline end-to-end → 9,026 ms LeanAgent
end-to-end (−49%)**. All three fixtures had equal command exits and verification
parity (`3/3`). The Python fixture is intentionally small and reproducible; it
is not a claim about arbitrary Python repositories or model-token billing.

The repeated-work fixture alone ran the same typecheck twice: **17,351 ms
baseline end-to-end vs 8,804 ms LeanAgent (−49%)**, with one cache hit and 160 ms
observed LeanAgent overhead. These numbers are fixture measurements, not a
promise for short commands or every repository.

### Controlled real-agent study

We ran ten fresh TypeScript/Python tasks with Codex `0.147.0` using
`gpt-5.4-mini` (low reasoning), pinned task commits, identical prompts, and
independent acceptance commands. Both runs passed all ten tasks (`10/10` vs
`10/10`). Codex tool output was **57,199 B baseline → 31,235 B with LeanAgent
(−45.4%)** and tool calls were **67 → 59 (−11.9%)**. Aggregate wall time was
**277,393 ms → 386,890 ms**, a negative result: LeanAgent did not make these
short tasks faster. Provider input/output token telemetry is included in the
final report but is not treated as billing savings.

The full manifest and caveats are in
[`benchmarks/final-launch-report.md`](benchmarks/final-launch-report.md) and
[`benchmarks/final-launch-report.json`](benchmarks/final-launch-report.json).

## What is implemented

- duplicate file-read protection with content hashes and targeted ranges;
- large/generated/binary-file guard with recoverable local artifacts;
- command-specific output compression for pytest, Vitest/Jest, TypeScript, package managers, Cargo, Go, and diagnostics;
- content-addressed raw artifact storage (`show`, `cat`, `search`) with secret redaction;
- conservative session and persistent caching for successful safe commands with repository/environment fingerprints (failed commands are never replayed);
- dependency-aware work cache, repository index, import/symbol hints, affected-test selection;
- progress-aware loop and failed-approach warnings;
- event/rule/decision APIs, plugin SDK, MCP server, Gemini JSON hook handler, and generic wrapper;
- stats, doctor, benchmark, CI, sync, cache, and cross-platform CLI flows.

All savings are labelled observed, derived, or estimated. Original operations remain available with `force=true`, `--raw`, or `LEANAGENT_BYPASS=1`.

## Inspect and recover

```bash
leanagent stats --last
leanagent adapters --json
leanagent show LA://command/<id>
leanagent cat LA://command/<id>
leanagent search LA://command/<id> error
leanagent mcp
```

## Measure instead of marketing

```bash
npx leanagent benchmark benchmarks/self-check.json
```

Reports contain reproducible command exit status, wall time, raw output, exact agent-visible output, cache hits, and verification parity. LeanAgent does not invent provider billing or carbon numbers.

Read the [architecture](docs/ARCHITECTURE.md), [supported agents](docs/SUPPORTED-AGENTS.md), [security model](docs/SECURITY-MODEL.md), [testing coverage](docs/TESTING.md), and [benchmark methodology](docs/BENCHMARKING.md).
Draft launch copy is collected in [docs/LAUNCH-COPY.md](docs/LAUNCH-COPY.md); it is not an authorization to post externally.

## Limitations

- The real-agent evidence is a ten-task Codex study on two small fixture
  repositories, not a universal 20–40 task claim. Gemini CLI was installed but
  unauthenticated; OpenCode was installed but its tested provider paths did not
  produce a completed task.
- Provider token billing is reported only when an adapter supplies real usage
  metadata. Byte/4 context figures are estimates, never billing measurements.
- Native interception is deepest for the documented Gemini hook contract;
  other providers use MCP, managed rules, or the generic wrapper as documented
  in [SUPPORTED-AGENTS.md](docs/SUPPORTED-AGENTS.md).
- Cache reuse is conservative and fail-open. It can add local overhead for
  repository-dependent commands; benchmark reports expose that overhead instead
  of hiding it.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Apache-2.0. See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md).
