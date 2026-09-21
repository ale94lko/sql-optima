/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MySQLAnalyzer = require('./mysql');

describe('MySQLAnalyzer', () => {
  let connection;
  let pool;

  beforeEach(() => {
    connection = {
      query: vi.fn(),
      release: vi.fn(),
    };
    pool = {
      getConnection: vi.fn().mockResolvedValue(connection),
      end: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('uses an injected pool for testing', () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    expect(analyzer.pool).toBe(pool);
  });

  it('tests the connection successfully', async () => {
    connection.query.mockResolvedValue([[{ 1: 1 }]]);
    const analyzer = new MySQLAnalyzer({}, { pool });

    await expect(analyzer.testConnection()).resolves.toBe(true);
    expect(connection.release).toHaveBeenCalled();
  });

  it('wraps connection failures', async () => {
    pool.getConnection.mockRejectedValue(new Error('denied'));
    const analyzer = new MySQLAnalyzer({}, { pool });

    await expect(analyzer.testConnection()).rejects.toThrow('MySQL Connection Failed: denied');
  });

  it('skips EXPLAIN for non-select statements', async () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('UPDATE t SET a = 1;');

    expect(result.executed).toBe(false);
    expect(result.reason).toContain('EXPLAIN skipped');
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('applies schema statements before EXPLAIN and flags full scans', async () => {
    const plan = {
      query_block: {
        cost_info: { query_cost: '12.34' },
        table: {
          table_name: 'users',
          access_type: 'ALL',
          rows_examined_per_scan: 900,
        },
        nested_loop: [
          {
            table: {
              table_name: 'orders',
              access_type: 'ref',
            },
          },
        ],
        ordering_operation: {
          using_filesort: true,
          using_temporary_table: true,
        },
      },
    };

    connection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ EXPLAIN: JSON.stringify(plan) }]]);

    const analyzer = new MySQLAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE users (id INT);
      SELECT * FROM users ORDER BY name;
    `);

    expect(result.executed).toBe(true);
    expect(result.totalCost).toBe('12.34');
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.query.mock.calls[0][0]).toContain('CREATE TABLE');
    expect(connection.query.mock.calls[1][0]).toContain('EXPLAIN FORMAT=JSON');
    expect(result.issues.map((issue) => issue.type)).toEqual(
      expect.arrayContaining([
        'FULL_TABLE_SCAN',
        'MISSING_INDEX_USAGE',
        'MYSQL_FILESORT',
        'MYSQL_TEMPORARY_TABLE',
      ]),
    );
    expect(result.issues.find((issue) => issue.type === 'FULL_TABLE_SCAN').severity).toBe('HIGH');
  });

  it('flags MYSQL_TEMPORARY_TABLE from query_block ordering_operation', async () => {
    connection.query.mockResolvedValue([
      [
        {
          EXPLAIN: {
            query_block: {
              cost_info: { query_cost: '3.50' },
              ordering_operation: {
                using_temporary_table: true,
              },
            },
          },
        },
      ],
    ]);

    const analyzer = new MySQLAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('SELECT DISTINCT name FROM users;');

    expect(result.executed).toBe(true);
    expect(result.totalCost).toBe('3.50');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      type: 'MYSQL_TEMPORARY_TABLE',
      severity: 'HIGH',
      message: 'Query creates an in-memory or disk temporary table during execution.',
      suggestion: 'Optimize GROUP BY or DISTINCT clauses with proper composite indexes.',
    });
    expect(connection.release).toHaveBeenCalled();
  });

  it('flags MYSQL_TEMPORARY_TABLE without also requiring filesort', () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    const issues = [];
    analyzer.inspectQueryBlock(
      {
        ordering_operation: {
          using_temporary_table: true,
        },
      },
      issues,
    );

    expect(issues).toEqual([
      {
        type: 'MYSQL_TEMPORARY_TABLE',
        severity: 'HIGH',
        message: 'Query creates an in-memory or disk temporary table during execution.',
        suggestion: 'Optimize GROUP BY or DISTINCT clauses with proper composite indexes.',
      },
    ]);
  });

  it('records SCHEMA_APPLY_ERROR and still attempts EXPLAIN', async () => {
    connection.query
      .mockRejectedValueOnce(new Error('syntax error'))
      .mockResolvedValueOnce([
        [
          {
            EXPLAIN: {
              query_block: {
                table: {
                  table_name: 'tiny',
                  access_type: 'ALL',
                  rows_examined_per_scan: 10,
                },
              },
            },
          },
        ],
      ]);

    const analyzer = new MySQLAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE bad (id INT;
      SELECT * FROM tiny;
    `);

    expect(result.executed).toBe(true);
    expect(result.issues.find((issue) => issue.type === 'SCHEMA_APPLY_ERROR')).toEqual({
      type: 'SCHEMA_APPLY_ERROR',
      severity: 'MEDIUM',
      message: 'Failed to apply schema statement before EXPLAIN: syntax error',
      suggestion:
        'Ensure CREATE/INSERT statements are valid for MySQL/MariaDB, or pre-seed the database.',
    });
    expect(result.issues.find((issue) => issue.type === 'FULL_TABLE_SCAN')).toEqual(
      expect.objectContaining({
        type: 'FULL_TABLE_SCAN',
        severity: 'MEDIUM',
        message: expect.stringContaining('"tiny"'),
      }),
    );
  });

  it('keeps SCHEMA_APPLY_ERROR when EXPLAIN fails after a schema apply error', async () => {
    connection.query
      .mockRejectedValueOnce(new Error('syntax error'))
      .mockRejectedValueOnce(new Error('unknown table'));

    const analyzer = new MySQLAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE bad (id INT;
      SELECT * FROM missing;
    `);

    expect(result.executed).toBe(false);
    expect(result.error).toBe('Failed to execute EXPLAIN: unknown table');
    expect(result.issues).toEqual([
      {
        type: 'SCHEMA_APPLY_ERROR',
        severity: 'MEDIUM',
        message: 'Failed to apply schema statement before EXPLAIN: syntax error',
        suggestion:
          'Ensure CREATE/INSERT statements are valid for MySQL/MariaDB, or pre-seed the database.',
      },
      {
        type: 'EXPLAIN_EXECUTION_ERROR',
        severity: 'HIGH',
        message: 'Database error during execution: unknown table',
        suggestion:
          'Ensure referenced tables/columns exist in the MySQL schema before running dynamic checks.',
      },
    ]);
    expect(connection.release).toHaveBeenCalled();
  });

  it('parses object EXPLAIN payloads and uses medium severity for small scans', async () => {
    connection.query.mockResolvedValue([
      [
        {
          EXPLAIN: {
            query_block: {
              table: {
                table_name: 'tiny',
                access_type: 'ALL',
                rows_examined_per_scan: 10,
              },
            },
          },
        },
      ],
    ]);

    const analyzer = new MySQLAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('WITH cte AS (SELECT 1 AS id) SELECT * FROM cte;');

    expect(result.executed).toBe(true);
    expect(result.issues[0].severity).toBe('MEDIUM');
  });

  it('returns an execution error issue when EXPLAIN fails', async () => {
    connection.query.mockRejectedValue(new Error('unknown table'));
    const analyzer = new MySQLAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('SELECT * FROM missing;');

    expect(result.executed).toBe(false);
    expect(result.error).toBe('Failed to execute EXPLAIN: unknown table');
    expect(result.issues).toEqual([
      {
        type: 'EXPLAIN_EXECUTION_ERROR',
        severity: 'HIGH',
        message: 'Database error during execution: unknown table',
        suggestion:
          'Ensure referenced tables/columns exist in the MySQL schema before running dynamic checks.',
      },
    ]);
    expect(connection.release).toHaveBeenCalled();
  });

  it('skips inspectQueryBlock when EXPLAIN JSON has no query_block', async () => {
    connection.query.mockResolvedValue([[{ EXPLAIN: { query_block: null } }]]);

    const analyzer = new MySQLAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('SELECT 1;');

    expect(result.executed).toBe(true);
    expect(result.totalCost).toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.rawPlan).toEqual({ query_block: null });
  });

  it('treats a missing EXPLAIN payload as a successful empty plan', async () => {
    connection.query.mockResolvedValue([[{}]]);

    const analyzer = new MySQLAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('SELECT 1;');

    expect(result.executed).toBe(true);
    expect(result.totalCost).toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.rawPlan).toBeNull();
  });

  it('closes the pool', async () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    await analyzer.close();
    expect(pool.end).toHaveBeenCalled();
    expect(analyzer.pool).toBeNull();
  });

  it('ignores empty query blocks safely', () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    const issues = [];
    analyzer.inspectQueryBlock(null, issues);
    analyzer.inspectQueryBlock({}, issues);
    analyzer.inspectQueryBlock({ ordering_operation: {} }, issues);
    analyzer.inspectQueryBlock({ nested_loop: [{}] }, issues);
    expect(issues).toEqual([]);
  });

  it('flags MYSQL_FILESORT from query_block ordering_operation', () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    const issues = [];
    analyzer.inspectQueryBlock(
      {
        ordering_operation: {
          using_filesort: true,
        },
      },
      issues,
    );

    expect(issues).toEqual([
      {
        type: 'MYSQL_FILESORT',
        severity: 'MEDIUM',
        message: 'ORDER BY requires a filesort operation.',
        suggestion:
          'Consider adding an index covering the ORDER BY columns to avoid filesort overhead.',
      },
    ]);
  });

  it('inspects nested_loop tables and flags MISSING_INDEX_USAGE', () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    const issues = [];
    analyzer.inspectQueryBlock(
      {
        nested_loop: [
          {},
          {
            table: {
              table_name: 'orders',
              access_type: 'ref',
            },
          },
        ],
      },
      issues,
    );

    expect(issues).toEqual([
      {
        type: 'MISSING_INDEX_USAGE',
        severity: 'MEDIUM',
        message: 'No index key was selected for table "orders".',
        suggestion: 'Review table "orders" structure and create suitable indexes for filtering.',
      },
    ]);
  });

  it('uses unknown_table when table metadata is missing', () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    const issues = [];
    analyzer.inspectTableNode({ access_type: 'ALL', rows_examined_per_scan: 1 }, issues);
    expect(issues).toEqual([
      {
        type: 'FULL_TABLE_SCAN',
        severity: 'MEDIUM',
        message:
          'Full Table Scan (access_type: ALL) on MySQL table "unknown_table" (Examined rows: 1).',
        suggestion:
          'Add an index on table "unknown_table" covering columns used in WHERE or JOIN predicates.',
      },
    ]);
  });

  it('does not flag MISSING_INDEX_USAGE when a key is selected', () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    const issues = [];
    analyzer.inspectTableNode(
      {
        table_name: 'users',
        access_type: 'ref',
        key: 'idx_users_id',
      },
      issues,
    );
    expect(issues).toEqual([]);
  });

  it('releases the connection when testConnection query fails', async () => {
    connection.query.mockRejectedValue(new Error('timeout'));
    const analyzer = new MySQLAnalyzer({}, { pool });

    await expect(analyzer.testConnection()).rejects.toThrow('MySQL Connection Failed: timeout');
    expect(connection.release).toHaveBeenCalled();
  });

  it('forwards log calls when a structured logger is injected', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    connection.query.mockResolvedValue([[{ 1: 1 }]]);
    const analyzer = new MySQLAnalyzer({}, { pool, logger });

    await expect(analyzer.testConnection()).resolves.toBe(true);
    expect(logger.debug).toHaveBeenCalledWith(
      'MySQL pool connect',
      expect.objectContaining({ engine: 'mysql', phase: 'connect' }),
    );

    connection.query.mockResolvedValue([[{ EXPLAIN: { query_block: {} } }]]);
    await analyzer.analyzeQuery('SELECT 1;');
    expect(logger.info).toHaveBeenCalledWith(
      'MySQL dynamic analysis',
      expect.objectContaining({ engine: 'mysql', phase: 'dynamic' }),
    );
  });

  it('close is a no-op when the pool was already ended', async () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    await analyzer.close();
    await expect(analyzer.close()).resolves.toBeUndefined();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});

