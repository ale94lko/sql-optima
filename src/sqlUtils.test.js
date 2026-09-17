import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractSelectStatement,
  extractSchemaStatements,
  resolveParserDialect,
  resolveEngineDefaults,
} = require('./sqlUtils');

describe('sqlUtils', () => {
  it('extracts the last select statement', () => {
    expect(
      extractSelectStatement('CREATE TABLE t (id INT); SELECT * FROM t WHERE id = 1;'),
    ).toBe('SELECT * FROM t WHERE id = 1');
  });

  it('extracts schema statements', () => {
    expect(
      extractSchemaStatements(`
        -- header comment
        CREATE TABLE t (id INT);
        INSERT INTO t VALUES (1);
        SELECT * FROM t;
      `),
    ).toEqual([
      '-- header comment\n        CREATE TABLE t (id INT)',
      'INSERT INTO t VALUES (1)',
    ]);
  });

  it('resolves parser dialects for supported engines', () => {
    expect(resolveParserDialect('postgres')).toBe('postgresql');
    expect(resolveParserDialect('cockroachdb')).toBe('postgresql');
    expect(resolveParserDialect('mariadb')).toBe('mysql');
    expect(resolveParserDialect('sqlite')).toBe('sqlite');
  });

  it('resolves connection defaults', () => {
    expect(resolveEngineDefaults('mariadb')).toEqual({ port: '3306', user: 'root' });
    expect(resolveEngineDefaults('sqlite')).toEqual({ port: '0', user: '' });
    expect(resolveEngineDefaults('postgres')).toEqual({ port: '5432', user: 'postgres' });
  });
});
