/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MssqlAnalyzer = require('./mssql');

describe('MssqlAnalyzer', () => {
  let request;
  let pool;
  let sqlModule;

  beforeEach(() => {
    request = {
      query: vi.fn(),
    };
    pool = {
      request: vi.fn(() => request),
      close: vi.fn().mockResolvedValue(undefined),
    };
    sqlModule = {
      connect: vi.fn().mockResolvedValue(pool),
    };
  });

  it('uses an injected pool for testing', () => {
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    expect(analyzer.pool).toBe(pool);
  });

  it('connects via mssql when no pool is injected', async () => {
    request.query.mockResolvedValue({ recordset: [{ ok: 1 }] });
    const analyzer = new MssqlAnalyzer({}, { sql: sqlModule });

    await expect(analyzer.testConnection()).resolves.toBe(true);
    expect(sqlModule.connect).toHaveBeenCalled();
  });

  it('wraps connection failures', async () => {
    sqlModule.connect.mockRejectedValue(new Error('offline'));
    const analyzer = new MssqlAnalyzer({}, { sql: sqlModule });

    await expect(analyzer.testConnection()).rejects.toThrow('SQL Server Connection Failed: offline');
  });

  it('skips SHOWPLAN for non-select statements', async () => {
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const result = await analyzer.analyzeQuery('CREATE TABLE t (id INT);');

    expect(result).toEqual({
      executed: false,
      reason: 'SHOWPLAN skipped: Query is not a SELECT or WITH statement.',
      issues: [],
    });
  });

  it('applies schema, runs SHOWPLAN_ALL, and flags table scans', async () => {
    request.query
      .mockResolvedValueOnce({ recordset: [] }) // CREATE
      .mockResolvedValueOnce({ recordset: [] }) // SET SHOWPLAN_ALL ON
      .mockResolvedValueOnce({
        recordset: [
          {
            PhysicalOp: 'Table Scan',
            LogicalOp: 'Table Scan',
            EstimateRows: 2000,
            TotalSubtreeCost: 15.5,
            StmtText: 'SELECT * FROM users',
          },
          {
            PhysicalOp: 'Sort',
            EstimateIO: 20,
            TotalSubtreeCost: 5,
          },
        ],
      })
      .mockResolvedValueOnce({ recordset: [] }); // SET SHOWPLAN_ALL OFF

    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE users (id INT);
      SELECT * FROM users ORDER BY id;
    `);

    expect(result.executed).toBe(true);
    expect(result.totalCost).toBe(15.5);
    expect(result.issues.map((i) => i.type)).toEqual(
      expect.arrayContaining(['MSSQL_TABLE_SCAN', 'MSSQL_EXPENSIVE_SORT']),
    );
    expect(result.issues.find((i) => i.type === 'MSSQL_TABLE_SCAN').severity).toBe('HIGH');
  });

  it('records SCHEMA_APPLY_ERROR and continues with SHOWPLAN', async () => {
    request.query
      .mockRejectedValueOnce(new Error('bad ddl'))
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({
        recordset: [
          {
            PhysicalOp: 'Clustered Index Scan',
            EstimateRows: 800,
            StmtText: 'SELECT * FROM orders',
            TotalSubtreeCost: 3,
          },
        ],
      })
      .mockResolvedValueOnce({ recordset: [] });

    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE bad (;
      SELECT * FROM orders;
    `);

    expect(result.executed).toBe(true);
    expect(result.issues.find((issue) => issue.type === 'SCHEMA_APPLY_ERROR')).toEqual({
      type: 'SCHEMA_APPLY_ERROR',
      severity: 'MEDIUM',
      message: 'Failed to apply schema statement before SHOWPLAN: bad ddl',
      suggestion:
        'Ensure CREATE/INSERT statements are valid T-SQL, or pre-seed the SQL Server database.',
    });
    expect(result.issues.find((issue) => issue.type === 'MSSQL_CLUSTERED_INDEX_SCAN')).toEqual(
      expect.objectContaining({
        type: 'MSSQL_CLUSTERED_INDEX_SCAN',
        severity: 'MEDIUM',
        message: expect.stringContaining('800'),
      }),
    );
  });

  it('flags MSSQL_CLUSTERED_INDEX_SCAN from SHOWPLAN clustered scans with high estimated rows', async () => {
    const stmtText = 'SELECT * FROM orders WHERE status = 1';
    request.query
      .mockResolvedValueOnce({ recordset: [] }) // SET SHOWPLAN_ALL ON
      .mockResolvedValueOnce({
        recordset: [
          {
            PhysicalOp: 'Clustered Index Scan',
            LogicalOp: 'Clustered Index Scan',
            EstimateRows: 750,
            StmtText: stmtText,
            TotalSubtreeCost: 4.2,
          },
        ],
      })
      .mockResolvedValueOnce({ recordset: [] }); // SET SHOWPLAN_ALL OFF

    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const result = await analyzer.analyzeQuery('SELECT * FROM orders WHERE status = 1;');

    expect(result.executed).toBe(true);
    expect(result.totalCost).toBe(4.2);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      type: 'MSSQL_CLUSTERED_INDEX_SCAN',
      severity: 'MEDIUM',
      message: `Clustered Index Scan with high estimated rows (750): ${stmtText}`,
      suggestion:
        'Consider a covering nonclustered index so the optimizer can use Index Seek instead of a full clustered scan.',
    });
  });

  it('does not flag MSSQL_CLUSTERED_INDEX_SCAN when estimated rows are at most 500', () => {
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const issues = [];
    analyzer.inspectPlanRow(
      {
        PhysicalOp: 'Clustered Index Scan',
        EstimateRows: 500,
        StmtText: 'SELECT * FROM orders',
      },
      issues,
    );
    expect(issues).toEqual([]);
  });

  it('truncates StmtText in MSSQL_CLUSTERED_INDEX_SCAN messages to 120 characters', () => {
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const issues = [];
    const stmtText = `${'A'.repeat(120)}UNIQUE_TAIL`;
    analyzer.inspectPlanRow(
      {
        PhysicalOp: 'Clustered Index Scan',
        EstimateRows: 501,
        StmtText: stmtText,
      },
      issues,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      type: 'MSSQL_CLUSTERED_INDEX_SCAN',
      severity: 'MEDIUM',
      message: `Clustered Index Scan with high estimated rows (501): ${'A'.repeat(120)}`,
      suggestion:
        'Consider a covering nonclustered index so the optimizer can use Index Seek instead of a full clustered scan.',
    });
    expect(issues[0].message).not.toContain('UNIQUE_TAIL');
  });

  it('returns an execution error when SHOWPLAN fails', async () => {
    request.query
      .mockResolvedValueOnce({ recordset: [] }) // SET ON
      .mockRejectedValueOnce(new Error('invalid object'))
      .mockResolvedValueOnce({ recordset: [] }); // SET OFF in finally

    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const result = await analyzer.analyzeQuery('SELECT * FROM missing;');

    expect(result.executed).toBe(false);
    expect(result.error).toBe('Failed to execute SHOWPLAN: invalid object');
    expect(result.issues).toEqual([
      {
        type: 'EXPLAIN_EXECUTION_ERROR',
        severity: 'HIGH',
        message: 'Database error during execution: invalid object',
        suggestion:
          'Ensure referenced tables/columns exist in the SQL Server schema before running dynamic checks.',
      },
    ]);
  });

  it('keeps SCHEMA_APPLY_ERROR when SHOWPLAN fails after a schema apply error', async () => {
    request.query
      .mockRejectedValueOnce(new Error('bad ddl'))
      .mockResolvedValueOnce({ recordset: [] }) // SET SHOWPLAN_ALL ON
      .mockRejectedValueOnce(new Error('invalid object'))
      .mockResolvedValueOnce({ recordset: [] }); // SET SHOWPLAN_ALL OFF in finally

    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE bad (;
      SELECT * FROM missing;
    `);

    expect(result.executed).toBe(false);
    expect(result.error).toBe('Failed to execute SHOWPLAN: invalid object');
    expect(result.issues).toEqual([
      {
        type: 'SCHEMA_APPLY_ERROR',
        severity: 'MEDIUM',
        message: 'Failed to apply schema statement before SHOWPLAN: bad ddl',
        suggestion:
          'Ensure CREATE/INSERT statements are valid T-SQL, or pre-seed the SQL Server database.',
      },
      {
        type: 'EXPLAIN_EXECUTION_ERROR',
        severity: 'HIGH',
        message: 'Database error during execution: invalid object',
        suggestion:
          'Ensure referenced tables/columns exist in the SQL Server schema before running dynamic checks.',
      },
    ]);
  });

  it('swallows SHOWPLAN_ALL OFF failures after a successful plan', async () => {
    request.query
      .mockResolvedValueOnce({ recordset: [] }) // SET SHOWPLAN_ALL ON
      .mockResolvedValueOnce({
        recordset: [
          {
            PhysicalOp: 'Index Seek',
            EstimateRows: 1,
            TotalSubtreeCost: 0.01,
          },
        ],
      })
      .mockRejectedValueOnce(new Error('restore failed'));

    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const result = await analyzer.analyzeQuery('SELECT 1;');

    expect(result.executed).toBe(true);
    expect(result.totalCost).toBe(0.01);
    expect(result.issues).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('connects through testConnection when analyzeQuery has no injected pool', async () => {
    request.query
      .mockResolvedValueOnce({ recordset: [{ ok: 1 }] }) // testConnection SELECT 1
      .mockResolvedValueOnce({ recordset: [] }) // SET ON
      .mockResolvedValueOnce({ recordset: [] }) // plan
      .mockResolvedValueOnce({ recordset: [] }); // SET OFF

    const analyzer = new MssqlAnalyzer({}, { sql: sqlModule });
    const result = await analyzer.analyzeQuery('SELECT 1;');

    expect(sqlModule.connect).toHaveBeenCalled();
    expect(result.executed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('treats a missing SHOWPLAN recordset as an empty plan', async () => {
    request.query
      .mockResolvedValueOnce({ recordset: [] }) // SET ON
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ recordset: [] }); // SET OFF

    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const result = await analyzer.analyzeQuery('SELECT 1;');

    expect(result.executed).toBe(true);
    expect(result.totalCost).toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.rawPlan).toEqual([]);
  });

  it('closes an owned pool', async () => {
    const analyzer = new MssqlAnalyzer({}, { sql: sqlModule });
    analyzer.pool = pool;
    analyzer._ownsPool = true;
    await analyzer.close();
    expect(pool.close).toHaveBeenCalled();
  });

  it('does not close an injected pool', async () => {
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    await analyzer.close();
    expect(pool.close).not.toHaveBeenCalled();
  });

  it('ignores empty plan rows safely', () => {
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const issues = [];
    analyzer.inspectPlanRow(null, issues);
    analyzer.inspectPlanRow({}, issues);
    expect(issues).toEqual([]);
  });

  it('flags a MEDIUM MSSQL_TABLE_SCAN when only LogicalOp reports a table scan', () => {
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const issues = [];
    analyzer.inspectPlanRow(
      {
        LogicalOp: 'Table Scan',
        EstimateRows: 1000,
      },
      issues,
    );

    expect(issues).toEqual([
      {
        type: 'MSSQL_TABLE_SCAN',
        severity: 'MEDIUM',
        message: 'Table Scan detected (Table Scan; estimated rows: 1000).',
        suggestion:
          'Add a supporting nonclustered index covering the filter/join columns referenced by the query.',
      },
    ]);
  });

  it('flags MSSQL_EXPENSIVE_SORT when estimated I/O is above 10', () => {
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const issues = [];
    analyzer.inspectPlanRow(
      {
        PhysicalOp: 'Sort',
        EstimateIO: 10.1,
      },
      issues,
    );

    expect(issues).toEqual([
      {
        type: 'MSSQL_EXPENSIVE_SORT',
        severity: 'MEDIUM',
        message: 'Sort operator with elevated estimated I/O (10.1).',
        suggestion: 'Add an index matching ORDER BY / GROUP BY columns to avoid expensive sorts.',
      },
    ]);
  });

  it('does not flag MSSQL_EXPENSIVE_SORT when estimated I/O is at most 10', () => {
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const issues = [];
    analyzer.inspectPlanRow(
      {
        PhysicalOp: 'Sort',
        EstimateIO: 10,
      },
      issues,
    );
    expect(issues).toEqual([]);
  });

  it('forwards log calls when a structured logger is injected', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    request.query.mockResolvedValue({ recordset: [] });
    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule, logger });

    await expect(analyzer.testConnection()).resolves.toBe(true);
    expect(logger.debug).toHaveBeenCalledWith(
      'SQL Server pool connect',
      expect.objectContaining({ engine: 'mssql', phase: 'connect' }),
    );
  });
});

