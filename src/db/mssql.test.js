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
    expect(result.issues.map((i) => i.type)).toEqual(
      expect.arrayContaining(['SCHEMA_APPLY_ERROR', 'MSSQL_CLUSTERED_INDEX_SCAN']),
    );
  });

  it('returns an execution error when SHOWPLAN fails', async () => {
    request.query
      .mockResolvedValueOnce({ recordset: [] }) // SET ON
      .mockRejectedValueOnce(new Error('invalid object'))
      .mockResolvedValueOnce({ recordset: [] }); // SET OFF in finally

    const analyzer = new MssqlAnalyzer({}, { pool, sql: sqlModule });
    const result = await analyzer.analyzeQuery('SELECT * FROM missing;');

    expect(result.executed).toBe(false);
    expect(result.issues[0].type).toBe('EXPLAIN_EXECUTION_ERROR');
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
    expect(issues).toEqual([]);
  });
});

