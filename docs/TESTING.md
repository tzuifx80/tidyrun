# Testing and failure coverage

The core suite is intentionally failure-oriented rather than count-oriented.
It covers:

- cache restart, changed source/configuration/environment/cwd, missing/tampered
  artifacts, failed-command non-reuse, concurrent metadata writers, clear/prune,
  and malformed state;
- exact/ranged/large duplicate reads, UTF-8/ANSI output, structured diagnostic
  windows for pytest/Vitest/Jest/tsc/package managers/Cargo/Go/linters, and
  bounded compression;
- traversal, NUL, outside-path, symlink escape, secret redaction, conservative
  side-effect classification, event-observer isolation, and provider usage
  normalization;
- transitive/barrel/dynamic import impact selection, broad configuration
  changes, productive-vs-true loop traces, and public content-addressed
  repository snapshots.

Run the deterministic ladder:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run lint
npm audit --audit-level=high
npm run benchmark:suite
```

The GitHub workflow runs the same checks on Windows, Linux, and macOS. A local
run only proves the current host; it does not substitute for CI evidence on the
other operating systems.
