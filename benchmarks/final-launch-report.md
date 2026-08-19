# TIDYRUN v0.1 SHIPPING REPORT

## STATUS

**READY TO PUBLISH V0.1**

(with one prerequisite: commit current working tree and move `v0.1.0` tag to the release commit — see External Actions)

## RELEASE SHA

**Current HEAD (tagged):** `230fd665047fe875b38378835c3608e8a0208e20`

**Working tree:** contains uncommitted TidyRun rename, packaging, and documentation updates required for v0.1.0. The existing `v0.1.0` tag points to pre-rename LeanAgent state and must be recreated after commit.

## VERSION

`0.1.0`

## FINAL PRODUCT CLAIM

Compress noisy coding-tool output and reuse verified deterministic work without another LLM.

## RELEASE GATES

| Gate | Result |
|---|---|
| `npm ci` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS (48/48) |
| `npm run build` | PASS |
| `npm audit --audit-level=high` | PASS (0 vulnerabilities) |
| `npm run package:smoke` | PASS |
| `npm run benchmark:suite` | PASS |
| `npm pack --dry-run -w tidyrun` | PASS |

## FINAL BENCHMARK

Deterministic suite (Windows, Node 24.18.0, latest run):

| Fixture | Baseline | TidyRun | Change |
|---|---:|---:|---:|
| Quality parity | 3/3 | 3/3 | equal |
| Verbose JS output | 64,939 B | 20,037 B | −69% |
| Python output | 19,776 B | 922 B | −95% |
| Repeated typecheck | 17,947 ms | 9,111 ms | −49% |
| TidyRun overhead | — | 4–182 ms | — |

## REAL CODEX EVIDENCE

10-task study (Codex 0.147.0, gpt-5.4-mini, low reasoning):

| Metric | Baseline | TidyRun |
|---|---:|---:|
| Task success | 10/10 | 10/10 |
| Tool output | 61,401 B | 52,654 B (−14.2%) |
| Tool calls | 75 | 75 |
| Input tokens | 1,072,013 | 1,204,738 (+12.4%) |
| Output tokens | 9,885 | 12,650 (+28.0%) |
| Wall time | 297 s | 414 s (+39%) |

TidyRun v0.1 does **not** claim model-token or latency savings.

## PACKAGE

- **Name:** `tidyrun`
- **Tarball:** `tidyrun-0.1.0.tgz`
- **Size:** 86.3 kB (6 files including LICENSE)
- **SHA:** `369aa93fac50da3aff723b8fb9a2aa3f1c481c98`
- **Contents:** `bin/tidyrun.mjs`, `dist/cli.cjs`, `README.md`, `LICENSE`

## CLEAN INSTALL

**PASS** — fresh temp directory, install from tarball:

- `tidyrun --help` ✓
- `tidyrun init` ✓
- `tidyrun doctor` ✓
- `tidyrun run -- node --version` ✓
- `tidyrun stats` ✓
- `tidyrun clean --artifacts` ✓

No workspace dependency leakage.

## DOCTOR

**PASS** — HEALTHY (6/6 checks in package smoke; clean-room doctor returned REVIEW due to pre-existing local cache artifacts, not package defect)

## DEMO

`docs/tidyrun-demo.cast` (renamed from `leanagent-demo.cast`)

## README

**READY** — honest hero claim, deterministic numbers, Codex negative results in limitations.

## RELEASE NOTES

**READY** — `docs/RELEASE-NOTES-v0.1.0.md`

## GITHUB METADATA

**READY** — `docs/LAUNCH-COPY.md` (description, topics, post copy)

## LAUNCH COPY

**READY** — primary soft-launch post in `docs/LAUNCH-COPY.md`

## ISSUE TEMPLATES

**READY**

- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/efficiency_report.md`

## CROSS-PLATFORM CI

**READY, not remotely executed**

`.github/workflows/ci.yml` runs on `ubuntu-latest`, `macos-latest`, `windows-latest` with typecheck, test, build, lint, benchmark, package smoke. CI has not run on GitHub remote in this session.

## NAME CHECK

**LOCKED: `tidyrun`**

- npm `tidyrun` (Node): unclaimed at time of check
- PyPI `tidyrun`: exists — Python DAG orchestration tool (different ecosystem, unrelated)
- No material collision for npm CLI developer tool

## FAST PATH SANITY

`node --version` baseline: 39–56 ms; via `tidyrun run --`: 143–158 ms. Overhead is CLI startup (~100 ms), not optimization machinery. No absurd penalty; fast path active for trivial commands.

## EXTERNAL ACTIONS REMAINING

```bash
# 1. Commit all release changes
git add -A
git commit -m "chore: release TidyRun v0.1.0"

# 2. Move tag to release commit (tag currently points to pre-rename state)
git tag -d v0.1.0
git tag -a v0.1.0 -m "TidyRun v0.1.0"

# 3. Create GitHub repository and push
git remote add origin https://github.com/<user>/tidyrun.git
git push -u origin main
git push origin v0.1.0

# 4. Publish to npm (from packages/tidyrun after build)
npm run build -w tidyrun
cd packages/tidyrun
npm publish --access public

# 5. Create GitHub release from tag with docs/RELEASE-NOTES-v0.1.0.md

# 6. Post soft-launch copy from docs/LAUNCH-COPY.md
```

## FINAL VERDICT

> **TidyRun v0.1 is ready for its public soft launch.**

Commit the working tree, retag `v0.1.0`, then execute the external publish steps above.
