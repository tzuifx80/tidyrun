# Reproducible terminal demo

The checked-in [asciicast recording](tidyrun-demo.cast) is a real packaged
run on Windows. It observed 13,140 raw bytes → 427 delivered bytes (96.8%
derived reduction) and one verified cache hit on the repeated command. Replay
it with:

```bash
asciinema play docs/tidyrun-demo.cast
```

Run this in a repository with a test command:

```bash
npx tidyrun@latest init
npm run benchmark
tidyrun run -- npm test
tidyrun run -- npm test
tidyrun stats --last
```

The reproducible benchmark first shows a large failing test log compressed from
raw output to the diagnostic view while preserving exit status. On the second
successful deterministic command, TidyRun can reuse a verified result when
the repository, environment, command, and configuration fingerprints are
unchanged. Failed commands are intentionally *not* cached; they remain
recoverable artifacts so an agent can rerun after changing its hypothesis.
Large output is shortened with a `TR://command/<id>` recovery handle. The exact
bytes, exit status, overhead, and cache decision are visible in `stats --last`
and `show`.

Do not turn this into a marketing percentage without running the same task against a baseline and publishing the report.
