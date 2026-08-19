<!-- tidyrun:start -->

## TidyRun efficiency rules

- Avoid rereading unchanged files; TidyRun returns a content-hash notice.
- Prefer targeted searches over repository-wide dumps.
- Do not repeat identical failed commands; fetch stored TR:// artifacts instead.
- Use incremental verification while iterating and complete final verification at task completion.
- Retrieve full TidyRun artifacts only when necessary: tidyrun cat <id>.
- Wrap commands with tidyrun run -- <cmd> when native hooks are unavailable.
- Extra LLM calls required by TidyRun: 0.

<!-- tidyrun:end -->
