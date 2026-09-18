/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Main orchestrator function for SQL Optima Action.
 * @param {Object} [overrides] - Optional dependency overrides for unit tests.
 */
async function run(overrides = {}) {
  const core = overrides.core || require('@actions/core');
  const github = overrides.github || require('@actions/github');
  const fs = overrides.fs || require('fs');
  const path = overrides.path || require('path');
  const { analyzeStaticSQL } =
    overrides.staticAnalyzer || require('./analyzer/static');
  const PostgresAnalyzer = overrides.PostgresAnalyzer || require('./db/postgres');
  const MySQLAnalyzer = overrides.MySQLAnalyzer || require('./db/mysql');
  const SqliteAnalyzer = overrides.SqliteAnalyzer || require('./db/sqlite');
  const MssqlAnalyzer = overrides.MssqlAnalyzer || require('./db/mssql');
  const { generateMarkdownReport } =
    overrides.formatter || require('./formatter');
  const sqlUtils = overrides.sqlUtils || require('./sqlUtils');
  const { resolveEngineDefaults, isStaticOnlyEngine, requiresLivePassword } =
    sqlUtils;
  const inputValidation = overrides.inputValidation || require('./inputValidation');
  const { validateActionInputs } = inputValidation;
  const severityGate = overrides.severityGate || require('./severityGate');
  const { evaluateSeverityGate } = severityGate;

  let dbAnalyzer = null;

  try {
    // 1. Extract inputs from GitHub Actions environment
    let engine = core.getInput('engine') || 'postgres';
    const sqlFile = (core.getInput('sql_file') || '').trim();
    const sqlContentInput = core.getInput('sql_content') || '';

    // 2. Optional engine override from repository_dispatch payload
    const payload = github.context.payload.client_payload;
    if (payload) {
      engine = payload.engine || engine;
    }
    const payloadSql = payload
      ? payload.sql_code || payload.sql_content || ''
      : '';

    engine = String(engine || 'postgres').trim().toLowerCase();
    const dbPortInput = (core.getInput('db_port') || '').trim();
    const inputCheck = validateActionInputs({ engine, dbPort: dbPortInput });
    if (!inputCheck.ok) {
      core.setFailed(inputCheck.error);
      return;
    }
    engine = inputCheck.engine;

    // 3. Resolve SQL source: sql_file > sql_content > repository_dispatch payload
    let sqlContent = '';
    if (sqlFile) {
      const resolvedPath = path.resolve(sqlFile);
      if (!fs.existsSync(resolvedPath)) {
        core.setFailed(`SQL file not found: ${sqlFile}`);
        return;
      }
      sqlContent = fs.readFileSync(resolvedPath, 'utf8');
      core.info(`Loaded SQL from file: ${sqlFile}`);
    } else if (sqlContentInput.trim() !== '') {
      sqlContent = sqlContentInput;
    } else if (String(payloadSql).trim() !== '') {
      sqlContent = payloadSql;
    }

    if (!sqlContent || sqlContent.trim() === '') {
      core.setFailed(
        'No SQL content provided to analyze. Pass "sql_file", "sql_content", or a repository_dispatch payload.',
      );
      return;
    }

    core.info(`Starting SQL Optima analysis for engine: ${engine}`);

    // 4. Execute Static AST Analysis
    core.info('Running static AST analysis...');
    const staticIssues = analyzeStaticSQL(sqlContent, engine);
    core.info(`Static analysis complete. Found ${staticIssues.length} potential issue(s).`);

    // 5. Configure Database connection options (no embedded password defaults)
    const defaults = resolveEngineDefaults(engine);
    const password = (core.getInput('db_password') || '').trim();
    if (requiresLivePassword(engine) && !password) {
      core.setFailed(
        `db_password is required for live engine "${engine}". Pass it as an Action input; sql-optima does not embed default database passwords.`,
      );
      return;
    }

    const dbConfig = {
      host: core.getInput('db_host') || 'localhost',
      port: parseInt(dbPortInput || defaults.port, 10),
      database: core.getInput('db_name') || 'test_db',
      user: core.getInput('db_user') || defaults.user,
      password,
    };

    // 6. Select and initialize the DB analyzer engine
    if (
      engine === 'postgres' ||
      engine === 'postgresql' ||
      engine === 'cockroach' ||
      engine === 'cockroachdb' ||
      engine === 'aurora-postgres' ||
      engine === 'aurora_postgresql'
    ) {
      dbAnalyzer = new PostgresAnalyzer(dbConfig);
    } else if (engine === 'mysql' || engine === 'mariadb' || engine === 'aurora-mysql') {
      dbAnalyzer = new MySQLAnalyzer(dbConfig);
    } else if (engine === 'sqlite' || engine === 'sqlite3') {
      dbAnalyzer = new SqliteAnalyzer(dbConfig);
    } else if (
      engine === 'mssql' ||
      engine === 'sqlserver' ||
      engine === 'sql-server' ||
      engine === 'transactsql' ||
      engine === 'tsql'
    ) {
      dbAnalyzer = new MssqlAnalyzer(dbConfig);
    }

    // 7. Execute Dynamic Analysis if a supported engine analyzer is available
    let dynamicResult = { executed: false, issues: [] };

    if (dbAnalyzer) {
      try {
        core.info(`Connecting to ${engine.toUpperCase()} database service...`);
        await dbAnalyzer.testConnection();
        core.info('Connection established. Executing EXPLAIN / SHOWPLAN...');

        dynamicResult = await dbAnalyzer.analyzeQuery(sqlContent);
      } catch (dbError) {
        core.warning(`Skipping dynamic analysis: ${dbError.message}`);
        dynamicResult = {
          executed: false,
          error: dbError.message,
          issues: [],
        };
      }
    } else if (isStaticOnlyEngine(engine)) {
      dynamicResult = {
        executed: false,
        reason: `Engine "${engine}" supports static dialect linting only (no live EXPLAIN adapter yet).`,
        issues: [],
      };
      core.info(dynamicResult.reason);
    } else {
      dynamicResult = {
        executed: false,
        reason: `Dynamic analysis for engine "${engine}" is not currently supported.`,
        issues: [],
      };
    }

    // 8. Generate Markdown Report
    core.info('Generating markdown summary report...');
    const markdownReport = generateMarkdownReport({
      engine,
      sqlContent,
      staticIssues,
      dynamicResult,
    });

    // 9. Output to GitHub Step Summary ($GITHUB_STEP_SUMMARY) and Action Outputs
    await core.summary.addRaw(markdownReport).write();
    core.setOutput('report', markdownReport);

    const allIssues = [
      ...staticIssues,
      ...(dynamicResult.issues || []),
    ];
    const gate = evaluateSeverityGate({
      issues: allIssues,
      failOnSeverity: core.getInput('fail_on_severity') || 'none',
      failOnTypes: core.getInput('fail_on_types') || '',
    });

    core.setOutput('issue_count', String(gate.issueCount));
    core.setOutput('highest_severity', gate.highestSeverity);

    if (gate.shouldFail) {
      core.setFailed(gate.reason);
      return;
    }

    core.info('SQL Optima analysis successfully completed and posted to Step Summary.');
  } catch (error) {
    core.setFailed(`SQL Optima Action failed: ${error.message}`);
  } finally {
    // Gracefully release Database connection pool
    if (dbAnalyzer) {
      await dbAnalyzer.close();
    }
  }
}

module.exports = { run };

if (require.main === module) {
  run();
}

