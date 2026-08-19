# LeanAgent architecture

LeanAgent is a local event runtime. Agent-specific inputs are normalized into events, rules return conservative decisions, and the caller remains responsible for executing the original operation when a decision is unavailable.

```text
agent hook / shell wrapper / MCP
             │
             ▼
      normalized event
             │
      ┌──────┴──────┐
      │  LeanAgent  │
      │ rules       │
      │ repository  │
      │ caches      │
      │ metrics     │
      └──────┬──────┘
             │
       decision + evidence
             │
       original operation
```

## Safety invariants

- A rule failure is recorded as `rule.error` and never blocks the underlying operation.
- Destructive, stateful, and unknown commands are never automatically reused.
- Repository and environment fingerprints are part of command-cache identity.
- Engine sessions use bounded file metadata on the fast path, avoiding a full
  read on every command while still invalidating ordinary edits conservatively.
  The public `snapshotRepository` API remains content-addressed by default.
- Only successful commands classified as safe are reusable; failures are stored
  for diagnosis but deliberately execute again after a retry.
- Raw compressed output is stored locally before a shortened representation is returned.
- Artifact IDs are content-addressed and artifact paths are validated before reads.
- `LEANAGENT_BYPASS=1` and `force=true` restore the original path.

## Storage

`~/.leanagent/artifacts` contains content-addressed raw artifacts and metadata. `~/.leanagent/cache` contains command and dependency-aware work-cache metadata. Files are written atomically with owner-only permissions where the platform supports them. No remote database or telemetry endpoint is used.

Session metrics include observed optimizer overhead (repository snapshots,
compression, artifact writes, and rule evaluation) so a savings claim can be
checked against LeanAgent's own cost.

## Extension boundaries

`@leanagent/plugin-sdk` exposes rules, filters, and adapters without requiring contributors to understand the CLI. Provider integrations declare capabilities instead of implying unsupported interception.
