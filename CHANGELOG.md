# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Input `job_summary` (`full` | `compact` | `none`) so consumers can avoid a duplicated Job Summary while still getting `sql-optima-report.md` and outputs ([#88](https://github.com/ale94lko/sql-optima/issues/88)).
- Default-path CI `integration` job against live Postgres, MySQL, and SQL Server; fails if mixed fixtures produce `issue_count=0` ([#69](https://github.com/ale94lko/sql-optima/issues/69)).

### Fixed

- SQLite dynamic analysis under the Action bundle: load `sql-wasm.js` beside `dist/` instead of inlining `sql.js` via ncc (avoids `Cannot set properties of undefined (setting 'exports')` on Node 24).
- CI: bump `actions/upload-artifact` to v6 (Node.js 24 runtime) to clear the Node 20 deprecation warning.
- Suppress false-positive `UNINDEXED_FOREIGN_KEY` for MySQL/MariaDB InnoDB (engine auto-creates FK indexes) and when an explicit same-table index already covers the FK columns ([#100](https://github.com/ale94lko/sql-optima/issues/100)).

## [1.1.3] - 2026-09-19

### Added

- `SYNTAX_ERROR` findings include `line` / `column` / `location`, optional `source` (`sql_file`), and a ±2-line SQL context `snippet` in the Markdown report ([#87](https://github.com/ale94lko/sql-optima/issues/87)).

## [1.1.2] - 2026-09-19

### Fixed

- Keep Job Summary under GitHub’s 1024 KiB limit by truncating large SQL/EXPLAIN embeds; write the full report to `sql-optima-report.md` and expose `report_path` ([#84](https://github.com/ale94lko/sql-optima/issues/84)).

## [1.1.1] - 2026-09-19

### Security

- Constrain `sql_file` to `GITHUB_WORKSPACE` / cwd to prevent path traversal (CWE-22) ([#82](https://github.com/ale94lko/sql-optima/issues/82)).

## [1.1.0] - 2026-09-19

### Added

- Structured JSON logger (`src/logger.js`) for Action/analyzer hot paths; redacts credentials ([#49](https://github.com/ale94lko/sql-optima/issues/49), [#65](https://github.com/ale94lko/sql-optima/pull/65)).
- Optional `docker-compose.yml` for local Postgres 16 dynamic analysis (env from `.env.example`) ([#51](https://github.com/ale94lko/sql-optima/issues/51), [#63](https://github.com/ale94lko/sql-optima/pull/63)).
- Example fixture `examples/leading_wildcard_like.sql` and `.env.example` ([#54](https://github.com/ale94lko/sql-optima/pull/54), [#56](https://github.com/ale94lko/sql-optima/pull/56)).
- `.github/CODEOWNERS` for two-person review.
- README logo/banner and Usage Examples snippet for `fail_on_severity: high` ([#41](https://github.com/ale94lko/sql-optima/issues/41), [#67](https://github.com/ale94lko/sql-optima/pull/67), [#68](https://github.com/ale94lko/sql-optima/pull/68)).
- Validate `engine` and `db_port` before analysis ([#47](https://github.com/ale94lko/sql-optima/issues/47), [#61](https://github.com/ale94lko/sql-optima/pull/61)).
- CI: `npm audit --audit-level=high`, Vitest coverage gates in the unit job, and JSDoc `typecheck` (`tsc --noEmit` / `checkJs`) ([#45](https://github.com/ale94lko/sql-optima/issues/45), [#48](https://github.com/ale94lko/sql-optima/issues/48), [#71](https://github.com/ale94lko/sql-optima/issues/71)).
- Workflow `issue-in-progress.yml`: when a PR/branch links an issue, label `status: In Progress` and assign the author ([#77](https://github.com/ale94lko/sql-optima/pull/77)).
- Workflow `validate-pr-metadata.yml` via [`pr-metadata-validator`](https://github.com/ale94lko/pr-metadata-validator): enforce `{type}/{issue}-slug` branches and Conventional Commit PR titles ([#78](https://github.com/ale94lko/sql-optima/issues/78), [#79](https://github.com/ale94lko/sql-optima/pull/79)).

### Changed

- Vitest coverage gates raised to statements/lines/functions ≥90% and branches ≥80% (OpenSSF Gold).
- Governance lists a second maintainer and documents non-author review.
- OpenSSF Best Practices badge raised to **Gold** ([project 14693](https://www.bestpractices.dev/projects/14693)).
- Live engines require explicit `db_password`; source no longer embeds default credentials ([#44](https://github.com/ale94lko/sql-optima/issues/44), [#60](https://github.com/ale94lko/sql-optima/pull/60)).
- CONTRIBUTING documents branch naming and PR metadata rules used by CI.

## [1.0.0] - 2026-09-18

### Added

- Initial Marketplace-ready GitHub Action for SQL static/dynamic analysis.
- Engines: PostgreSQL, MySQL/MariaDB, SQLite, SQL Server; static BigQuery/Snowflake linting.
- Inputs: `sql_content`, `sql_file`, severity gate (`fail_on_severity` / `fail_on_types`).
- CI: Vitest, ESLint, actionlint, CodeQL, OpenSSF Scorecard, multi-engine integration jobs.
- Security docs: `SECURITY.md`, least-privilege workflow defaults.
- OpenSSF Best Practices badge ([project 14693](https://www.bestpractices.dev/projects/14693)) — Silver.
- Governance, architecture, roadmap, assurance case, achievements, code review, and security review docs.
- CONTRIBUTING: DCO sign-off, coding standards, mandatory tests for major features.
- Per-file SPDX/copyright headers (`MIT`).

### Changed

- Relicense to **MIT**.

[Unreleased]: https://github.com/ale94lko/sql-optima/compare/v1.1.3...HEAD
[1.1.3]: https://github.com/ale94lko/sql-optima/releases/tag/v1.1.3
[1.1.2]: https://github.com/ale94lko/sql-optima/releases/tag/v1.1.2
[1.1.1]: https://github.com/ale94lko/sql-optima/releases/tag/v1.1.1
[1.1.0]: https://github.com/ale94lko/sql-optima/releases/tag/v1.1.0
[1.0.0]: https://github.com/ale94lko/sql-optima/releases/tag/v1.0.0
