# Release checklist

1. Update versions consistently in the three published packages (`@leanagent/core`, `@leanagent/cli`, `@leanagent/plugin-sdk`) and the `leanagent` wrapper.
2. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --audit-level=high` on Windows, macOS, and Linux CI.
3. Run `npm pack --dry-run -w leanagent` and inspect that the standalone CLI bundle contains only `bin/` and `dist/`; the wrapper must not rely on workspace-only `@leanagent/*` packages after installation.
4. Run `npm run package:smoke` to install the actual tarball in a fresh temp project and exercise `--help`, `init`, `doctor`, and `clean`.
5. Run a benchmark fixture and publish the report methodology, not unsupported savings claims.
6. Generate a changelog entry and release notes with provider capability limitations.
7. Publish only from a protected CI environment with npm provenance/signing configured by maintainers; no credentials belong in this repository.
