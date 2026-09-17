# SQL Optima Action

[![Health Score](https://raw.githubusercontent.com/ale94lko/sql-optima/output/badge.svg)](https://github.com/ale94lko/sql-optima/community)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-SQL%20Optima%20Action-blue?style=flat-square&logo=github)](https://github.com/marketplace/actions/sql-optima-action)
[![License: Source-Available (AI restricted)](https://img.shields.io/badge/License-Source--Available-blue.svg?style=flat-square)](LICENSE)
[![Node.js CI](https://img.shields.io/badge/node.js-20.x-green?style=flat-square&logo=node.js)](https://nodejs.org/)

An automated **SQL performance analyzer, schema linter, and query execution optimizer** built for GitHub Actions.

`sql-optima` parses raw SQL code or schema files, identifies structural anti-patterns (e.g., missing primary keys or unindexed foreign keys), connects to ephemeral database containers (PostgreSQL / MySQL), and evaluates query execution plans (`EXPLAIN`) to flag sequential scans, disk sorts, and full table scans.

---

## Key Features

- **Multi-Engine Support:** Works with **PostgreSQL** (including CockroachDB / Aurora PostgreSQL wire-compatible aliases), **MySQL / MariaDB / Aurora MySQL**, and **SQLite** (in-memory, no service container).
- **Static AST Analysis:** Inspects SQL syntax without needing a live database to detect missing primary keys, unindexed foreign key candidates, `SELECT *` usages, and leading wildcard `LIKE` queries.
- **Dynamic Execution Analysis:** Runs engine-specific explain plans (`EXPLAIN` / `EXPLAIN QUERY PLAN`) against live or in-memory databases to inspect scans, sorts, and high-cost access paths.
- **Dual Triggering:** Supports execution via standard workflow inputs or directly through external API calls (`repository_dispatch`).
- **GitHub Step Summaries:** Publishes markdown reports directly to `$GITHUB_STEP_SUMMARY` and Pull Request checks.

---

## Inputs

| Input | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `engine` | Database engine (`postgres`, `mysql`, `mariadb`, `sqlite`, `cockroachdb`, `aurora-postgres`, `aurora-mysql`, …) | `false` | `postgres` |
| `sql_content` | SQL query or schema definition script to analyze | `false` | `""` |
| `db_host` | Database hostname (ignored for `sqlite`) | `false` | `localhost` |
| `db_port` | Database connection port (`5432` / `3306`; ignored for `sqlite`) | `false` | `5432` / `3306` |
| `db_name` | Test database name (ignored for `sqlite`) | `false` | `test_db` |
| `db_user` | Database user (ignored for `sqlite`) | `false` | `postgres` / `root` |
| `db_password` | Database user password (ignored for `sqlite`) | `false` | `root` |

---

## Outputs

| Output | Description |
| :--- | :--- |
| `report` | The full generated Markdown report containing static and dynamic findings. |

---

## Try it with sample SQL

Checked-in fixtures under [`examples/`](examples/) intentionally trigger the findings sql-optima already detects. Use them to reproduce a report without inventing SQL.

| File | Purpose |
| :--- | :--- |
| [`examples/bad_schema.sql`](examples/bad_schema.sql) | Missing primary keys and unindexed foreign keys (static) |
| [`examples/bad_queries.sql`](examples/bad_queries.sql) | `SELECT *` and leading-wildcard `LIKE` (static; dynamic if tables exist) |
| [`examples/mixed_postgres.sql`](examples/mixed_postgres.sql) | Combined schema + query demo for PostgreSQL |
| [`examples/mixed_mysql.sql`](examples/mixed_mysql.sql) | Combined schema + query demo for MySQL / MariaDB |
| [`examples/mixed_sqlite.sql`](examples/mixed_sqlite.sql) | Combined schema + query demo for SQLite (in-memory EXPLAIN) |
| [`examples/seed_postgres.sql`](examples/seed_postgres.sql) | Seed `users` / `orders` for Postgres `EXPLAIN` |
| [`examples/seed_mysql.sql`](examples/seed_mysql.sql) | Seed `users` / `orders` for MySQL / MariaDB `EXPLAIN` |

### Expected findings

| Issue type | Severity | Why it fires | Suggested fix |
| :--- | :--- | :--- | :--- |
| `MISSING_PRIMARY_KEY` | HIGH | `products` has no `PRIMARY KEY` | Add an `id` (or natural) primary key |
| `UNINDEXED_FOREIGN_KEY` | MEDIUM | `order_items.order_id` is a FK without an explicit index | `CREATE INDEX` on the FK column(s) |
| `WILDCARD_SELECT` | LOW | `SELECT * FROM orders …` | Project only required columns |
| `LEADING_WILDCARD_LIKE` | MEDIUM | `email LIKE '%example.com'` | Avoid leading `%`, or use trigram/full-text search |
| `FILTER_COLUMN_INDEX_CANDIDATE` | INFO | Columns used in `WHERE` | Consider indexes on hot filter columns |
| `SEQUENTIAL_SCAN` / `FULL_TABLE_SCAN` / `SQLITE_TABLE_SCAN` | MEDIUM–HIGH | Dynamic explain on unindexed filters | Index matching predicates |

> **Note:** For PostgreSQL/MySQL, `CREATE TABLE` in `sql_content` is linted statically but is **not** applied to the ephemeral database yet (see [#7](https://github.com/ale94lko/sql-optima/issues/7)). Apply `examples/seed_*.sql` first. **SQLite** is different: the Action applies `CREATE`/`INSERT` from the same script into an in-memory DB before `EXPLAIN QUERY PLAN`.

### Engine compatibility notes

| Engine input | Static dialect | Dynamic analyzer |
| :--- | :--- | :--- |
| `postgres`, `postgresql` | PostgreSQL | `pg` + `EXPLAIN (ANALYZE, … FORMAT JSON)` |
| `cockroach`, `cockroachdb`, `aurora-postgres` | PostgreSQL | Same Postgres analyzer (wire-compatible targets) |
| `mysql`, `mariadb`, `aurora-mysql` | MySQL | `mysql2` + `EXPLAIN FORMAT=JSON` |
| `sqlite`, `sqlite3` | SQLite | In-memory `sql.js` + `EXPLAIN QUERY PLAN` |
| Other values | MySQL fallback for parsing when unknown | Clear “not currently supported” dynamic reason |

### Run against the samples

#### A) In this repository’s CI (`workflow_dispatch` / push / PR)

The test workflow loads [`examples/mixed_postgres.sql`](examples/mixed_postgres.sql) after seeding Postgres and posts the report to the Job Summary.

#### B) From a consumer workflow (inline file contents)

```yaml
- uses: actions/checkout@v4

- name: Load sample SQL
  id: sample
  shell: bash
  run: |
    {
      echo 'sql<<EOF'
      cat examples/mixed_postgres.sql
      echo 'EOF'
    } >> "$GITHUB_OUTPUT"

- name: Run SQL Optima
  uses: ale94lko/sql-optima@v1
  with:
    engine: postgres
    sql_content: ${{ steps.sample.outputs.sql }}
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
          sql_content: |
            CREATE TABLE users (
              username VARCHAR(50) NOT NULL
            );
            SELECT * FROM users WHERE username LIKE '%admin';
          db_host: 'localhost'
          db_port: '3306'
          db_user: 'root'
          db_password: 'root'
```

---

## Local Development & Building

To build and compile the distribution bundle locally:

```bash
# Clone the repository
git clone https://github.com/ale94lko/sql-optima.git
cd sql-optima

# Install dependencies
npm install

# Run unit tests with coverage thresholds
npm test
npm run test:coverage

# Compile source files into dist/index.js
npm run build
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and pull request guidelines. Please follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

**sql-optima** is source-available under the terms in [`LICENSE`](LICENSE): use, modification, and distribution are allowed, but using this software or its documentation to train, fine-tune, evaluate, or synthesize AI/ML/LLM systems requires a separate paid written agreement with the copyright holder.

> **Note:** GitHub may not detect this custom license as an SPDX identifier. That can temporarily affect Marketplace listing checks and the community-profile “license” checklist item; the health-score badge workflow should be re-checked after merge.
