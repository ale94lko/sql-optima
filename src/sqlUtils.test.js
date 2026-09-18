/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractSelectStatement,
  extractSchemaStatements,
  isBlockedSchemaStatement,
  isStaticOnlyEngine,
  requiresLivePassword,
  resolveParserDialect,
  resolveEngineDefaults,
} = require('./sqlUtils');

describe('sqlUtils', () => {
  it('extracts the last select statement', () => {
    expect(
      extractSelectStatement('CREATE TABLE t (id INT); SELECT * FROM t WHERE id = 1;'),
    ).toBe('SELECT * FROM t WHERE id = 1');
  });

  it('extracts schema statements and skips blocked admin DDL', () => {
    expect(
      extractSchemaStatements(`
        -- header comment
        CREATE TABLE t (id INT);
        INSERT INTO t VALUES (1);
        DROP DATABASE danger;
        SELECT * FROM t;
      `),
    ).toEqual([
      '-- header comment\n        CREATE TABLE t (id INT)',
      'INSERT INTO t VALUES (1)',
    ]);
    expect(isBlockedSchemaStatement('DROP SCHEMA public CASCADE')).toBe(true);
  });

  it('resolves parser dialects for supported engines', () => {
    expect(resolveParserDialect('postgres')).toBe('postgresql');
    expect(resolveParserDialect('cockroachdb')).toBe('postgresql');
    expect(resolveParserDialect('mariadb')).toBe('mysql');
    expect(resolveParserDialect('sqlite')).toBe('sqlite');
    expect(resolveParserDialect('mssql')).toBe('transactsql');
    expect(resolveParserDialect('sqlserver')).toBe('transactsql');
    expect(resolveParserDialect('bigquery')).toBe('bigquery');
    expect(resolveParserDialect('snowflake')).toBe('snowflake');
  });

  it('identifies static-only warehouse engines', () => {
    expect(isStaticOnlyEngine('bigquery')).toBe(true);
    expect(isStaticOnlyEngine('bq')).toBe(true);
    expect(isStaticOnlyEngine('snowflake')).toBe(true);
    expect(isStaticOnlyEngine('mssql')).toBe(false);
  });

  it('resolves connection defaults without embedding passwords', () => {
    expect(resolveEngineDefaults('mariadb')).toEqual({
      port: '3306',
      user: 'root',
      password: '',
    });
    expect(resolveEngineDefaults('sqlite')).toEqual({
      port: '0',
      user: '',
      password: '',
    });
    expect(resolveEngineDefaults('postgres')).toEqual({
      port: '5432',
      user: 'postgres',
      password: '',
    });
    expect(resolveEngineDefaults('mssql')).toEqual({
      port: '1433',
      user: 'sa',
      password: '',
    });
    expect(JSON.stringify(resolveEngineDefaults('postgres'))).not.toMatch(
      /Your_strong_Password123/,
    );
  });

  it('requires an explicit password only for live database engines', () => {
    expect(requiresLivePassword('postgres')).toBe(true);
    expect(requiresLivePassword('mysql')).toBe(true);
    expect(requiresLivePassword('mssql')).toBe(true);
    expect(requiresLivePassword('sqlite')).toBe(false);
    expect(requiresLivePassword('bigquery')).toBe(false);
    expect(requiresLivePassword('oracle')).toBe(false);
  });
});

