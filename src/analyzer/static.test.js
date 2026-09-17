import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { analyzeStaticSQL, getColumnName } = require('./static');

describe('analyzeStaticSQL', () => {
  it('flags tables without a primary key', () => {
    const issues = analyzeStaticSQL('CREATE TABLE users (name VARCHAR(100));');

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'MISSING_PRIMARY_KEY',
          severity: 'HIGH',
          message: expect.stringContaining('users'),
        }),
      ]),
    );
  });

  it('does not flag tables that define a column primary key', () => {
    const issues = analyzeStaticSQL(
      'CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(255));',
    );

    expect(issues.find((issue) => issue.type === 'MISSING_PRIMARY_KEY')).toBeUndefined();
  });

  it('does not flag tables that define a table-level primary key', () => {
    const issues = analyzeStaticSQL(
      'CREATE TABLE users (id INT NOT NULL, email VARCHAR(255), PRIMARY KEY (id));',
    );

    expect(issues.find((issue) => issue.type === 'MISSING_PRIMARY_KEY')).toBeUndefined();
  });

  it('flags foreign key constraints as index candidates', () => {
    const issues = analyzeStaticSQL(`
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        user_id INT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'UNINDEXED_FOREIGN_KEY',
          severity: 'MEDIUM',
          message: expect.stringContaining('user_id'),
        }),
      ]),
    );
  });

  it('flags SELECT * queries', () => {
    const issues = analyzeStaticSQL('SELECT * FROM users;');

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'WILDCARD_SELECT',
          severity: 'LOW',
        }),
      ]),
    );
  });

  it('flags leading wildcard LIKE patterns and filter columns', () => {
    const issues = analyzeStaticSQL("SELECT id FROM users WHERE email LIKE '%admin';");

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'LEADING_WILDCARD_LIKE', severity: 'MEDIUM' }),
        expect.objectContaining({
          type: 'FILTER_COLUMN_INDEX_CANDIDATE',
          severity: 'INFO',
          message: expect.stringContaining('email'),
        }),
      ]),
    );
  });

  it('returns a syntax error for invalid SQL', () => {
    const issues = analyzeStaticSQL('NOT VALID SQL !!!');

    expect(issues).toEqual([
      expect.objectContaining({
        type: 'SYNTAX_ERROR',
        severity: 'CRITICAL',
      }),
    ]);
  });

  it('supports the mysql dialect', () => {
    const issues = analyzeStaticSQL('CREATE TABLE t (name VARCHAR(10));', 'mysql');

    expect(issues.some((issue) => issue.type === 'MISSING_PRIMARY_KEY')).toBe(true);
  });

  it('supports the sqlite dialect', () => {
    const issues = analyzeStaticSQL('CREATE TABLE t (name TEXT);', 'sqlite');

    expect(issues.some((issue) => issue.type === 'MISSING_PRIMARY_KEY')).toBe(true);
  });

  it('ignores non-create/select statements without failing', () => {
    const issues = analyzeStaticSQL('DROP TABLE IF EXISTS users;');

    expect(issues).toEqual([]);
  });

  it('normalizes nested column identifiers through getColumnName', () => {
    expect(getColumnName('email')).toBe('email');
    expect(getColumnName({ expr: { value: 'id' } })).toBe('id');
    expect(getColumnName({ value: 'name' })).toBe('name');
    expect(getColumnName({ column: 'status' })).toBe('status');
    expect(getColumnName({ column: { expr: { value: 'user_id' } } })).toBe('user_id');
    expect(getColumnName(null)).toBeNull();
  });
});
