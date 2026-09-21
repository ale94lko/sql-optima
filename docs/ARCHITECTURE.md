# Architecture

High-level design of the **sql-optima** GitHub Action.

## Purpose

sql-optima analyzes SQL for structural anti-patterns and (when a live engine is available) execution-plan problems. It runs as a Node.js 24 GitHub Action and posts results to the Job Summary and Action outputs.

## Components

```
src/
  index.js          Entry: read inputs, load SQL, run analyzers, format, severity gate
  analyzer/
    static.js       AST / heuristic static checks (dialect-aware)
  db/
    postgres.js     Live EXPLAIN against PostgreSQL
    mysql.js        Live EXPLAIN against MySQL / MariaDB
    mssql.js        Live SHOWPLAN against SQL Server
    sqlite.js       In-memory EXPLAIN via sql.js (+ wasm)
  formatter.js      Markdown report for $GITHUB_STEP_SUMMARY
  severityGate.js   fail_on_severity / fail_on_types CI gate
  sqlUtils.js       SQL splitting, DDL allowlist, helpers
dist/               ncc-bundled Action entry (committed; wasm generated at build)
```

## Data flow

1. Inputs: `sql_content`, `sql_file`, engine/connection settings, severity gate.
2. Load SQL (file wins over content / dispatch payload when both set).
3. **Static analysis** always runs.
4. **Dynamic analysis** runs when an engine connection (or SQLite in-memory) is configured; safe DDL from the SQL blob may be applied before EXPLAIN.
5. Findings are formatted to Markdown; optional severity gate fails the job.
6. Outputs: `report`, `issue_count`, `highest_severity`.

## Trust boundaries

| Boundary | Trust assumption |
| :--- | :--- |
| Workflow inputs / `repository_dispatch` payload | Untrusted SQL text; treated as analysis input only |
| Database services in CI | Ephemeral test DBs; credentials are CI secrets/locals |
| Action runner filesystem | Trusted to read `sql_file` paths inside the workspace |
| Downstream consumers | Consume Markdown/outputs; no automatic PR writes by default |

Dangerous statements (`DROP DATABASE`, `GRANT`, etc.) are blocked before apply/EXPLAIN.

## Build

`npm run build` uses `@vercel/ncc` to produce `dist/index.js` and copies `sql-wasm.js` + `sql-wasm.wasm` beside it for SQLite (sql.js is not inlined — see CONTRIBUTING). Consumers typically pin a release tag and do not run `npm install` on the Action itself.
