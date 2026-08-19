# TidyRun v0.1.1

## What it does

- Structured developer-tool output compression
- Safe verified deterministic command reuse
- Adaptive fast path for trivial commands
- Recoverable raw artifacts (`tidyrun cat <id>`)
- Local-first operation — no extra LLM, no API key

## Current measurements

### Deterministic fixtures (Windows, Node 24)

| Fixture | Result |
|---|---|
| Quality parity | 3/3 |
| Verbose JS output | 64,939 B → 20,037 B (−69%) |
| Python output | 19,776 B → 922 B (−95%) |
| Repeated typecheck | 17,947 ms → 9,111 ms (−49%) |

### Initial Codex study (10 tasks)

| Metric | Baseline | TidyRun |
|---|---:|---:|
| Task success | 10/10 | 10/10 |
| Tool output | 61,401 B | 52,654 B (−14.2%) |
| Input tokens | 1,072,013 | 1,204,738 (+12.4%) |
| Output tokens | 9,885 | 12,650 (+28.0%) |
| Wall time | 297 s | 414 s (+39%) |

TidyRun v0.1 does **not** claim general model-token or latency savings.

## Installation

```bash
npx tidyrun init
tidyrun run -- npm test
```

Requires Node.js 22+.

## Supported integrations

- Codex — `tidyrun run --` wrapper (FULL)
- Gemini CLI — native hook handler (FULL)
- Claude Code / Cursor — managed rules + wrapper (PARTIAL)
- Generic shell — `tidyrun run --` (FULL)

## Limitations

- Real-agent evidence is one small Codex study; results may not generalize.
- A Python DAG package named `tidyrun` exists on PyPI — different ecosystem, unrelated.
- Cache reuse is conservative; local overhead is possible on repository-dependent commands.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md).

