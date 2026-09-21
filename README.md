# <img src="assets/logo.jpg" alt="SQL Optima logo" height="48"> SQL Optima


[![Health Score](https://raw.githubusercontent.com/ale94lko/sql-optima/output/badge.svg)](https://github.com/ale94lko/sql-optima/community)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/14693/badge)](https://www.bestpractices.dev/projects/14693)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-SQL%20Optima%20Action-blue?style=flat-square&logo=github)](https://github.com/marketplace/actions/sql-optima-action)
[![Latest release](https://img.shields.io/github/v/release/ale94lko/sql-optima?style=flat-square&label=release)](https://github.com/ale94lko/sql-optima/releases/latest)
[![CI](https://github.com/ale94lko/sql-optima/actions/workflows/ci.yml/badge.svg)](https://github.com/ale94lko/sql-optima/actions/workflows/ci.yml)
[![Node.js CI](https://img.shields.io/badge/node.js-24.x-green?style=flat-square&logo=node.js)](https://nodejs.org/)

<p align="center">
  <img src="assets/banner.jpg" alt="SQL Optima - Automated SQL Performance and Anti-Pattern Analyzer for CI/CD">
</p>

An automated **SQL performance analyzer, schema linter, and query execution optimizer** built for GitHub Actions.

`sql-optima` parses raw SQL code or schema files, identifies structural anti-patterns (e.g., missing primary keys or unindexed foreign keys), connects to ephemeral database containers (PostgreSQL / MySQL / MariaDB / SQL Server) or an in-memory SQLite engine, and evaluates query execution plans (`EXPLAIN` / `SHOWPLAN`) to flag sequential scans, disk sorts, and full table scans. BigQuery and Snowflake are supported for **static dialect linting** only.

### Quick start

```yaml
- uses: actions/checkout@v4
- uses: ale94lko/sql-optima@v1
  with:
    engine: postgres
    sql_file: examples/mixed_postgres.sql
    db_host: localhost
    db_port: '5432'
    db_name: test_db
    db_user: postgres
    db_password: root
```

More engines, inputs, and samples: see [Usage Examples](#usage-examples) below. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md). Achievements: [docs/ACHIEVEMENTS.md](docs/ACHIEVEMENTS.md).

---

## Key Features

- **Multi-Engine Support:** Works with **PostgreSQL** (including CockroachDB / Aurora PostgreSQL wire-compatible aliases), **MySQL / MariaDB / Aurora MySQL**, **SQLite** (in-memory), and **SQL Server** (`mssql`). **BigQuery** and **Snowflake** run static AST linting only.
- **Static AST Analysis:** Inspects SQL syntax without needing a live database to detect missing primary keys, unindexed foreign key candidates, `SELECT *` usages, and leading wildcard `LIKE` queries.
- **Dynamic Execution Analysis:** Runs engine-specific explain plans (`EXPLAIN` / `EXPLAIN QUERY PLAN` / `SHOWPLAN_ALL`) against live or in-memory databases. Schema statements (`CREATE` / `INSERT` / …) in `sql_content` are applied before EXPLAIN for Postgres, MySQL/MariaDB, SQLite, and SQL Server.
- **Dual Triggering:** Supports execution via standard workflow inputs or directly through external API calls (`repository_dispatch`).
- **GitHub Step Summaries:** Publishes markdown reports to `$GITHUB_STEP_SUMMARY` (controllable via [`job_summary`](#input-job-summary): `full` / `compact` / `none`) and Action outputs (`report`, `report_path`, `issue_count`, `highest_severity`). Inline PR review comments are intentionally not posted (keeps default token permissions lean); consume outputs or the Step Summary in your workflow instead.

---

## Versioning (Marketplace)

Latest release: **[see GitHub Releases](https://github.com/ale94lko/sql-optima/releases/latest)** (always current) — notes in [CHANGELOG.md](CHANGELOG.md).

Consumers should pin a floating major tag for convenience:

```yaml
uses: ale94lko/sql-optima@v1
```

Release process:

1. Push a semver tag such as `v1.2.3` (triggers [`.github/workflows/release.yml`](.github/workflows/release.yml)).
2. The release workflow rebuilds `dist/`, creates the GitHub Release, and **force-updates** the major floating tag (`v1` → that release).
3. Breaking changes bump the major (`v2.0.0`) and introduce a new floating tag (`v2`).

Prefer SHA-pinning in high-assurance workflows; use `@v1` for Marketplace-style examples.

---

## Inputs

| Input | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `engine` | Database engine (`postgres`, `mysql`, `mariadb`, `sqlite`, `mssql`, `bigquery`, `snowflake`, `cockroachdb`, `aurora-postgres`, `aurora-mysql`, …) | `false` | `postgres` |
| `sql_file` | Path to a `.sql` file in the workspace to analyze (takes precedence over `sql_content`) | `false` | `""` |
| `sql_content` | SQL query or schema definition script to analyze | `false` | `""` |
| `db_host` | Database hostname (ignored for `sqlite` / static-only engines) | `false` | `localhost` |
| `db_port` | Database connection port (`5432` / `3306` / `1433`; ignored for `sqlite` / static-only) | `false` | engine default |
| `db_name` | Test database name (ignored for `sqlite` / static-only) | `false` | `test_db` |
| `db_user` | Database user (ignored for `sqlite` / static-only) | `false` | engine default |
| `db_password` | Database user password (**required** for live engines; ignored for `sqlite` / static-only) | `false` | `""` |
| <a id="input-fail-on-severity"></a>`fail_on_severity` | Fail the job if any finding ≥ this severity (`none`, `info`, `low`, `medium`, `high`, `critical`) | `false` | `none` |
| <a id="input-fail-on-types"></a>`fail_on_types` | Comma-separated issue types that always fail (e.g. `MISSING_PRIMARY_KEY,WILDCARD_SELECT`) | `false` | `""` |
| <a id="input-job-summary"></a>`job_summary` | What to write to `$GITHUB_STEP_SUMMARY`: `full` (default report), `compact` (counts + severity + pointer to `sql-optima-report.md`), or `none` (skip Step Summary; still write the file + outputs) | `false` | `full` |

SQL source resolution order: `sql_file` → `sql_content` → `repository_dispatch` `client_payload.sql_code` / `sql_content`.

Default `fail_on_severity: none` keeps the Action warn-only (report only). Raise the threshold to use it as a CI gate.

When your workflow also appends SQL Optima metrics to the Job Summary, set [`job_summary: none`](#input-job-summary) (or `compact`) so the overview is not duplicated — see [single Job Summary](#single-job-summary).

Live engines (`postgres` / `mysql` / `mssql` families) require an explicit [`db_password`](#inputs); the Action does not embed default credentials.

---

## Outputs

| Output | Description |
| :--- | :--- |
| `report` | Compact Markdown report safe for Job Summary / Action outputs (large SQL embeds may be truncated). |
| `report_path` | Workspace-relative path to the full Markdown report (`sql-optima-report.md`). Upload it as a workflow artifact for large schemas. |
| `issue_count` | Total number of static + dynamic findings. |
| `highest_severity` | Highest finding severity (`NONE`, `INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`). |

Static `SYNTAX_ERROR` findings include `line`, `column`, `location` (e.g. `path/to.sql:12:4` when `sql_file` is set), and a short `snippet` (±2 lines) rendered in the Markdown report.

---

## Try it with sample SQL

Checked-in fixtures under [`examples/`](examples/) intentionally trigger the findings sql-optima already detects. Use them to reproduce a report without inventing SQL.

| File | Purpose |
| :--- | :--- |
| [`examples/bad_schema.sql`](examples/bad_schema.sql) | Missing primary keys and unindexed foreign keys (static) |
| [`examples/bad_queries.sql`](examples/bad_queries.sql) | `SELECT *` and leading-wildcard `LIKE` (static; dynamic if tables exist) |
| [`examples/leading_wildcard_like.sql`](examples/leading_wildcard_like.sql) | Dedicated leading-wildcard `LIKE` queries (static; dynamic if `users` exists) |
| [`examples/mixed_postgres.sql`](examples/mixed_postgres.sql) | Combined schema + query demo for PostgreSQL |
| [`examples/mixed_mysql.sql`](examples/mixed_mysql.sql) | Combined schema + query demo for MySQL / MariaDB |
| [`examples/mixed_sqlite.sql`](examples/mixed_sqlite.sql) | Combined schema + query demo for SQLite (in-memory EXPLAIN) |
| [`examples/mixed_mssql.sql`](examples/mixed_mssql.sql) | Combined schema + query demo for SQL Server |
| [`examples/mixed_bigquery.sql`](examples/mixed_bigquery.sql) | Static-only BigQuery dialect sample |
| [`examples/mixed_snowflake.sql`](examples/mixed_snowflake.sql) | Static-only Snowflake dialect sample |
| [`examples/seed_postgres.sql`](examples/seed_postgres.sql) | Seed `users` / `orders` for Postgres `EXPLAIN` |
| [`examples/seed_mysql.sql`](examples/seed_mysql.sql) | Seed `users` / `orders` for MySQL / MariaDB `EXPLAIN` |
| [`examples/seed_mssql.sql`](examples/seed_mssql.sql) | Seed `users` / `orders` for SQL Server `SHOWPLAN` |

### Expected findings

| Issue type | Severity | Why it fires | Suggested fix |
| :--- | :--- | :--- | :--- |
| `MISSING_PRIMARY_KEY` | HIGH | `products` has no `PRIMARY KEY` | Add an `id` (or natural) primary key |
| `UNINDEXED_FOREIGN_KEY` | MEDIUM | `order_items.order_id` is a FK without an explicit index (skipped for MySQL/MariaDB **InnoDB**, which auto-indexes FKs; also skipped when a same-table `KEY`/`INDEX`/`UNIQUE` already covers the FK columns) | `CREATE INDEX` on the FK column(s) |
| `WILDCARD_SELECT` | LOW | `SELECT * FROM orders …` | Project only required columns |
| `LEADING_WILDCARD_LIKE` | MEDIUM | `email LIKE '%example.com'` | Avoid leading `%`, or use trigram/full-text search |
| `FILTER_COLUMN_INDEX_CANDIDATE` | INFO | Columns used in `WHERE` | Consider indexes on hot filter columns |
| `SEQUENTIAL_SCAN` / `FULL_TABLE_SCAN` / `SQLITE_TABLE_SCAN` / `MSSQL_TABLE_SCAN` | MEDIUM–HIGH | Dynamic explain on unindexed filters | Index matching predicates |

> **Note:** For PostgreSQL, MySQL/MariaDB, SQLite, and SQL Server, safe `CREATE` / `INSERT` / `ALTER TABLE` statements in `sql_content` are applied before EXPLAIN/SHOWPLAN (destructive admin DDL like `DROP DATABASE` is blocked). Pre-seeding with `examples/seed_*.sql` remains optional for shared CI tables. **BigQuery** and **Snowflake** are static-only (no live warehouse adapter yet).

### Engine compatibility notes

| Engine input | Static dialect | Dynamic analyzer |
| :--- | :--- | :--- |
| `postgres`, `postgresql` | PostgreSQL | `pg` + `EXPLAIN (ANALYZE, … FORMAT JSON)` (+ apply DDL from `sql_content`) |
| `cockroach`, `cockroachdb`, `aurora-postgres` | PostgreSQL | Same Postgres analyzer (wire-compatible targets) |
| `mysql`, `mariadb`, `aurora-mysql` | MySQL | `mysql2` + `EXPLAIN FORMAT=JSON` (+ apply DDL from `sql_content`) |
| `sqlite`, `sqlite3` | SQLite | In-memory `sql.js` + `EXPLAIN QUERY PLAN` |
| `mssql`, `sqlserver`, `tsql` | T-SQL (`transactsql`) | `mssql` + `SET SHOWPLAN_ALL` (+ apply DDL from `sql_content`) |
| `bigquery`, `bq` | BigQuery | Static-only (no live EXPLAIN) |
| `snowflake` | Snowflake | Static-only (no live EXPLAIN) |
| Other values | MySQL fallback for parsing when unknown | Clear “not currently supported” dynamic reason |

### Run against the samples

#### A) In this repository’s CI (`push` / PR via `ci.yml`, or `workflow_dispatch` demo)

The [CI workflow](.github/workflows/ci.yml) runs unit tests, lint, a `dist/` freshness check, a default-path `integration` job against live Postgres/MySQL/SQL Server, and per-engine sample fixtures (plus static BigQuery/Snowflake). Manual API demos use [`.github/workflows/test.yml`](.github/workflows/test.yml).

#### B) From a consumer workflow (inline file contents)

```yaml
- uses: actions/checkout@v4

- name: Run SQL Optima
  uses: ale94lko/sql-optima@v1
  with:
    engine: postgres
    sql_file: examples/mixed_postgres.sql
    db_host: localhost
    db_port: '5432'
    db_name: test_db
    db_user: postgres
    db_password: root
```

#### C) Via GitHub API (`repository_dispatch`)

Send the sample body as `client_payload.sql_code` (escape newlines for JSON, or paste a single-line script):

```bash
SQL=$(jq -Rs . < examples/mixed_postgres.sql)
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_PERSONAL_ACCESS_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/dispatches \
  -d "{\"event_type\":\"analyze-sql\",\"client_payload\":{\"engine\":\"postgres\",\"sql_code\":$SQL}}"
```

#### D) Local static smoke check (no database)

```bash
node -e "const {analyzeStaticSQL}=require('./src/analyzer/static'); const fs=require('fs'); console.log(analyzeStaticSQL(fs.readFileSync('examples/mixed_postgres.sql','utf8'),'postgres'));"
```

---

## Usage Examples

### 1. Trigger via GitHub REST API (`repository_dispatch`)

You can trigger SQL analysis from an external tool, webhook, or script by calling the GitHub API.

#### Workflow Configuration (`.github/workflows/sql-audit.yml`)

```yaml
name: SQL Audit via API

on:
  repository_dispatch:
    types: [analyze-sql]

jobs:
  audit:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: root
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Run SQL Optima
        uses: ale94lko/sql-optima@v1
        with:
          engine: ${{ github.event.client_payload.engine }}
          sql_content: ${{ github.event.client_payload.sql_code }}
          db_host: 'localhost'
          db_port: '5432'
          db_name: 'test_db'
          db_user: 'postgres'
          db_password: 'root'
```

#### Executing the API Call (cURL)

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_PERSONAL_ACCESS_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/dispatches \
  -d '{
    "event_type": "analyze-sql",
    "client_payload": {
      "engine": "postgres",
      "sql_code": "CREATE TABLE orders (id INT, amount DECIMAL(10,2)); SELECT * FROM orders WHERE amount > 100;"
    }
  }'
```

### 2. Standard PR & Workflow Usage

```yaml
name: SQL Linter & Optimizer

on:
  pull_request:
    paths:
      - '**.sql'

jobs:
  sql-check:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_DATABASE: test_db
          MYSQL_ROOT_PASSWORD: root
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - uses: actions/checkout@v4

      - name: Analyze Schema
        uses: ale94lko/sql-optima@v1
        with:
          engine: 'mysql'
          sql_file: examples/mixed_mysql.sql
          db_host: 'localhost'
          db_port: '3306'
          db_user: 'root'
          db_password: 'root'
```

### 3. Fail the job on HIGH findings

Fails the job when any finding is HIGH or above. See [`fail_on_severity`](#input-fail-on-severity) and [`fail_on_types`](#input-fail-on-types) in [Inputs](#inputs). Full sample: [`examples/workflows/severity-gate.yml`](examples/workflows/severity-gate.yml).

```yaml
# Warn-only (default): always green; inspect Step Summary / outputs
- name: Analyze (warn-only)
  id: warn
  uses: ale94lko/sql-optima@v1
  with:
    engine: sqlite
    sql_file: examples/mixed_sqlite.sql
    fail_on_severity: none

# CI gate: fail the job when any finding is HIGH or above
- name: Analyze (fail on HIGH)
  uses: ale94lko/sql-optima@v1
  with:
    engine: sqlite
    sql_file: examples/mixed_sqlite.sql
    fail_on_severity: high
    # optional: always fail on specific types regardless of severity
    # fail_on_types: WILDCARD_SELECT,MISSING_PRIMARY_KEY

- name: Use outputs downstream
  run: |
    echo "issues=${{ steps.warn.outputs.issue_count }}"
    echo "highest=${{ steps.warn.outputs.highest_severity }}"
```

### 4. Single Job Summary (avoid duplicates)

Use this when the workflow uploads `sql-optima-report.md` and wants **one** Summary block with metrics + download link:

```yaml
- name: Analyze SQL
  id: optima
  uses: ale94lko/sql-optima@v1
  with:
    engine: mysql
    sql_file: schema.sql
    db_host: 127.0.0.1
    db_port: '3306'
    db_user: root
    db_password: ${{ secrets.DB_PASSWORD }}
    job_summary: none   # or compact

- name: Upload report
  id: upload
  uses: actions/upload-artifact@v4
  with:
    name: sql-optima-report
    path: ${{ steps.optima.outputs.report_path }}

- name: Job Summary
  env:
    ISSUE_COUNT: ${{ steps.optima.outputs.issue_count }}
    HIGHEST: ${{ steps.optima.outputs.highest_severity }}
    ARTIFACT_URL: ${{ steps.upload.outputs.artifact-url }}
  run: |
    {
      echo "### SQL Optima"
      echo ""
      echo "| Metric | Value |"
      echo "| :--- | :--- |"
      echo "| Issues | \`$ISSUE_COUNT\` |"
      echo "| Highest severity | \`$HIGHEST\` |"
      echo ""
      echo "[sql-optima-report.md]($ARTIFACT_URL)"
    } >> "$GITHUB_STEP_SUMMARY"
```

---

## Local Development & Building

Copy [`.env.example`](.env.example) to `.env` for local Action/DB placeholders (`ENGINE`, `SQL_FILE`, `DB_*`). Set `DB_PASSWORD` only in your private `.env` (gitignored); do not commit real credentials. For a database-free sanity check, run the [local static smoke check](#d-local-static-smoke-check-no-database).

### Optional local Postgres (dynamic analysis)

[`docker-compose.yml`](docker-compose.yml) starts **Postgres 16** with the same defaults as CI (`test_db` / `postgres` / port `5432`). Credentials come from `.env` — nothing production-like is hardcoded in Compose.

```bash
cp .env.example .env
# Set DB_PASSWORD in .env (CI / docs examples use `root` for local-only)

docker compose up -d

# Optional: seed shared tables (same as CI; use the password from your .env)
PGPASSWORD=root psql -h localhost -U postgres -d test_db -f examples/seed_postgres.sql
```

Run the Action against that DB from a consumer-style workflow (same inputs as [Quick start](#quick-start)):

```yaml
- uses: ale94lko/sql-optima@v1
  with:
    engine: postgres
    sql_file: examples/mixed_postgres.sql
    db_host: localhost
    db_port: '5432'
    db_name: test_db
    db_user: postgres
    db_password: root   # or whatever you set in .env
```

Or invoke the bundled entrypoint locally after `npm run build` (GitHub Actions maps inputs to `INPUT_*`):

```bash
export INPUT_ENGINE=postgres
export INPUT_SQL_FILE=examples/mixed_postgres.sql
export INPUT_DB_HOST=localhost
export INPUT_DB_PORT=5432
export INPUT_DB_NAME=test_db
export INPUT_DB_USER=postgres
export INPUT_DB_PASSWORD="${DB_PASSWORD:-root}"
node dist/index.js
```

Stop the stack with `docker compose down` when finished.

### Build

Requires **Node.js 24+** (`engines.node` in `package.json`; matches Action `runs.using: node24` and CI).

```bash
# Clone the repository
git clone https://github.com/ale94lko/sql-optima.git
cd sql-optima

# Install dependencies
npm install

# Lint, unit tests, and coverage thresholds (statements/lines/functions ≥90%, branches ≥80%)
npm run lint
npm test
npm run test:coverage   # fails the process (and CI `unit`) if floors in vitest.config.js are unmet

# Compile source files into dist/index.js (commit dist/ JS when src/ or deps change).
# dist/sql-wasm.js + sql-wasm.wasm are generated here and gitignored on main; release tags ship them.
npm run build
```

CI on pull requests runs unit tests, lint (ESLint + actionlint), a `dist/` freshness check, and multi-engine integration jobs — see [CONTRIBUTING.md](CONTRIBUTING.md#continuous-integration).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and pull request guidelines. Please follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

**sql-optima** is released under the [MIT License](LICENSE).
