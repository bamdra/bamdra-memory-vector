# bamdra-memory-vector

![Bamdra Animated Logo](./docs/assets/bamdra-logo-animated.svg)

The local knowledge and semantic recall layer for the Bamdra suite.

It can run independently, and it becomes most powerful when paired with `bamdra-openclaw-memory`.

Install directly:

```bash
openclaw plugins install @bamdra/bamdra-memory-vector
```

Release package:

- GitHub Releases: https://github.com/bamdra/bamdra-memory-vector/releases
- You can also build a local release bundle with `pnpm package:release`

[中文文档](./README.zh-CN.md)

## What it does

`bamdra-memory-vector` turns local Markdown into a maintainable knowledge base.

It indexes:

- `knowledge/`
- `docs/`
- `notes/`
- `ideas/`

`ideas/` is a generic example name. If your vault uses a different folder such as `06_Interest/`, point the Markdown root at that structure or keep both names as valid knowledge buckets.

and helps OpenClaw search that local knowledge before falling back to the web.

## Why it matters

The weakest part of many memory systems is the knowledge layer:

- knowledge becomes opaque
- humans stop editing it
- web search gets used too often
- latency and token cost go up

This plugin closes that gap by keeping the knowledge base local, readable, and editable.

## Best-practice layout

```text
private/
  knowledge/
  docs/
  notes/
  ideas/
  06_Interest/

shared/
  knowledge/
  docs/
  notes/
  ideas/
  06_Interest/
```

## Best-practice storage

Keep the index local, but point Markdown roots at a synced editor-friendly folder.

```json
{
  "enabled": true,
  "privateMarkdownRoot": "~/Documents/Obsidian/MyVault/openclaw/private",
  "sharedMarkdownRoot": "~/Documents/Obsidian/MyVault/openclaw/shared",
  "indexPath": "~/.openclaw/memory/vector/index.json"
}
```

That works especially well with:

- Obsidian
- iCloud Drive
- Git-synced repositories
- Syncthing workspaces

## Architecture

![Bamdra Suite Architecture](./docs/assets/architecture-technical-en.svg)

## What it unlocks

With `bamdra-openclaw-memory`:

- old work can be found through fuzzy recall
- local docs can enter the answer path without prompt bloat

With `bamdra-user-bind`:

- private knowledge stays aligned with the correct user boundary

## Repository

- [GitHub organization](https://github.com/bamdra)
- [Repository](https://github.com/bamdra/bamdra-memory-vector)
- [Releases](https://github.com/bamdra/bamdra-memory-vector/releases)
