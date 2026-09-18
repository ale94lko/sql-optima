/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

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
  let mssqlAnalyzer;
  let PostgresAnalyzer;
  let MySQLAnalyzer;
  let SqliteAnalyzer;
  let MssqlAnalyzer;

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
    mssqlAnalyzer = {
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
    MssqlAnalyzer = vi.fn(function MockMssqlAnalyzer() {
      return mssqlAnalyzer;
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
      MssqlAnalyzer,
      ...extra,
    };
  }

  it('uses sql_content from repository_dispatch when sql_code and inputs are absent', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'mariadb';
      if (name === 'db_password') return 'secret';
      return '';
    });
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

  it('fails clearly when sql_file path does not exist', async () => {
    const fs = {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn(),
    };
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'postgres';
      if (name === 'sql_file') return 'missing.sql';
      return '';
    });

    await run(deps({ fs }));

    expect(core.setFailed).toHaveBeenCalledWith('SQL file not found: missing.sql');
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(analyzeStaticSQL).not.toHaveBeenCalled();
  });

  it('prefers sql_file over sql_content and repository_dispatch payload', async () => {
    const fs = {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue('SELECT id FROM file_table;'),
    };
    const path = {
      resolve: vi.fn((p) => `/workspace/${p}`),
    };
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'postgres';
      if (name === 'sql_file') return 'examples/mixed_postgres.sql';
      if (name === 'sql_content') return 'SELECT id FROM input_table;';
      if (name === 'db_password') return 'secret';
      return '';
    });
    github.context.payload = {
      client_payload: {
        sql_code: 'SELECT id FROM payload_table;',
      },
    };

    await run(deps({ fs, path }));

    expect(path.resolve).toHaveBeenCalledWith('examples/mixed_postgres.sql');
    expect(fs.readFileSync).toHaveBeenCalledWith('/workspace/examples/mixed_postgres.sql', 'utf8');
    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT id FROM file_table;', 'postgres');
  });

  it('prefers sql_content input over repository_dispatch payload', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'postgres';
      if (name === 'sql_content') return 'SELECT id FROM input_table;';
      if (name === 'db_password') return 'secret';
      return '';
    });
    github.context.payload = {
      client_payload: {
        engine: 'postgresql',
        sql_code: 'SELECT * FROM orders;',
      },
    };

    await run(deps());

    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT id FROM input_table;', 'postgresql');
  });

  it('uses repository_dispatch payload when inputs are empty', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'postgres';
      if (name === 'db_password') return 'secret';
      return '';
    });
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

  it('fails when a live engine is missing db_password', async () => {
    for (const engine of ['postgres', 'mysql', 'mssql']) {
      core.setFailed.mockClear();
      PostgresAnalyzer.mockClear();
      MySQLAnalyzer.mockClear();
      MssqlAnalyzer.mockClear();
      core.getInput.mockImplementation((name) => {
        if (name === 'engine') return engine;
        if (name === 'sql_content') return 'SELECT 1;';
        return '';
      });

      await run(deps());

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('db_password is required'),
      );
      expect(PostgresAnalyzer).not.toHaveBeenCalled();
      expect(MySQLAnalyzer).not.toHaveBeenCalled();
      expect(MssqlAnalyzer).not.toHaveBeenCalled();
    }
  });

  it('runs mysql analysis with default mysql connection inputs', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'mysql';
      if (name === 'sql_content') return 'SELECT 1;';
      if (name === 'db_password') return 'secret';
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
      if (name === 'db_password') return 'secret';
      return '';
    });

    await run(deps());

    expect(PostgresAnalyzer).toHaveBeenCalled();
  });

  it('runs mssql analysis with SQL Server defaults', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'mssql';
      if (name === 'sql_content') return 'SELECT 1;';
      if (name === 'db_password') return 'secret';
      return '';
    });

    await run(deps());

    expect(MssqlAnalyzer).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 1433,
        user: 'sa',
        password: 'secret',
      }),
    );
    expect(mssqlAnalyzer.testConnection).toHaveBeenCalled();
    expect(mssqlAnalyzer.analyzeQuery).toHaveBeenCalled();
    expect(mssqlAnalyzer.close).toHaveBeenCalled();
  });

  it('runs BigQuery as static-only without opening a database connection', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'bigquery';
      if (name === 'sql_content') return 'SELECT 1;';
      return '';
    });

    await run(deps());

    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT 1;', 'bigquery');
    expect(generateMarkdownReport).toHaveBeenCalledWith(
      expect.objectContaining({
        dynamicResult: expect.objectContaining({
          executed: false,
          reason: expect.stringContaining('static dialect linting only'),
        }),
      }),
    );
    expect(PostgresAnalyzer).not.toHaveBeenCalled();
    expect(MySQLAnalyzer).not.toHaveBeenCalled();
    expect(SqliteAnalyzer).not.toHaveBeenCalled();
    expect(MssqlAnalyzer).not.toHaveBeenCalled();
  });

  it('fails unknown engines before analysis and lists allowed values', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'oracle';
      if (name === 'sql_content') return 'SELECT 1;';
      return '';
    });

    await run(deps());

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/Unknown engine "oracle".*Allowed values:/),
    );
    expect(analyzeStaticSQL).not.toHaveBeenCalled();
    expect(generateMarkdownReport).not.toHaveBeenCalled();
    expect(PostgresAnalyzer).not.toHaveBeenCalled();
    expect(MySQLAnalyzer).not.toHaveBeenCalled();
    expect(SqliteAnalyzer).not.toHaveBeenCalled();
    expect(MssqlAnalyzer).not.toHaveBeenCalled();
  });

  it('fails a non-numeric db_port before connecting', async () => {
    core.getInput.mockImplementation((name) => {
      const values = {
        engine: 'postgres',
        sql_content: 'SELECT 1;',
        db_password: 'secret',
        db_port: 'abc',
      };
      return values[name] || '';
    });

    await run(deps());

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid db_port "abc"'),
    );
    expect(analyzeStaticSQL).not.toHaveBeenCalled();
    expect(postgresAnalyzer.testConnection).not.toHaveBeenCalled();
    expect(PostgresAnalyzer).not.toHaveBeenCalled();
  });

  it('marks the action as failed when summary writing throws', async () => {
    core.summary.addRaw.mockReturnValue({
      write: vi.fn().mockRejectedValue(new Error('summary failed')),
    });

    await run(deps());

    expect(core.setFailed).toHaveBeenCalledWith('SQL Optima Action failed: summary failed');
    expect(postgresAnalyzer.close).toHaveBeenCalled();
  });

  it('exposes issue_count and highest_severity without failing when fail_on_severity is none', async () => {
    analyzeStaticSQL.mockReturnValue([
      { type: 'MISSING_PRIMARY_KEY', severity: 'HIGH' },
      { type: 'WILDCARD_SELECT', severity: 'LOW' },
    ]);

    await run(deps());

    expect(core.setOutput).toHaveBeenCalledWith('issue_count', '2');
    expect(core.setOutput).toHaveBeenCalledWith('highest_severity', 'HIGH');
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('fails the action when findings meet fail_on_severity', async () => {
    analyzeStaticSQL.mockReturnValue([
      { type: 'MISSING_PRIMARY_KEY', severity: 'HIGH' },
    ]);
    core.getInput.mockImplementation((name) => {
      const values = {
        engine: 'postgres',
        sql_content: 'SELECT 1;',
        db_password: 'secret',
        fail_on_severity: 'high',
      };
      return values[name] || '';
    });

    await run(deps());

    expect(core.setOutput).toHaveBeenCalledWith('issue_count', '1');
    expect(core.setOutput).toHaveBeenCalledWith('highest_severity', 'HIGH');
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('fail_on_severity=high'),
    );
  });

  it('fails the action when findings match fail_on_types', async () => {
    analyzeStaticSQL.mockReturnValue([
      { type: 'WILDCARD_SELECT', severity: 'LOW' },
    ]);
    core.getInput.mockImplementation((name) => {
      const values = {
        engine: 'sqlite',
        sql_content: 'SELECT * FROM t;',
        fail_on_severity: 'none',
        fail_on_types: 'WILDCARD_SELECT',
      };
      return values[name] || '';
    });

    await run(deps());

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('fail_on_types'),
    );
  });
});

