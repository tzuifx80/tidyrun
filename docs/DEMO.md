# Reproducible terminal demo

Run this in a repository with a test command:

```bash
npx leanagent init
npm run benchmark
npx leanagent run -- npm test
npx leanagent run -- npm test
npx leanagent stats --last
```

The reproducible benchmark first shows a large failing test log compressed from
raw output to the diagnostic view while preserving exit status. On the second
successful deterministic command, LeanAgent can reuse a verified result when
the repository, environment, command, and configuration fingerprints are
unchanged. Failed commands are intentionally *not* cached; they remain
recoverable artifacts so an agent can rerun after changing its hypothesis.
Large output is shortened with a `LA://command/<id>` recovery handle. The exact
bytes, exit status, overhead, and cache decision are visible in `stats --last`
and `show`.

Do not turn this into a marketing percentage without running the same task against a baseline and publishing the report.
