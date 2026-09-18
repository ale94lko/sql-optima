# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
