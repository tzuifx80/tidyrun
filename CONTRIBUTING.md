# Contributing

## Setup

Requirements: Node.js 22 or newer.

```bash
npm install
npm run typecheck
npm test
npm run build
```

The repository uses npm workspaces. Core code lives in `packages/core`, the CLI in `packages/cli`, and the public extension surface in `packages/plugin-sdk`.

## Adding an output filter

Add a focused parser in `packages/core/src/compress.ts`, add representative output fixtures/tests, and ensure the fallback still returns the original result through an artifact. Do not hide failures or claim exact token savings without provider metadata.

## Pull requests

Include the command(s) used for verification and document provider capability assumptions. Keep changes local-first, cross-platform, and backwards-compatible where possible.
