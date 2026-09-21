/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SqliteAnalyzer = require('./sqlite');

describe('SqliteAnalyzer', () => {
  let run;
  let exec;
  let close;
  let Database;
  let initSqlJs;

  beforeEach(() => {
    run = vi.fn();
    exec = vi.fn();
    close = vi.fn();
    Database = vi.fn(function MockDatabase() {
      this.run = run;
      this.exec = exec;
      this.close = close;
    });
    initSqlJs = vi.fn(async () => ({ Database }));
  });

  it('initializes an in-memory database on testConnection', async () => {
    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    await expect(analyzer.testConnection()).resolves.toBe(true);
    expect(run).toHaveBeenCalledWith('SELECT 1;');
  });

  it('applies CREATE statements then explains the last SELECT', async () => {
    exec.mockReturnValue([
      {
        columns: ['id', 'parent', 'notused', 'detail'],
        values: [[0, 0, 0, 'SCAN TABLE orders']],
      },
    ]);

    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE orders (id INTEGER, user_id INTEGER);
      SELECT * FROM orders WHERE user_id = 5;
    `);

    expect(run).toHaveBeenCalledWith('CREATE TABLE orders (id INTEGER, user_id INTEGER)');
    expect(exec).toHaveBeenCalledWith(
      'EXPLAIN QUERY PLAN SELECT * FROM orders WHERE user_id = 5',
    );
    expect(result.executed).toBe(true);
    expect(result.issues[0].type).toBe('SQLITE_TABLE_SCAN');
  });

  it('skips EXPLAIN when no SELECT is present', async () => {
    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    const result = await analyzer.analyzeQuery('CREATE TABLE t (id INTEGER);');

    expect(result.executed).toBe(false);
    expect(result.reason).toContain('EXPLAIN QUERY PLAN skipped');
  });

  it('returns EXPLAIN errors as issues', async () => {
    exec.mockImplementation(() => {
      throw new Error('no such table: missing');
    });

    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    const result = await analyzer.analyzeQuery('SELECT * FROM missing;');

    expect(result.executed).toBe(false);
    expect(result.issues[0].type).toBe('EXPLAIN_EXECUTION_ERROR');
  });

  it('closes the database', async () => {
    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    await analyzer.testConnection();
    await analyzer.close();
    expect(close).toHaveBeenCalled();
  });

  it('loads real sql.js from node_modules when initSqlJs is not injected', async () => {
    const analyzer = new SqliteAnalyzer({});
    await expect(analyzer.testConnection()).resolves.toBe(true);
    expect(analyzer.db).toBeTruthy();
    const result = await analyzer.analyzeQuery(`
      CREATE TABLE t (id INTEGER PRIMARY KEY);
      SELECT id FROM t;
    `);
    expect(result.executed).toBe(true);
    await analyzer.close();
  });

  it('forwards log calls when a structured logger is injected', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    exec.mockReturnValue([]);
    const analyzer = new SqliteAnalyzer({}, { initSqlJs, logger });

    await expect(analyzer.testConnection()).resolves.toBe(true);
    expect(logger.debug).toHaveBeenCalled();

    await analyzer.analyzeQuery('SELECT 1;');
    expect(logger.info).toHaveBeenCalledWith(
      'SQLite dynamic analysis',
      expect.objectContaining({ engine: 'sqlite', phase: 'dynamic' }),
    );
  });

  it('flags SQLITE_TEMP_B_TREE when the plan uses a temporary B-tree', async () => {
    exec.mockReturnValue([
      {
        columns: ['id', 'parent', 'notused', 'detail'],
        values: [[0, 0, 0, 'USE TEMP B-TREE FOR ORDER BY']],
      },
    ]);

    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    const result = await analyzer.analyzeQuery('SELECT * FROM t ORDER BY name;');

    expect(result.executed).toBe(true);
    expect(result.issues[0]).toEqual(
      expect.objectContaining({
        type: 'SQLITE_TEMP_B_TREE',
        severity: 'MEDIUM',
      }),
    );
  });

  it('does not flag SCAN when an index is used', async () => {
    exec.mockReturnValue([
      {
        columns: ['id', 'parent', 'notused', 'detail'],
        values: [[0, 0, 0, 'SEARCH TABLE orders USING INDEX idx_user_id (user_id=?)']],
      },
    ]);

    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    const result = await analyzer.analyzeQuery('SELECT * FROM orders WHERE user_id = 5;');

    expect(result.executed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('normalizes explain rows without a detail column', async () => {
    exec.mockReturnValue([
      {
        columns: ['selectid', 'order', 'from', 'detail_missing'],
        values: [[0, 0, 0, 'SCAN TABLE orders']],
      },
    ]);

    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    const result = await analyzer.analyzeQuery('SELECT * FROM orders;');

    expect(result.executed).toBe(true);
    expect(result.issues[0].type).toBe('SQLITE_TABLE_SCAN');
  });

  it('handles empty EXPLAIN QUERY PLAN results', async () => {
    exec.mockReturnValue([]);
    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    const result = await analyzer.analyzeQuery('SELECT 1;');

    expect(result.executed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('ignores non-string plan details safely', () => {
    const analyzer = new SqliteAnalyzer({}, { initSqlJs });
    const issues = [];
    analyzer.inspectPlanDetail(null, issues);
    analyzer.inspectPlanDetail(42, issues);
    expect(issues).toEqual([]);
  });
});

