/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

const sql = require('mssql');
const {
  extractSelectStatement,
  extractSchemaStatements,
  stripLeadingComments,
} = require('../sqlUtils');

/**
 * SQL Server (T-SQL) Database Handler for Dynamic Query Execution Analysis.
 * Uses SET SHOWPLAN_ALL to inspect estimated plans without executing the SELECT.
 */
class MssqlAnalyzer {
  /**
   * @param {Object} config - Database connection options.
   * @param {Object} [dependencies] - Optional test doubles.
   * @param {Object} [dependencies.pool] - Injected mssql ConnectionPool-like object.
   * @param {Object} [dependencies.sql] - Injected mssql module (for connect).
   * @param {Object} [dependencies.logger] - Optional structured logger.
   */
  constructor(config, dependencies = {}) {
    this.logger = dependencies.logger || null;
    this.config = {
      server: config.host || 'localhost',
      port: config.port || 1433,
      database: config.database || 'test_db',
      user: config.user || 'sa',
      password: config.password || '',
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      connectionTimeout: 5000,
      requestTimeout: 15000,
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 10000,
      },
    };
    this.sql = dependencies.sql || sql;
    this.pool = dependencies.pool || null;
    this._ownsPool = !dependencies.pool;
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
   * Ensures a connection pool is available and healthy.
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      this.log('debug', 'SQL Server pool connect', {
        engine: 'mssql',
        phase: 'connect',
      });
      if (!this.pool) {
        this.pool = await this.sql.connect(this.config);
      }
      await this.pool.request().query('SELECT 1 AS ok;');
      return true;
    } catch (error) {
      throw new Error(`SQL Server Connection Failed: ${error.message}`);
    }
  }

  /**
   * Applies schema statements from the script, then inspects SHOWPLAN_ALL output.
   * @param {string} sqlQuery
   * @returns {Promise<Object>}
   */
  async analyzeQuery(sqlQuery) {
    const issues = [];

    const schemaStatements = extractSchemaStatements(sqlQuery);
    const selectQuery = extractSelectStatement(sqlQuery);
    this.log('info', 'SQL Server dynamic analysis', {
      engine: 'mssql',
      phase: 'dynamic',
      schemaStatementCount: schemaStatements.length,
      hasSelect: Boolean(selectQuery),
    });

    if (!selectQuery) {
      return {
        executed: false,
        reason: 'SHOWPLAN skipped: Query is not a SELECT or WITH statement.',
        issues: [],
      };
    }

    try {
      if (!this.pool) {
        await this.testConnection();
      }

      for (const statement of schemaStatements) {
        try {
          await this.pool.request().query(stripLeadingComments(statement));
        } catch (schemaError) {
          issues.push({
            type: 'SCHEMA_APPLY_ERROR',
            severity: 'MEDIUM',
            message: `Failed to apply schema statement before SHOWPLAN: ${schemaError.message}`,
            suggestion:
              'Ensure CREATE/INSERT statements are valid T-SQL, or pre-seed the SQL Server database.',
          });
        }
      }

      await this.pool.request().query('SET SHOWPLAN_ALL ON;');
      let planResult;
      try {
        planResult = await this.pool.request().query(selectQuery);
      } finally {
        try {
          await this.pool.request().query('SET SHOWPLAN_ALL OFF;');
        } catch {
          // best-effort restore
        }
      }

      const planRows = planResult?.recordset || [];
      planRows.forEach((row) => this.inspectPlanRow(row, issues));

      const totalCost = planRows.reduce((max, row) => {
        const cost = Number(row.TotalSubtreeCost) || 0;
        return cost > max ? cost : max;
      }, 0);

      return {
        executed: true,
        totalCost: totalCost || null,
        issues,
        rawPlan: planRows,
      };
    } catch (error) {
      return {
        executed: false,
        error: `Failed to execute SHOWPLAN: ${error.message}`,
        issues: [
          ...issues,
          {
            type: 'EXPLAIN_EXECUTION_ERROR',
            severity: 'HIGH',
            message: `Database error during execution: ${error.message}`,
            suggestion:
              'Ensure referenced tables/columns exist in the SQL Server schema before running dynamic checks.',
          },
        ],
      };
    }
  }

  /**
   * Inspects a SHOWPLAN_ALL row for common performance anti-patterns.
   * @param {Object} row
   * @param {Array<Object>} issues
   */
  inspectPlanRow(row, issues) {
    if (!row) return;

    const physicalOp = String(row.PhysicalOp || '');
    const logicalOp = String(row.LogicalOp || '');
    const stmtText = String(row.StmtText || '');
    const estimateRows = Number(row.EstimateRows) || 0;

    if (/table scan/i.test(physicalOp) || /table scan/i.test(logicalOp)) {
      issues.push({
        type: 'MSSQL_TABLE_SCAN',
        severity: estimateRows > 1000 ? 'HIGH' : 'MEDIUM',
        message: `Table Scan detected (${physicalOp || logicalOp}; estimated rows: ${estimateRows}).`,
        suggestion:
          'Add a supporting nonclustered index covering the filter/join columns referenced by the query.',
      });
    }

    if (/clustered index scan/i.test(physicalOp) && estimateRows > 500) {
      issues.push({
        type: 'MSSQL_CLUSTERED_INDEX_SCAN',
        severity: 'MEDIUM',
        message: `Clustered Index Scan with high estimated rows (${estimateRows}): ${stmtText.slice(0, 120)}`,
        suggestion:
          'Consider a covering nonclustered index so the optimizer can use Index Seek instead of a full clustered scan.',
      });
    }

    if (/sort/i.test(physicalOp) && Number(row.EstimateIO) > 10) {
      issues.push({
        type: 'MSSQL_EXPENSIVE_SORT',
        severity: 'MEDIUM',
        message: `Sort operator with elevated estimated I/O (${row.EstimateIO}).`,
        suggestion: 'Add an index matching ORDER BY / GROUP BY columns to avoid expensive sorts.',
      });
    }
  }

  /**
   * Closes the connection pool when owned by this analyzer.
   */
  async close() {
    if (this.pool && this._ownsPool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}

module.exports = MssqlAnalyzer;

