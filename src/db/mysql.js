/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

const mysql = require('mysql2/promise');
const {
  extractSelectStatement,
  extractSchemaStatements,
  stripLeadingComments,
} = require('../sqlUtils');

/**
 * MySQL / MariaDB Database Handler for Dynamic Query Execution Analysis.
 */
class MySQLAnalyzer {
  /**
   * Initializes the MySQL connection pool.
   * @param {Object} config - Database connection options.
   * @param {Object} [dependencies] - Optional test doubles.
   * @param {Object} [dependencies.pool] - Injected mysql2 pool.
   * @param {Object} [dependencies.logger] - Optional structured logger.
   */
  constructor(config, dependencies = {}) {
    this.logger = dependencies.logger || null;
    this.pool =
      dependencies.pool ||
      mysql.createPool({
        host: config.host || 'localhost',
        port: config.port || 3306,
        database: config.database || 'test_db',
        user: config.user || 'root',
        password: config.password || '',
        waitForConnections: true,
        connectionLimit: 5,
        connectTimeout: 5000,
        enableKeepAlive: true,
      });
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
   * Tests the connection to the MySQL database.
   * @returns {Promise<boolean>} True if connected successfully.
   */
  async testConnection() {
    let connection;
    try {
      this.log('debug', 'MySQL pool connect', { engine: 'mysql', phase: 'connect' });
      connection = await this.pool.getConnection();
      await connection.query('SELECT 1;');
      return true;
    } catch (error) {
      throw new Error(`MySQL Connection Failed: ${error.message}`);
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Applies schema statements from the script, then runs EXPLAIN FORMAT=JSON.
   *
   * @param {string} sqlQuery - The SQL script to analyze.
   * @returns {Promise<Object>} Execution metrics and dynamic suggestions.
   */
  async analyzeQuery(sqlQuery) {
    let connection;
    const issues = [];
    let planData = null;

    const schemaStatements = extractSchemaStatements(sqlQuery);
    const selectQuery = extractSelectStatement(sqlQuery);
    this.log('info', 'MySQL dynamic analysis', {
      engine: 'mysql',
      phase: 'dynamic',
      schemaStatementCount: schemaStatements.length,
      hasSelect: Boolean(selectQuery),
    });

    if (!selectQuery) {
      return {
        executed: false,
        reason: 'EXPLAIN skipped: Query is not a SELECT or WITH statement.',
        issues: [],
      };
    }

    try {
      connection = await this.pool.getConnection();

      for (const statement of schemaStatements) {
        try {
          await connection.query(stripLeadingComments(statement));
        } catch (schemaError) {
          issues.push({
            type: 'SCHEMA_APPLY_ERROR',
            severity: 'MEDIUM',
            message: `Failed to apply schema statement before EXPLAIN: ${schemaError.message}`,
            suggestion:
              'Ensure CREATE/INSERT statements are valid for MySQL/MariaDB, or pre-seed the database.',
          });
        }
      }

      const [rows] = await connection.query(`EXPLAIN FORMAT=JSON ${selectQuery}`);

      if (rows && rows[0] && rows[0].EXPLAIN) {
        planData = typeof rows[0].EXPLAIN === 'string' ? JSON.parse(rows[0].EXPLAIN) : rows[0].EXPLAIN;

        if (planData.query_block) {
          this.inspectQueryBlock(planData.query_block, issues);
        }
      }

      return {
        executed: true,
        totalCost: planData?.query_block?.cost_info?.query_cost || null,
        issues,
        rawPlan: planData,
      };
    } catch (error) {
      return {
        executed: false,
        error: `Failed to execute EXPLAIN: ${error.message}`,
        issues: [
          ...issues,
          {
            type: 'EXPLAIN_EXECUTION_ERROR',
            severity: 'HIGH',
            message: `Database error during execution: ${error.message}`,
            suggestion:
              'Ensure referenced tables/columns exist in the MySQL schema before running dynamic checks.',
          },
        ],
      };
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Inspects MySQL EXPLAIN query_block structure for performance anti-patterns.
   */
  inspectQueryBlock(queryBlock, issues) {
    if (!queryBlock) return;

    if (queryBlock.table) {
      this.inspectTableNode(queryBlock.table, issues);
    }

    if (queryBlock.nested_loop) {
      queryBlock.nested_loop.forEach((loop) => {
        if (loop.table) {
          this.inspectTableNode(loop.table, issues);
        }
      });
    }

    if (queryBlock.ordering_operation) {
      if (queryBlock.ordering_operation.using_filesort) {
        issues.push({
          type: 'MYSQL_FILESORT',
          severity: 'MEDIUM',
          message: 'ORDER BY requires a filesort operation.',
          suggestion:
            'Consider adding an index covering the ORDER BY columns to avoid filesort overhead.',
        });
      }
      if (queryBlock.ordering_operation.using_temporary_table) {
        issues.push({
          type: 'MYSQL_TEMPORARY_TABLE',
          severity: 'HIGH',
          message: 'Query creates an in-memory or disk temporary table during execution.',
          suggestion: 'Optimize GROUP BY or DISTINCT clauses with proper composite indexes.',
        });
      }
    }
  }

  /**
   * Evaluates individual table access patterns.
   */
  inspectTableNode(tableNode, issues) {
    const tableName = tableNode.table_name || 'unknown_table';
    const accessType = tableNode.access_type?.toLowerCase();
    const rowsExamined = tableNode.rows_examined_per_scan || 0;

    if (accessType === 'all') {
      issues.push({
        type: 'FULL_TABLE_SCAN',
        severity: rowsExamined > 500 ? 'HIGH' : 'MEDIUM',
        message: `Full Table Scan (access_type: ALL) on MySQL table "${tableName}" (Examined rows: ${rowsExamined}).`,
        suggestion: `Add an index on table "${tableName}" covering columns used in WHERE or JOIN predicates.`,
      });
    }

    if (!tableNode.key && accessType !== 'all') {
      issues.push({
        type: 'MISSING_INDEX_USAGE',
        severity: 'MEDIUM',
        message: `No index key was selected for table "${tableName}".`,
        suggestion: `Review table "${tableName}" structure and create suitable indexes for filtering.`,
      });
    }
  }

  /**
   * Closes the MySQL connection pool.
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = MySQLAnalyzer;

