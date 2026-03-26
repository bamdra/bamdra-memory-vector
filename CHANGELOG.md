# Changelog

## v0.1.14 - 2026-03-27

### Added

- explicit compatibility guidance for OpenClaw `v2026.3.23` and the recommended npm-first install path when used on its own or as part of the Bamdra suite

### Fixed

- standalone bootstrap now backfills `plugins.installs` metadata so OpenClaw `v2026.3.23` no longer treats npm installs as partially registered
- runtime path handling now resolves `~/.openclaw/...` against the active user home instead of trying to create literal tilde-prefixed directories

### Notes

- tested against OpenClaw `v2026.3.23`

## v0.1.13 - 2026-03-24

### Added

- explicit compatibility guidance for OpenClaw `v2026.3.23` and the recommended npm-first install path when used on its own or as part of the Bamdra suite

### Fixed

- standalone bootstrap now backfills `plugins.installs` metadata so OpenClaw `v2026.3.23` no longer treats npm installs as partially registered
- runtime path handling now resolves `~/.openclaw/...` against the active user home instead of trying to create literal tilde-prefixed directories

### Notes

- tested against OpenClaw `v2026.3.23`
