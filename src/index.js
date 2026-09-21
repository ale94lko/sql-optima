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
  const formatter = {
    ...require('./formatter'),
    ...(overrides.formatter || {}),
  };
  const {
    generateMarkdownReport,
    generateCompactJobSummary,
    normalizeJobSummaryMode,
  } = formatter;
  const sqlUtils = overrides.sqlUtils || require('./sqlUtils');
  const { resolveEngineDefaults, isStaticOnlyEngine, requiresLivePassword, splitStatements } =
    sqlUtils;
  const inputValidation = overrides.inputValidation || require('./inputValidation');
  const { validateActionInputs, resolveSqlFileWithinWorkspace } = inputValidation;
  const severityGate = overrides.severityGate || require('./severityGate');
  const { evaluateSeverityGate } = severityGate;
  const { createLogger } = overrides.loggerModule || require('./logger');
  const log = overrides.logger || createLogger({ core });

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

    let jobSummaryMode;
    try {
      jobSummaryMode = normalizeJobSummaryMode(core.getInput('job_summary') || 'full');
    } catch (modeError) {
      core.setFailed(modeError.message);
      return;
    }

    // 3. Resolve SQL source: sql_file > sql_content > repository_dispatch payload
    let sqlContent = '';
    if (sqlFile) {
      const pathCheck = resolveSqlFileWithinWorkspace(sqlFile, {
        pathModule: path,
        workspaceRoot: process.env.GITHUB_WORKSPACE || process.cwd(),
      });
      if (!pathCheck.ok) {
        core.setFailed(pathCheck.error);
        return;
      }
      const resolvedPath = pathCheck.resolvedPath;
      if (!fs.existsSync(resolvedPath)) {
        core.setFailed(`SQL file not found: ${sqlFile}`);
        return;
      }
      sqlContent = fs.readFileSync(resolvedPath, 'utf8');
      log.info('Loaded SQL from file', {
        engine,
        phase: 'load',
        sqlFile,
        statementCount: splitStatements(sqlContent).length,
      });
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

    const statementCount = splitStatements(sqlContent).length;
    log.info('Starting SQL Optima analysis', {
      engine,
      phase: 'start',
      statementCount,
    });

    // 4. Execute Static AST Analysis
    log.info('Running static AST analysis', { engine, phase: 'static', statementCount });
    const staticIssues = analyzeStaticSQL(sqlContent, engine, {
      sourcePath: sqlFile || null,
    });
    log.info('Static analysis complete', {
      engine,
      phase: 'static',
      issueCount: staticIssues.length,
      statementCount,
    });

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

    const loggerDeps = { logger: log };

    // 6. Select and initialize the DB analyzer engine
    if (
      engine === 'postgres' ||
      engine === 'postgresql' ||
      engine === 'cockroach' ||
      engine === 'cockroachdb' ||
      engine === 'aurora-postgres' ||
      engine === 'aurora_postgresql'
    ) {
      dbAnalyzer = new PostgresAnalyzer(dbConfig, loggerDeps);
    } else if (engine === 'mysql' || engine === 'mariadb' || engine === 'aurora-mysql') {
      dbAnalyzer = new MySQLAnalyzer(dbConfig, loggerDeps);
    } else if (engine === 'sqlite' || engine === 'sqlite3') {
      dbAnalyzer = new SqliteAnalyzer(dbConfig, loggerDeps);
    } else if (
      engine === 'mssql' ||
      engine === 'sqlserver' ||
      engine === 'sql-server' ||
      engine === 'transactsql' ||
      engine === 'tsql'
    ) {
      dbAnalyzer = new MssqlAnalyzer(dbConfig, loggerDeps);
    }

    // 7. Execute Dynamic Analysis if a supported engine analyzer is available
    let dynamicResult = { executed: false, issues: [] };

    if (dbAnalyzer) {
      try {
        log.info('Connecting to database service', {
          engine,
          phase: 'connect',
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
        });
        await dbAnalyzer.testConnection();
        log.info('Connection established; running EXPLAIN / SHOWPLAN', {
          engine,
          phase: 'dynamic',
          statementCount,
        });

        dynamicResult = await dbAnalyzer.analyzeQuery(sqlContent);
        log.info('Dynamic analysis finished', {
          engine,
          phase: 'dynamic',
          executed: Boolean(dynamicResult.executed),
          issueCount: (dynamicResult.issues || []).length,
        });
      } catch (dbError) {
        log.warn('Skipping dynamic analysis', {
          engine,
          phase: 'dynamic',
          error: dbError.message,
        });
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
      log.info(dynamicResult.reason, { engine, phase: 'dynamic', executed: false });
    } else {
      dynamicResult = {
        executed: false,
        reason: `Dynamic analysis for engine "${engine}" is not currently supported.`,
        issues: [],
      };
      log.info(dynamicResult.reason, { engine, phase: 'dynamic', executed: false });
    }

    // 8. Generate Markdown Report (compact for Step Summary; full for file / output)
    log.info('Generating markdown summary report', {
      engine,
      phase: 'report',
      jobSummary: jobSummaryMode,
    });
    const summaryReport = generateMarkdownReport({
      engine,
      sqlContent,
      staticIssues,
      dynamicResult,
    });
    const fullReport = generateMarkdownReport({
      engine,
      sqlContent,
      staticIssues,
      dynamicResult,
      embedLimits: null,
    });

    const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
    const reportPath = path.join(workspaceRoot, 'sql-optima-report.md');
    fs.writeFileSync(reportPath, fullReport, 'utf8');
    log.info('Wrote full markdown report', {
      engine,
      phase: 'report',
      reportPath: 'sql-optima-report.md',
      summaryBytes: Buffer.byteLength(summaryReport, 'utf8'),
      fullBytes: Buffer.byteLength(fullReport, 'utf8'),
    });

    const allIssues = [
      ...staticIssues,
      ...(dynamicResult.issues || []),
    ];
    const gate = evaluateSeverityGate({
      issues: allIssues,
      failOnSeverity: core.getInput('fail_on_severity') || 'none',
      failOnTypes: core.getInput('fail_on_types') || '',
    });

    log.info('Severity gate evaluated', {
      engine,
      phase: 'gate',
      issueCount: gate.issueCount,
      highestSeverity: gate.highestSeverity,
      shouldFail: gate.shouldFail,
    });

    // 9. Output to GitHub Step Summary ($GITHUB_STEP_SUMMARY) and Action Outputs
    if (jobSummaryMode !== 'none') {
      const summaryBody =
        jobSummaryMode === 'compact'
          ? generateCompactJobSummary({
              engine,
              issueCount: gate.issueCount,
              highestSeverity: gate.highestSeverity,
              reportPath: 'sql-optima-report.md',
            })
          : summaryReport;
      try {
        await core.summary.addRaw(summaryBody).write();
      } catch (summaryError) {
        log.warn('Failed to write GitHub Step Summary; full report is in sql-optima-report.md', {
          engine,
          phase: 'report',
          jobSummary: jobSummaryMode,
          error: summaryError.message,
        });
      }
    } else {
      log.info('Skipping GitHub Step Summary (job_summary=none)', {
        engine,
        phase: 'report',
      });
    }
    // Keep the Action output compact — large scripts exceed GitHub output limits.
    core.setOutput('report', summaryReport);
    core.setOutput('report_path', 'sql-optima-report.md');
    core.setOutput('issue_count', String(gate.issueCount));
    core.setOutput('highest_severity', gate.highestSeverity);

    if (gate.shouldFail) {
      core.setFailed(gate.reason);
      return;
    }

    log.info('SQL Optima analysis completed', {
      engine,
      phase: 'done',
      issueCount: gate.issueCount,
      highestSeverity: gate.highestSeverity,
    });
  } catch (error) {
    log.error('SQL Optima Action failed', {
      phase: 'error',
      error: error.message,
    });
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
