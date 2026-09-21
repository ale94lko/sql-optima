/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

const { Pool } = require('pg');
const {
  extractSelectStatement,
  extractSchemaStatements,
  stripLeadingComments,
} = require('../sqlUtils');

/**
 * PostgreSQL Database Handler for Dynamic Query Execution Analysis.
 */
class PostgresAnalyzer {
  /**
   * Initializes the PostgreSQL connection pool.
   * @param {Object} config - Database connection options.
   * @param {Object} [dependencies] - Optional test doubles.
   * @param {import('pg').Pool} [dependencies.pool] - Injected pool instance.
   * @param {Object} [dependencies.logger] - Optional structured logger.
   */
  constructor(config, dependencies = {}) {
    this.logger = dependencies.logger || null;
    this.pool =
      dependencies.pool ||
      new Pool({
        host: config.host || 'localhost',
        port: config.port || 5432,
        database: config.database || 'test_db',
        user: config.user || 'postgres',
        password: config.password || '',
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
        max: 5,
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
   * Tests the connection to the PostgreSQL database.
   * @returns {Promise<boolean>} True if connected successfully.
   */
  async testConnection() {
    let client;
    try {
      this.log('debug', 'PostgreSQL pool connect', {
        engine: 'postgres',
        phase: 'connect',
      });
      client = await this.pool.connect();
      await client.query('SELECT 1;');
      return true;
    } catch (error) {
      throw new Error(`PostgreSQL Connection Failed: ${error.message}`);
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Applies schema statements from the script, then runs EXPLAIN ANALYZE.
   *
   * @param {string} sqlQuery - The SQL script to analyze.
   * @returns {Promise<Object>} Execution metrics and dynamic suggestions.
   */
  async analyzeQuery(sqlQuery) {
    let client;
    const issues = [];
    let planData = null;

    const schemaStatements = extractSchemaStatements(sqlQuery);
    const selectQuery = extractSelectStatement(sqlQuery);
    this.log('info', 'PostgreSQL dynamic analysis', {
      engine: 'postgres',
      phase: 'dynamic',
      schemaStatementCount: schemaStatements.length,
      hasSelect: Boolean(selectQuery),
    });

    if (!selectQuery) {
      return {
        executed: false,
        reason: 'EXPLAIN ANALYZE skipped: Query is not a SELECT or WITH statement.',
        issues: [],
      };
    }

    try {
      client = await this.pool.connect();

      for (const statement of schemaStatements) {
        try {
          await client.query(stripLeadingComments(statement));
        } catch (schemaError) {
          issues.push({
            type: 'SCHEMA_APPLY_ERROR',
            severity: 'MEDIUM',
            message: `Failed to apply schema statement before EXPLAIN: ${schemaError.message}`,
            suggestion:
              'Ensure CREATE/INSERT statements are valid for PostgreSQL, or pre-seed the database.',
          });
        }
      }

      const explainSql = `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) ${selectQuery}`;
      const res = await client.query(explainSql);

      if (res.rows && res.rows[0]) {
        planData = res.rows[0]['QUERY PLAN'][0];
        const rootNode = planData.Plan;
        this.inspectPlanNode(rootNode, issues);
      }

      return {
        executed: true,
        executionTimeMs: planData ? planData['Execution Time'] : null,
        planningTimeMs: planData ? planData['Planning Time'] : null,
        totalCost: planData?.Plan ? planData.Plan['Total Cost'] : null,
        issues,
        rawPlan: planData,
      };
    } catch (error) {
      return {
        executed: false,
        error: `Failed to execute EXPLAIN ANALYZE: ${error.message}`,
        issues: [
          ...issues,
          {
            type: 'EXPLAIN_EXECUTION_ERROR',
            severity: 'HIGH',
            message: `Database error during execution: ${error.message}`,
            suggestion:
              'Ensure referenced tables/columns exist in the database schema before running dynamic checks.',
          },
        ],
      };
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Recursively inspects execution plan nodes for bottlenecks.
   */
  inspectPlanNode(node, issues) {
    if (!node) return;

    const nodeType = node['Node Type'];
    const totalCost = node['Total Cost'] || 0;
    const actualTotalTime = node['Actual Total Time'] || 0;

    if (nodeType === 'Seq Scan') {
      const relation = node['Relation Name'] || 'unknown_table';
      const rows = node['Actual Rows'] || 0;

      issues.push({
        type: 'SEQUENTIAL_SCAN',
        severity: rows > 1000 ? 'HIGH' : 'MEDIUM',
        message: `Sequential Scan detected on table "${relation}" (Rows fetched: ${rows}, Cost: ${totalCost}).`,
        suggestion: `Consider adding an index to table "${relation}" covering the filter conditions: ${node['Filter'] || 'N/A'}.`,
      });
    }

    if (nodeType === 'Sort' && node['Sort Space Type'] === 'Disk') {
      issues.push({
        type: 'DISK_SORT',
        severity: 'HIGH',
        message: `Sort operation spilled to disk (Used Space: ${node['Sort Space Used']} kB).`,
        suggestion:
          'Increase work_mem setting or optimize indexing on ORDER BY columns to perform in-memory sorting.',
      });
    }

    if (nodeType === 'Nested Loop' && actualTotalTime > 100) {
      issues.push({
        type: 'HIGH_COST_NESTED_LOOP',
        severity: 'MEDIUM',
        message: `Nested Loop join took ${actualTotalTime}ms to complete.`,
        suggestion: 'Verify that join key columns on both tables are properly indexed.',
      });
    }

    if (Array.isArray(node.Plans)) {
      node.Plans.forEach((child) => this.inspectPlanNode(child, issues));
    }
  }

  /**
   * Closes the connection pool.
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = PostgresAnalyzer;

