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
      error: vi.fn(),
      debug: vi.fn(),
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

    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT name FROM users;', 'mariadb', { sourcePath: null });
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
    const path = require('node:path');
    const workspace = path.resolve('/tmp/sql-optima-ws');
    const expected = path.resolve(workspace, 'missing.sql');
    const fs = {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn(),
    };
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'postgres';
      if (name === 'sql_file') return 'missing.sql';
      return '';
    });
    const prev = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = workspace;
    try {
      await run(deps({ fs, path }));
    } finally {
      if (prev === undefined) delete process.env.GITHUB_WORKSPACE;
      else process.env.GITHUB_WORKSPACE = prev;
    }

    expect(core.setFailed).toHaveBeenCalledWith('SQL file not found: missing.sql');
    expect(fs.existsSync).toHaveBeenCalledWith(expected);
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(analyzeStaticSQL).not.toHaveBeenCalled();
  });

  it('rejects sql_file paths that escape the workspace', async () => {
    const fs = {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    };
    core.getInput.mockImplementation((name) => {
      if (name === 'engine') return 'postgres';
      if (name === 'sql_file') return '../outside.sql';
      return '';
    });
    const prev = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = require('node:path').resolve('/tmp/sql-optima-ws');
    try {
      await run(deps({ fs }));
    } finally {
      if (prev === undefined) delete process.env.GITHUB_WORKSPACE;
      else process.env.GITHUB_WORKSPACE = prev;
    }

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('sql_file must be inside the workspace'),
    );
    expect(fs.existsSync).not.toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(analyzeStaticSQL).not.toHaveBeenCalled();
  });

  it('prefers sql_file over sql_content and repository_dispatch payload', async () => {
    const path = require('node:path');
    const workspace = path.resolve('/tmp/sql-optima-ws');
    const expected = path.resolve(workspace, 'examples/mixed_postgres.sql');
    const fs = {
      existsSync: vi.fn((p) => p === expected),
      readFileSync: vi.fn().mockReturnValue('SELECT id FROM file_table;'),
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
    const prev = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = workspace;
    try {
      await run(deps({ fs, path }));
    } finally {
      if (prev === undefined) delete process.env.GITHUB_WORKSPACE;
      else process.env.GITHUB_WORKSPACE = prev;
    }

    expect(fs.readFileSync).toHaveBeenCalledWith(expected, 'utf8');
    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT id FROM file_table;', 'postgres', { sourcePath: 'examples/mixed_postgres.sql' });
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

    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT id FROM input_table;', 'postgresql', { sourcePath: null });
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

    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT * FROM orders;', 'postgresql', { sourcePath: null });
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

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('"msg":"Skipping dynamic analysis"'),
    );
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('"error":"db down"'),
    );
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
      expect.objectContaining({
        logger: expect.objectContaining({
          info: expect.any(Function),
          warn: expect.any(Function),
        }),
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

    expect(analyzeStaticSQL).toHaveBeenCalledWith('SELECT 1;', 'bigquery', { sourcePath: null });
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

  it('continues when summary writing throws and still writes the report file', async () => {
    core.summary.addRaw.mockReturnValue({
      write: vi.fn().mockRejectedValue(new Error('summary failed')),
    });

    await run(deps());

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('report_path', 'sql-optima-report.md');
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write GitHub Step Summary'),
    );
    expect(postgresAnalyzer.close).toHaveBeenCalled();
  });

  it('skips Step Summary when job_summary is none but still sets outputs', async () => {
    core.getInput.mockImplementation((name) => {
      const values = {
        engine: 'postgres',
        sql_content: 'SELECT id FROM users;',
        db_password: 'root',
        job_summary: 'none',
      };
      return values[name] || '';
    });

    await run(deps());

    expect(core.summary.addRaw).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('report', '## report');
    expect(core.setOutput).toHaveBeenCalledWith('report_path', 'sql-optima-report.md');
    expect(core.setOutput).toHaveBeenCalledWith('issue_count', '1');
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('writes a compact Step Summary when job_summary is compact', async () => {
    analyzeStaticSQL.mockReturnValue([
      { type: 'WILDCARD_SELECT', severity: 'MEDIUM' },
    ]);
    core.getInput.mockImplementation((name) => {
      const values = {
        engine: 'postgres',
        sql_content: 'SELECT * FROM users;',
        db_password: 'root',
        job_summary: 'compact',
      };
      return values[name] || '';
    });

    await run(deps());

    expect(core.summary.addRaw).toHaveBeenCalledTimes(1);
    const body = core.summary.addRaw.mock.calls[0][0];
    expect(body).toContain('## SQL Optima');
    expect(body).toContain('`1`');
    expect(body).toContain('`MEDIUM`');
    expect(body).toContain('sql-optima-report.md');
    expect(body).not.toBe('## report');
    expect(core.setOutput).toHaveBeenCalledWith('report', '## report');
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('fails early on invalid job_summary', async () => {
    core.getInput.mockImplementation((name) => {
      const values = {
        engine: 'postgres',
        sql_content: 'SELECT 1;',
        db_password: 'root',
        job_summary: 'verbose',
      };
      return values[name] || '';
    });

    await run(deps());

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid job_summary'),
    );
    expect(analyzeStaticSQL).not.toHaveBeenCalled();
    expect(core.summary.addRaw).not.toHaveBeenCalled();
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

