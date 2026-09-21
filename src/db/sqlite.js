/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

const fs = require('fs');
const path = require('path');
const {
  extractSelectStatement,
  extractSchemaStatements,
  stripLeadingComments,
} = require('../sqlUtils');

/**
 * Build a cwd-relative path without `path.join(process.cwd(), literal…)` so ncc’s
 * asset relocator cannot rewrite it into platform-specific `__nccwpck_require__.ab`
 * stubs (that made Build dist fail on Linux vs Windows).
 * @param {string[]} parts
 * @returns {string}
 */
function pathFromCwd(parts) {
  let result = process.cwd();
  for (const part of parts) {
    result += path.sep + part;
  }
  return result;
}

/**
 * Resolve sql.js without a static `require('sql.js')` so ncc does not inline it.
 * Prefer `sql-wasm.js` next to the Action entry (`dist/`), then cwd installs.
 * @returns {Function}
 */
function loadInitSqlJs() {
  const fileName = ['sql', '-wasm', '.js'].join('');
  const candidates = [
    path.join(__dirname, fileName),
    pathFromCwd(['dist', fileName]),
    pathFromCwd(['node_modules', 'sql.js', 'dist', fileName]),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      // Dynamic path keeps sql.js out of the ncc bundle (see scripts/copy-sqljs-wasm.js).
      return require(candidate);
    }
  }

  throw new Error(
    'sql.js runtime not found (sql-wasm.js). Run `npm run build` (or `npm install`) so the Action can load SQLite.',
  );
}

/**
 * Prefer a wasm binary next to the loader / Action entry.
 * @returns {string|null}
 */
function resolveWasmPath() {
  const fileName = ['sql', '-wasm', '.wasm'].join('');
  const candidates = [
    path.join(__dirname, fileName),
    pathFromCwd(['dist', fileName]),
    pathFromCwd(['node_modules', 'sql.js', 'dist', fileName]),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

/**
 * SQLite analyzer using an in-memory sql.js database.
 * Applies CREATE/INSERT statements from the script before EXPLAIN QUERY PLAN.
 */
class SqliteAnalyzer {
  /**
   * @param {Object} [config]
   * @param {Object} [dependencies]
   * @param {Function} [dependencies.initSqlJs] - Injected sql.js initializer for tests.
   * @param {Object} [dependencies.logger] - Optional structured logger.
   */
  constructor(config = {}, dependencies = {}) {
    this.config = config;
    this.logger = dependencies.logger || null;
    this.initSqlJs = dependencies.initSqlJs || null;
    this.db = null;
    this.SQL = null;
  }

  /**
   * @param {'debug'|'info'|'warn'|'error'} level
   * @param {string} message
   * @param {Record<string, unknown>} [fields]
   */
  log(level, message, fields) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message, fields);
    }
  }

  /**
   * Initializes an empty in-memory SQLite database.
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    this.log('debug', 'SQLite in-memory connect', {
      engine: 'sqlite',
      phase: 'connect',
    });
    const options = {};
    const wasmPath = resolveWasmPath();
    if (wasmPath) {
      options.wasmBinary = fs.readFileSync(wasmPath);
    }

    const initSqlJs = this.initSqlJs || loadInitSqlJs();
    this.SQL = await initSqlJs(options);
    this.db = new this.SQL.Database();
    this.db.run('SELECT 1;');
    return true;
  }

  /**
   * Applies schema statements, then runs EXPLAIN QUERY PLAN on the last SELECT.
   * @param {string} sqlQuery
   * @returns {Promise<Object>}
   */
  async analyzeQuery(sqlQuery) {
    const issues = [];

    if (!this.db) {
      await this.testConnection();
    }

    const schemaStatements = extractSchemaStatements(sqlQuery);
    const selectQuery = extractSelectStatement(sqlQuery);
    this.log('info', 'SQLite dynamic analysis', {
      engine: 'sqlite',
      phase: 'dynamic',
      schemaStatementCount: schemaStatements.length,
      hasSelect: Boolean(selectQuery),
    });

    for (const statement of schemaStatements) {
      try {
        this.db.run(stripLeadingComments(statement));
      } catch (error) {
        issues.push({
          type: 'SCHEMA_APPLY_ERROR',
          severity: 'MEDIUM',
          message: `Failed to apply schema statement before EXPLAIN: ${error.message}`,
          suggestion:
            'Ensure CREATE/INSERT statements are valid SQLite syntax when using the sqlite engine.',
        });
      }
    }

    if (!selectQuery) {
      return {
        executed: false,
        reason: 'EXPLAIN QUERY PLAN skipped: Query is not a SELECT or WITH statement.',
        issues,
      };
    }

    try {
      const result = this.db.exec(`EXPLAIN QUERY PLAN ${selectQuery}`);
      const planRows = normalizeExplainRows(result);
      planRows.forEach((detail) => this.inspectPlanDetail(detail, issues));

      return {
        executed: true,
        totalCost: null,
        issues,
        rawPlan: planRows,
      };
    } catch (error) {
      return {
        executed: false,
        error: `Failed to execute EXPLAIN QUERY PLAN: ${error.message}`,
        issues: [
          ...issues,
          {
            type: 'EXPLAIN_EXECUTION_ERROR',
            severity: 'HIGH',
            message: `Database error during execution: ${error.message}`,
            suggestion:
              'Ensure referenced tables exist (sql-optima applies CREATE/INSERT from the same script for sqlite).',
          },
        ],
      };
    }
  }

  /**
   * Interprets SQLite EXPLAIN QUERY PLAN detail strings.
   * @param {string} detail
   * @param {Array<Object>} issues
   */
  inspectPlanDetail(detail, issues) {
    if (!detail || typeof detail !== 'string') return;

    const upper = detail.toUpperCase();

    if (upper.includes('SCAN') && !upper.includes('USING INDEX') && !upper.includes('COVERING INDEX')) {
      const tableMatch = detail.match(/SCAN\s+(?:TABLE\s+)?(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : 'unknown_table';
      issues.push({
        type: 'SQLITE_TABLE_SCAN',
        severity: 'MEDIUM',
        message: `SQLite plan performs a table scan on "${tableName}": ${detail}`,
        suggestion: `Consider adding an index that covers the filter/join predicates for "${tableName}".`,
      });
    }

    if (upper.includes('USE TEMP B-TREE')) {
      issues.push({
        type: 'SQLITE_TEMP_B_TREE',
        severity: 'MEDIUM',
        message: `SQLite plan uses a temporary B-tree: ${detail}`,
        suggestion: 'Review ORDER BY / GROUP BY indexes to avoid temporary sorting structures.',
      });
    }
  }

  /**
   * Closes the in-memory database.
   */
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * @param {Array<{columns: string[], values: any[][]}>} result
 * @returns {string[]}
 */
function normalizeExplainRows(result) {
  if (!Array.isArray(result) || result.length === 0) {
    return [];
  }

  const table = result[0];
  const detailIndex = table.columns.findIndex((c) => c.toLowerCase() === 'detail');
  if (detailIndex === -1) {
    return table.values.map((row) => row.join(' | '));
  }

  return table.values.map((row) => String(row[detailIndex]));
}

module.exports = SqliteAnalyzer;

