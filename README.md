# bamdra-memory-vector

`bamdra-memory-vector` is the optional semantic retrieval plugin for the Bamdra OpenClaw memory suite.

It adds lightweight vector-style recall on top of `bamdra-openclaw-memory` without turning the whole stack into a heavy external vector-database deployment.

## What It Does

- writes Markdown-readable memory artifacts to local storage
- builds a lightweight local semantic index
- supports scoped retrieval for the current user
- returns top-k semantic matches for recall-heavy prompts
- keeps private user memory and shared knowledge separated

## Open Source Contents

This repository already includes the real source code for the current open-source version.

- source entrypoint:
  [src/index.ts](/Users/wood/workspace/macmini-openclaw/openclaw-enhanced/bamdra-memory-vector/src/index.ts)
- plugin manifest:
  [openclaw.plugin.json](/Users/wood/workspace/macmini-openclaw/openclaw-enhanced/bamdra-memory-vector/openclaw.plugin.json)
- package metadata:
  [package.json](/Users/wood/workspace/macmini-openclaw/openclaw-enhanced/bamdra-memory-vector/package.json)

The repository currently looks small because the first public version is intentionally a compact, single-entry plugin.

## Current Runtime Model

- Markdown root:
  `~/.openclaw/memory/vector/markdown/`
- local index:
  `~/.openclaw/memory/vector/index.json`

This first version exposes a lightweight local vector-style index interface and keeps the integration surface ready for later LanceDB-backed evolution.

## Product Positioning

`bamdra-memory-vector` is not meant to replace `bamdra-openclaw-memory`.

- `bamdra-openclaw-memory` is continuity-first
- `bamdra-memory-vector` is recall enhancement

Together they provide:

- durable continuity across long sessions
- Markdown-readable memory artifacts
- lightweight semantic recall without extra infrastructure

## Build

```bash
pnpm run bundle
```
