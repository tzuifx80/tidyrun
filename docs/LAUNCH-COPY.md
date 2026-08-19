# Launch copy (v0.1.1)

Repository: https://github.com/tzuifx80/tidyrun  
npm: `tidyrun@0.1.1`

## X post

Coding agents keep eating huge test logs and rerunning the same typecheck.

I shipped TidyRun — a local layer that compresses noisy tool output and safely reuses deterministic commands. No extra LLM. No API key.

Fixtures: −69% to −95% agent-visible diagnostic bytes. 10-task Codex study: 10/10 success, −14% tool output — but tokens and wall time went up, so I'm not claiming token savings.

`npx tidyrun@latest init`

Try it on a noisy repo and tell me what breaks: https://github.com/tzuifx80/tidyrun/issues/new/choose

## Reddit

**Title:** I built a local tool that compresses coding-agent terminal output without adding another LLM (early v0.1.1)

**Body:**

Coding agents waste a lot of context on verbose test/build output and rerun deterministic commands that haven't changed.

TidyRun is a local CLI that sits around that work:

- compresses noisy developer-tool output (pytest, vitest, tsc, cargo, etc.)
- safely reuses verified deterministic commands when state is unchanged
- keeps full raw output recoverable locally (`tidyrun cat <id>`)
- no API key, no extra LLM, telemetry off

**Measured (deterministic fixtures, not universal claims):**

- JS diagnostic output: ~69% fewer agent-visible bytes
- Python diagnostics: ~95%
- repeated typecheck: ~49% faster end-to-end with cache hit
- verification parity: 3/3

**Initial 10-task Codex comparison:**

- 10/10 task success both sides
- 14.2% lower agent-visible tool output
- 0 extra LLM calls
- total input/output tokens and wall time **increased** — so I'm explicitly not claiming token or latency savings yet

```bash
npx tidyrun@latest init
tidyrun run -- npm test
```

GitHub: https://github.com/tzuifx80/tidyrun

Early release — looking for real repos, bad compression, unsafe-looking reuse, and agent-specific issues. Issue templates: https://github.com/tzuifx80/tidyrun/issues/new/choose

## Show HN (draft — use after broader real-world signal)

**Title:** Show HN: TidyRun – local compression and verified reuse for coding-agent tool output (no extra LLM)

**Body:**

TidyRun compresses noisy terminal output and reuses safe deterministic commands for AI coding workflows — locally, without another model call.

Not another agent. An optimization layer: structured compression, conservative command reuse, large-file guards, recoverable artifacts.

Deterministic fixtures: 69–95% lower agent-visible diagnostic bytes; repeated typecheck ~49% faster with cache hit; 3/3 verification parity.

Small Codex study (10 tasks): 10/10 success, 14% lower tool-output bytes, but total tokens and wall time increased — limitations documented on the README.

```bash
npx tidyrun@latest init
```

https://github.com/tzuifx80/tidyrun

## GitHub repository metadata

- **Description:** Cut noisy coding-agent tool output and safely reuse deterministic work — locally, without another LLM.
- **Topics:** `ai`, `coding-agents`, `developer-tools`, `codex`, `claude-code`, `gemini-cli`, `cli`, `typescript`, `optimization`, `local-first`
