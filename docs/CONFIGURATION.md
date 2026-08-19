# Configuration

`leanagent init` writes `leanagent.yaml` with the balanced preset. A user-level file may be placed at `~/.leanagent/config/leanagent.yaml`; repository values override it. Telemetry is always forced off in the core configuration.

```yaml
version: 1
preset: balanced
context:
  duplicate_reads: reuse
  max_file_bytes: 150000
  max_tool_output_chars: 20000
commands:
  repeated_execution: reuse
  max_identical_failures: 2
loops:
  enabled: true
  minimum_cycles: 3
cache:
  enabled: true
  conservative: true
performance:
  fast_path: true
  min_output_bytes: 2048
  min_command_duration_ms: 25
  min_cache_duration_ms: 100
security:
  allow_outside_repository: false
  follow_symlinks: false
  redact_secrets: true
```

`performance` is the adaptive cost model. Pure commands such as `node --version` take the direct fast path; structured compression starts only once output is large enough, and successful results are persisted for reuse only when the observed command is long enough to repay local storage overhead. Set `fast_path: false` to disable these bypasses while retaining the normal rules.

Disable a rule with `leanagent rules disable <rule-id>`. Use `LEANAGENT_BYPASS=1` for a session-wide bypass, and `leanagent clean --artifacts` to remove local result storage. Rules never delete original data; output is recoverable from `LA://` artifact IDs.
