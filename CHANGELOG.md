# Changelog

## v0.1.15 - 2026-03-29

### Fixed

- copied the bundled vector operator skill into `dist/skills/` during release preparation so npm installs and manual release bundles expose the same operator guidance
- added release-packaging regression coverage for the bundled SKILL payload so vector packaging changes cannot accidentally ship without the operator skill

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
