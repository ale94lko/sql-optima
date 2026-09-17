import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { run } = require('./index');

describe('run', () => {
  let core;
  let github;
  let analyzeStaticSQL;
  let generateMarkdownReport;
  let postgresAnalyzer;
  let mysqlAnalyzer;
  let sqliteAnalyzer;
  let PostgresAnalyzer;
  let MySQLAnalyzer;
  let SqliteAnalyzer;

  beforeEach(() => {
    analyzeStaticSQL = vi.fn().mockReturnValue([{ type: 'WILDCARD_SELECT' }]);
    generateMarkdownReport = vi.fn().mockReturnValue('## report');

    postgresAnalyzer = {
      testConnection: vi.fn().mockResolvedValue(true),
      analyzeQuery: vi.fn().mockResolvedValue({ executed: true, issues: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mysqlAnalyzer = {
      testConnection: vi.fn().mockResolvedValue(true),
      analyzeQuery: vi.fn().mockResolvedValue({ executed: true, issues: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    sqliteAnalyzer = {
      testConnection: vi.fn().mockResolvedValue(true),
      analyzeQuery: vi.fn().mockResolvedValue({ executed: true, issues: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    PostgresAnalyzer = vi.fn(function MockPostgresAnalyzer() {
      return postgresAnalyzer;
    });
    MySQLAnalyzer = vi.fn(function MockMySQLAnalyzer() {
      return mysqlAnalyzer;
    });
    SqliteAnalyzer = vi.fn(function MockSqliteAnalyzer() {
      return sqliteAnalyzer;
    });

    core = {
      getInput: vi.fn((name) => {
        const values = {
          engine: 'postgres',
          sql_content: 'SELECT id FROM users;',
          db_host: 'localhost',
          db_port: '5432',
          db_name: 'test_db',
          db_user: 'postgres',
          db_password: 'root',
        };
        return values[name] || '';
      }),
      setFailed: vi.fn(),
      setOutput: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      summary: {
        addRaw: vi.fn().mockReturnValue({
          write: vi.fn().mockResolvedValue(undefined),
        }),
      },
    };

    github = {
      context: {
        payload: {},
      },
    };
  });

  function deps(extra = {}) {
    return {
      core,
      github,
      staticAnalyzer: { analyzeStaticSQL },
      formatter: { generateMarkdownReport },
      PostgresAnalyzer,
      MySQLAnalyzer,
      SqliteAnalyzer,
      ...extra,
    };
  }

  it('uses sql_content from repository_dispatch when sql_code is absent', async () => {
    github.context.payload = {
      client_payload: {
        engine: 'mariadb',
        sql_content: 'SELECT name FROM users;',
      },
    };

    await run(deps());

    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT name FROM users;', 'mariadb');
    expect(MySQLAnalyzer).toHaveBeenCalled();
  });

  it('fails when no SQL content is provided', async () => {
    core.getInput.mockReturnValue('');

    await run(deps());

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('No SQL content provided to analyze'),
    );
    expect(analyzeStaticSQL).not.toHaveBeenCalled();
  });

  it('uses repository_dispatch payload overrides and postgres analysis', async () => {
    github.context.payload = {
      client_payload: {
        engine: 'postgresql',
        sql_code: 'SELECT * FROM orders;',
      },
    };

    await run(deps());

    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT * FROM orders;', 'postgresql');
    expect(postgresAnalyzer.testConnection).toHaveBeenCalled();
    expect(postgresAnalyzer.analyzeQuery).toHaveBeenCalledWith('SELECT * FROM orders;');
    expect(generateMarkdownReport).toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('report', '## report');
    expect(postgresAnalyzer.close).toHaveBeenCalled();
  });

  it('runs mysql analysis with default mysql connection inputs', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'mysql';
      if (name === 'sql_content') return 'SELECT 1;';
      return '';
    });

    await run(deps());

    expect(mysqlAnalyzer.testConnection).toHaveBeenCalled();
    expect(mysqlAnalyzer.analyzeQuery).toHaveBeenCalledWith('SELECT 1;');
    expect(mysqlAnalyzer.close).toHaveBeenCalled();
  });

  it('skips dynamic analysis when the database connection fails', async () => {
    postgresAnalyzer.testConnection.mockRejectedValue(new Error('db down'));

    await run(deps());

    expect(core.warning).toHaveBeenCalledWith('Skipping dynamic analysis: db down');
    expect(generateMarkdownReport).toHaveBeenCalledWith(
      expect.objectContaining({
        dynamicResult: expect.objectContaining({
          executed: false,
          error: 'db down',
        }),
      }),
    );
    expect(postgresAnalyzer.close).toHaveBeenCalled();
  });

  it('runs sqlite analysis without requiring host connection settings', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'sqlite';
      if (name === 'sql_content') return 'CREATE TABLE t (id INT); SELECT * FROM t;';
      return '';
    });

    await run(deps());

    expect(SqliteAnalyzer).toHaveBeenCalled();
    expect(sqliteAnalyzer.testConnection).toHaveBeenCalled();
    expect(sqliteAnalyzer.analyzeQuery).toHaveBeenCalled();
    expect(sqliteAnalyzer.close).toHaveBeenCalled();
  });

  it('maps cockroachdb to the postgres analyzer', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'cockroachdb';
      if (name === 'sql_content') return 'SELECT 1;';
      return '';
    });

    await run(deps());

    expect(PostgresAnalyzer).toHaveBeenCalled();
  });

  it('reports unsupported engines without opening a database connection', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'snowflake';
      if (name === 'sql_content') return 'SELECT 1;';
      return '';
    });

    await run(deps());

    expect(generateMarkdownReport).toHaveBeenCalledWith(
      expect.objectContaining({
        dynamicResult: expect.objectContaining({
          executed: false,
          reason: expect.stringContaining('snowflake'),
        }),
      }),
    );
    expect(PostgresAnalyzer).not.toHaveBeenCalled();
    expect(MySQLAnalyzer).not.toHaveBeenCalled();
    expect(SqliteAnalyzer).not.toHaveBeenCalled();
  });

  it('marks the action as failed when summary writing throws', async () => {
    core.summary.addRaw.mockReturnValue({
      write: vi.fn().mockRejectedValue(new Error('summary failed')),
    });

    await run(deps());

    expect(core.setFailed).toHaveBeenCalledWith('SQL Optima Action failed: summary failed');
    expect(postgresAnalyzer.close).toHaveBeenCalled();
  });
});
