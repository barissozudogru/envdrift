# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.1] - 2026-08-26

### Fixed

- The GitHub Action now installs and invokes the pinned CLI binary explicitly.

### Added

- Command help now links directly to the source repository.

## [0.5.0] - 2026-08-26

### Added

- Reusable GitHub Action that checks environment files and writes a redacted report to the workflow summary.
- Continuous integration, Petri Labs discovery metadata, download badges, and a repository social preview.

### Changed

- The package homepage now points to the focused Petri Labs tool page while source and issues remain on GitHub.

## [0.4.0] - 2026-08-19

### Changed
- Values in drift reports are described by length, character class and a stable fingerprint instead of being printed. `--show-values` restores the previous output for local debugging.

### Added
- Test suite.

## [0.3.0] - 2026-03-12

### Changed

- Removed source maps from published `dist/` to reduce package size
- Updated README to document all CLI flags with accurate descriptions

### Fixed

- `tsconfig.json` no longer emits declaration maps in the published build

---

## [0.2.0] - 2026-03-12

### Added

- `--json` flag: outputs the full drift report as structured JSON, suitable for CI pipelines and downstream tooling
- `--ignore` / `-i` flag: accepts a comma-separated list of keys (repeatable) to exclude from all checks
- TTY-aware ANSI color output: colors are only applied when stdout is a terminal, so piped output is always clean text
- Multiline double-quoted value support in the env parser
- `export KEY=value` prefix support in the env parser
- Inline comment stripping for unquoted values

### Fixed

- Env parser now correctly handles empty values, single-quoted values, and values containing `=` characters
- Version flag now reads from `package.json` at runtime rather than being hardcoded
- `package-lock.json` added to track exact dependency versions

---

## [0.1.0] - 2026-03-12

### Added

- Initial release of the `envdrift` CLI
- Auto-detection of `.env*` files in the current directory (excludes `.backup` and `.bak` suffixes)
- Explicit file comparison: `envdrift .env .env.staging .env.production`
- Missing key detection: reports keys present in some files but absent in others
- Type mismatch detection: infers `boolean`, `number`, `url`, `path`, and `string` types and flags inconsistencies
- Value anomaly detection: identifies placeholder values, empty-vs-set mismatches, and protocol mismatches (http vs https)
- Human-readable terminal output with color-coded sections and a summary line
- Exit code `0` for clean, `1` for drift detected or error
- GitHub Actions workflow for automated npm publish on release
- Programmatic API: `parseEnvFile`, `inferType`, `compareEnvFiles` exported from the package entry point
- TypeScript type definitions included in the published package
- Zero runtime dependencies
