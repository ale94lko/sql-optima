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
    expect(result.issues.map((i) => i.type)).toEqual(
      expect.arrayContaining(['SCHEMA_APPLY_ERROR', 'FULL_TABLE_SCAN']),
    );
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
    expect(result.issues[0].type).toBe('EXPLAIN_EXECUTION_ERROR');
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
    expect(issues).toEqual([]);
  });

  it('uses unknown_table when table metadata is missing', () => {
    const analyzer = new MySQLAnalyzer({}, { pool });
    const issues = [];
    analyzer.inspectTableNode({ access_type: 'ALL', rows_examined_per_scan: 1 }, issues);
    expect(issues[0].message).toContain('unknown_table');
  });
});
