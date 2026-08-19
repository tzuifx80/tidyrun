<!-- leanagent:start -->

## LeanAgent efficiency rules

- Avoid rereading unchanged files; LeanAgent returns a content-hash notice.
- Prefer targeted searches over repository-wide dumps.
- Do not repeat identical failed commands; fetch stored LA:// artifacts instead.
- Use incremental verification while iterating and complete final verification at task completion.
- Retrieve full LeanAgent artifacts only when necessary: leanagent cat <id>.
- Wrap commands with leanagent run -- <cmd> when native hooks are unavailable.
- Extra LLM calls required by LeanAgent: 0.

<!-- leanagent:end -->
