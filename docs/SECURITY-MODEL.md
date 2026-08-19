# Security and privacy model

tidyrun runs beside repositories that may contain credentials and proprietary code. The default posture is local-only and conservative.

## Implemented safeguards

- No telemetry, account, cloud service, or external model is required.
- Repository paths are normalized; traversal is rejected; symlinks are not followed by default.
- Shell wrappers use structured `spawn` arguments with `shell: false`.
- Artifact IDs are validated and artifact paths must remain inside the artifact root.
- Raw output is redacted for common API-key, bearer-token, password, and token patterns before storage/return.
- Artifact/cache writes are atomic and owner-readable on POSIX-like systems.
- Artifact metadata and content hashes are validated on recovery; corrupt or
  missing artifacts become misses rather than trusted results. Independent
  writers merge local indexes before atomic replacement.
- Destructive/stateful/unknown commands are excluded from automatic reuse.
- Cache identity includes repository and relevant environment fingerprints.
- Plugin registration rejects duplicate IDs; plugins run in-process and are trusted code.

## Threats and residual risks

Plugins have the same privileges as the host process. Install only trusted packages. A malicious command can still damage a repository when the user explicitly executes it; TidyRun does not claim to be a sandbox. Secret redaction is heuristic and should not be treated as a DLP boundary. Windows ACL semantics may differ from POSIX mode bits. Compression bounds the delivered view and strips terminal control sequences; the redacted raw artifact remains the recovery source. `TIDYRUN_TIMEOUT_MS` bounds wrapper execution, but process-tree cleanup is host/OS dependent.

## Recovery

Use `TIDYRUN_BYPASS=1`, `tidyrun run --raw -- <command>`, or `force=true` for a one-operation bypass. `tidyrun cat <artifact>` retrieves stored raw output. `tidyrun clean --artifacts` removes local artifacts.
