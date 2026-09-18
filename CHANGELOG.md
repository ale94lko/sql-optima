# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Example fixture `examples/leading_wildcard_like.sql` and `.env.example` from community PRs ([#54](https://github.com/ale94lko/sql-optima/pull/54), [#56](https://github.com/ale94lko/sql-optima/pull/56)).
- `.github/CODEOWNERS` for two-person review.
- README Usage Examples snippet for `fail_on_severity: high`, linked to Inputs ([#41](https://github.com/ale94lko/sql-optima/issues/41)).

### Changed

- Vitest coverage gates raised to statements/lines/functions ≥90% and branches ≥80% (OpenSSF Gold).
- Governance lists a second maintainer and documents non-author review.
- OpenSSF Best Practices badge raised to **Gold** ([project 14693](https://www.bestpractices.dev/projects/14693)).
- Live engines require explicit `db_password`; source no longer embeds default credentials ([#44](https://github.com/ale94lko/sql-optima/issues/44)).

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

[Unreleased]: https://github.com/ale94lko/sql-optima/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ale94lko/sql-optima/releases/tag/v1.0.0
