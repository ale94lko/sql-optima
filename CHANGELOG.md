# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Relicense from Source-Available (AI restriction) to **MIT** for OpenSSF Best Practices FLOSS criteria.

### Added

- OpenSSF Best Practices badge ([project 14693](https://www.bestpractices.dev/projects/14693)).
- Governance, architecture, roadmap, assurance case, and achievements docs for Silver-level Best Practices.
- CONTRIBUTING: DCO sign-off, coding standards, mandatory tests for major features.
- SECURITY: advisory preferred path, response SLA, reporter credit policy.

## [1.0.0] - 2026-09-17

### Added

- Initial Marketplace-ready GitHub Action for SQL static/dynamic analysis.
- Engines: PostgreSQL, MySQL/MariaDB, SQLite, SQL Server; static BigQuery/Snowflake linting.
- Inputs: `sql_content`, `sql_file`, severity gate (`fail_on_severity` / `fail_on_types`).
- CI: Vitest, ESLint, actionlint, CodeQL, OpenSSF Scorecard, multi-engine integration jobs.
- Security docs: `SECURITY.md`, least-privilege workflow defaults.

[Unreleased]: https://github.com/ale94lko/sql-optima/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ale94lko/sql-optima/releases/tag/v1.0.0
