# Launch copy (v0.1 soft launch)

## Primary post (GitHub / Reddit / X)

> I built TidyRun because coding agents keep consuming huge test/typecheck outputs and rerunning deterministic commands.
>
> TidyRun runs locally and doesn't use another LLM. It compresses noisy developer-tool output and safely reuses command results when relevant state hasn't changed.
>
> In deterministic benchmark fixtures it reduced agent-visible diagnostic output by 69–95%, and repeated typecheck time by about 49%.
>
> In an initial 10-task Codex study it maintained 10/10 task success and reduced tool-output bytes 14%, although total model token usage increased — so I'm explicitly not claiming token savings yet.
>
> v0.1 is an early public release. I'm looking for real-world sessions, edge cases, and benchmark data.

## Show HN (prepare for later — not primary v0.1 launch)

> Show HN: TidyRun – local compression and verified reuse for coding-agent tool output (no extra LLM)

Body: same as primary post, plus link to deterministic benchmark methodology and limitations section.

## GitHub repository metadata

- **Name:** `tidyrun`
- **Description:** Cut noisy coding-agent tool output and safely reuse deterministic work — locally, without another LLM.
- **Topics:** `ai`, `coding-agents`, `developer-tools`, `codex`, `claude-code`, `gemini-cli`, `cli`, `typescript`, `optimization`
