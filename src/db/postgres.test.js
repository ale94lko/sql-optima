/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PostgresAnalyzer = require('./postgres');

describe('PostgresAnalyzer', () => {
  let client;
  let pool;

  beforeEach(() => {
    client = {
      query: vi.fn(),
      release: vi.fn(),
    };
    pool = {
      connect: vi.fn().mockResolvedValue(client),
      end: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('uses an injected pool for testing', () => {
    const analyzer = new PostgresAnalyzer({}, { pool });
    expect(analyzer.pool).toBe(pool);
  });

  it('tests the connection successfully', async () => {
    client.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const analyzer = new PostgresAnalyzer({}, { pool });

    await expect(analyzer.testConnection()).resolves.toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('wraps connection failures', async () => {
    pool.connect.mockRejectedValue(new Error('offline'));
    const analyzer = new PostgresAnalyzer({}, { pool });

    await expect(analyzer.testConnection()).rejects.toThrow('PostgreSQL Connection Failed: offline');
  });

  it('skips EXPLAIN for non-select statements', async () => {
    const analyzer = new PostgresAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('CREATE TABLE t (id INT);');

    expect(result).toEqual({
      executed: false,
      reason: 'EXPLAIN ANALYZE skipped: Query is not a SELECT or WITH statement.',
      issues: [],
    });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('applies schema before EXPLAIN and inspects the plan', async () => {
    const explainPayload = {
      rows: [
        {
          'QUERY PLAN': [
            {
              'Execution Time': 8,
              'Planning Time': 0.5,
              Plan: {
                'Node Type': 'Nested Loop',
                'Actual Total Time': 150,
                'Total Cost': 120,
                Plans: [
                  {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'orders',
                    'Actual Rows': 1500,
                    'Total Cost': 99,
                    Filter: '(user_id = 5)',
                    Plans: [
                      {
                        'Node Type': 'Sort',
                        'Sort Space Type': 'Disk',
                        'Sort Space Used': 256,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(explainPayload);

    const analyzer = new PostgresAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE ignored (id INT);
      SELECT * FROM orders WHERE user_id = 5;
    `);

    expect(result.executed).toBe(true);
    expect(result.executionTimeMs).toBe(8);
    expect(result.planningTimeMs).toBe(0.5);
    expect(result.totalCost).toBe(120);
    expect(client.query.mock.calls[0][0]).toContain('CREATE TABLE');
    expect(client.query.mock.calls[1][0]).toContain('EXPLAIN');
    expect(result.issues.map((issue) => issue.type)).toEqual(
      expect.arrayContaining(['SEQUENTIAL_SCAN', 'DISK_SORT', 'HIGH_COST_NESTED_LOOP']),
    );
    expect(result.issues.find((issue) => issue.type === 'SEQUENTIAL_SCAN').severity).toBe('HIGH');
    expect(client.release).toHaveBeenCalled();
  });

  it('records SCHEMA_APPLY_ERROR and continues with EXPLAIN', async () => {
    client.query
      .mockRejectedValueOnce(new Error('syntax error at or near'))
      .mockResolvedValueOnce({
        rows: [
          {
            'QUERY PLAN': [
              {
                Plan: {
                  'Node Type': 'Seq Scan',
                  'Actual Rows': 10,
                  'Total Cost': 5,
                },
              },
            ],
          },
        ],
      });

    const analyzer = new PostgresAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE bad (;
      SELECT * FROM t;
    `);

    expect(result.executed).toBe(true);
    expect(result.issues.map((i) => i.type)).toEqual(
      expect.arrayContaining(['SCHEMA_APPLY_ERROR', 'SEQUENTIAL_SCAN']),
    );
  });

  it('supports WITH statements and medium-severity sequential scans', async () => {
    client.query.mockResolvedValue({
      rows: [
        {
          'QUERY PLAN': [
            {
              Plan: {
                'Node Type': 'Seq Scan',
                'Actual Rows': 10,
                'Total Cost': 5,
              },
            },
          ],
        },
      ],
    });

    const analyzer = new PostgresAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('WITH cte AS (SELECT 1) SELECT * FROM cte;');

    expect(result.executed).toBe(true);
    expect(result.issues[0]).toEqual(
      expect.objectContaining({
        type: 'SEQUENTIAL_SCAN',
        severity: 'MEDIUM',
        message: expect.stringContaining('unknown_table'),
      }),
    );
  });

  it('returns an execution error issue when EXPLAIN fails', async () => {
    client.query.mockRejectedValue(new Error('relation missing'));
    const analyzer = new PostgresAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('SELECT * FROM missing;');

    expect(result.executed).toBe(false);
    expect(result.error).toContain('relation missing');
    expect(result.issues[0].type).toBe('EXPLAIN_EXECUTION_ERROR');
  });

  it('closes the pool', async () => {
    const analyzer = new PostgresAnalyzer({}, { pool });
    await analyzer.close();
    expect(pool.end).toHaveBeenCalled();
  });

  it('ignores empty plan nodes safely', () => {
    const analyzer = new PostgresAnalyzer({}, { pool });
    const issues = [];
    analyzer.inspectPlanNode(null, issues);
    expect(issues).toEqual([]);
  });

  it('forwards log calls when a structured logger is injected', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    client.query.mockResolvedValue({ rows: [] });
    const analyzer = new PostgresAnalyzer({}, { pool, logger });

    await expect(analyzer.testConnection()).resolves.toBe(true);
    expect(logger.debug).toHaveBeenCalledWith(
      'PostgreSQL pool connect',
      expect.objectContaining({ engine: 'postgres', phase: 'connect' }),
    );

    await analyzer.analyzeQuery('SELECT 1;');
    expect(logger.info).toHaveBeenCalledWith(
      'PostgreSQL dynamic analysis',
      expect.objectContaining({ engine: 'postgres', phase: 'dynamic' }),
    );
  });

  it('treats empty EXPLAIN rows as a successful empty plan', async () => {
    client.query.mockResolvedValue({ rows: [] });
    const analyzer = new PostgresAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery('SELECT 1;');

    expect(result.executed).toBe(true);
    expect(result.executionTimeMs).toBeNull();
    expect(result.planningTimeMs).toBeNull();
    expect(result.totalCost).toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.rawPlan).toBeNull();
  });

  it('skips Nested Loop findings when actual time is low', () => {
    const analyzer = new PostgresAnalyzer({}, { pool });
    const issues = [];
    analyzer.inspectPlanNode(
      {
        'Node Type': 'Nested Loop',
        'Actual Total Time': 10,
        'Total Cost': 5,
      },
      issues,
    );
    expect(issues).toEqual([]);
  });

  it('keeps SCHEMA_APPLY_ERROR when EXPLAIN fails after a schema apply error', async () => {
    client.query
      .mockRejectedValueOnce(new Error('syntax error'))
      .mockRejectedValueOnce(new Error('relation missing'));

    const analyzer = new PostgresAnalyzer({}, { pool });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE bad (;
      SELECT * FROM missing;
    `);

    expect(result.executed).toBe(false);
    expect(result.issues.map((issue) => issue.type)).toEqual([
      'SCHEMA_APPLY_ERROR',
      'EXPLAIN_EXECUTION_ERROR',
    ]);
    expect(result.issues[0].severity).toBe('MEDIUM');
    expect(result.issues[1].severity).toBe('HIGH');
  });
});

