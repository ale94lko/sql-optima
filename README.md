# SQL Optima Action

[![Health Score](https://raw.githubusercontent.com/ale94lko/sql-optima/output/badge.svg)](https://github.com/ale94lko/sql-optima/community)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-SQL%20Optima%20Action-blue?style=flat-square&logo=github)](https://github.com/marketplace/actions/sql-optima-action)
[![License: Source-Available (AI restricted)](https://img.shields.io/badge/License-Source--Available-blue.svg?style=flat-square)](LICENSE)
[![Node.js CI](https://img.shields.io/badge/node.js-20.x-green?style=flat-square&logo=node.js)](https://nodejs.org/)

An automated **SQL performance analyzer, schema linter, and query execution optimizer** built for GitHub Actions.

`sql-optima` parses raw SQL code or schema files, identifies structural anti-patterns (e.g., missing primary keys or unindexed foreign keys), connects to ephemeral database containers (PostgreSQL / MySQL), and evaluates query execution plans (`EXPLAIN`) to flag sequential scans, disk sorts, and full table scans.

---

## Key Features

- **Multi-Engine Support:** Works natively with **PostgreSQL** and **MySQL / MariaDB**.
- **Static AST Analysis:** Inspects SQL syntax without needing a live database to detect missing primary keys, unindexed foreign key candidates, `SELECT *` usages, and leading wildcard `LIKE` queries.
- **Dynamic Execution Analysis:** Runs `EXPLAIN (FORMAT JSON)` against live ephemeral DB services to inspect execution costs, high-cost joins, and sequential table scans.
- **Dual Triggering:** Supports execution via standard workflow inputs or directly through external API calls (`repository_dispatch`).
- **GitHub Step Summaries:** Publishes markdown reports directly to `$GITHUB_STEP_SUMMARY` and Pull Request checks.

---

## Inputs

| Input | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `engine` | Database engine (`postgres` \| `mysql`) | `false` | `postgres` |
| `sql_content` | SQL query or schema definition script to analyze | `false` | `""` |
| `db_host` | Database hostname | `false` | `localhost` |
| `db_port` | Database connection port | `false` | `5432` / `3306` |
| `db_name` | Test database name | `false` | `test_db` |
| `db_user` | Database user | `false` | `postgres` / `root` |
| `db_password` | Database user password | `false` | `root` |

---

## Outputs

| Output | Description |
| :--- | :--- |
| `report` | The full generated Markdown report containing static and dynamic findings. |

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
