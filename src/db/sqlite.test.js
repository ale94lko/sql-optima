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
});

