const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const {
  extractSelectStatement,
  extractSchemaStatements,
  stripLeadingComments,
} = require('../sqlUtils');

/**
 * SQLite analyzer using an in-memory sql.js database.
 * Applies CREATE/INSERT statements from the script before EXPLAIN QUERY PLAN.
 */
class SqliteAnalyzer {
  /**
   * @param {Object} [config]
   * @param {Object} [dependencies]
   * @param {Function} [dependencies.initSqlJs] - Injected sql.js initializer for tests.
   */
  constructor(config = {}, dependencies = {}) {
    this.config = config;
    this.initSqlJs = dependencies.initSqlJs || initSqlJs;
    this.db = null;
    this.SQL = null;
  }

  /**
   * Initializes an empty in-memory SQLite database.
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    const options = {};
    const wasmPath = path.join(__dirname, 'sql-wasm.wasm');
    if (fs.existsSync(wasmPath)) {
      options.wasmBinary = fs.readFileSync(wasmPath);
    }

    this.SQL = await this.initSqlJs(options);
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

    const selectQuery = extractSelectStatement(sqlQuery);
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
