/**
 * Main orchestrator function for SQL Optima Action.
 * @param {Object} [overrides] - Optional dependency overrides for unit tests.
 */
async function run(overrides = {}) {
  const core = overrides.core || require('@actions/core');
  const github = overrides.github || require('@actions/github');
  const { analyzeStaticSQL } =
    overrides.staticAnalyzer || require('./analyzer/static');
  const PostgresAnalyzer = overrides.PostgresAnalyzer || require('./db/postgres');
  const MySQLAnalyzer = overrides.MySQLAnalyzer || require('./db/mysql');
  const SqliteAnalyzer = overrides.SqliteAnalyzer || require('./db/sqlite');
  const MssqlAnalyzer = overrides.MssqlAnalyzer || require('./db/mssql');
  const { generateMarkdownReport } =
    overrides.formatter || require('./formatter');
  const sqlUtils = overrides.sqlUtils || require('./sqlUtils');
  const { resolveEngineDefaults, isStaticOnlyEngine } = sqlUtils;

  let dbAnalyzer = null;

  try {
    // 1. Extract inputs from GitHub Actions environment
    let engine = core.getInput('engine') || 'postgres';
    let sqlContent = core.getInput('sql_content');

    // 2. Check for payload parameters if triggered via repository_dispatch (GitHub API)
    const payload = github.context.payload.client_payload;
    if (payload) {
      engine = payload.engine || engine;
      sqlContent = payload.sql_code || payload.sql_content || sqlContent;
    }

    // Validate that SQL content is available
    if (!sqlContent || sqlContent.trim() === '') {
      core.setFailed('No SQL content provided to analyze. Pass "sql_content" input or API payload.');
      return;
    }

    engine = engine.toLowerCase();
    core.info(`Starting SQL Optima analysis for engine: ${engine}`);

    // 3. Execute Static AST Analysis
    core.info('Running static AST analysis...');
    const staticIssues = analyzeStaticSQL(sqlContent, engine);
    core.info(`Static analysis complete. Found ${staticIssues.length} potential issue(s).`);

    // 4. Configure Database connection options
    const defaults = resolveEngineDefaults(engine);
    const dbConfig = {
      host: core.getInput('db_host') || 'localhost',
      port: parseInt(core.getInput('db_port') || defaults.port, 10),
      database: core.getInput('db_name') || 'test_db',
      user: core.getInput('db_user') || defaults.user,
      password: core.getInput('db_password') || defaults.password || 'root',
    };

    // 5. Select and initialize the DB analyzer engine
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

    // 6. Execute Dynamic Analysis if a supported engine analyzer is available
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

    // 7. Generate Markdown Report
    core.info('Generating markdown summary report...');
    const markdownReport = generateMarkdownReport({
      engine,
      sqlContent,
      staticIssues,
      dynamicResult,
    });

    // 8. Output to GitHub Step Summary ($GITHUB_STEP_SUMMARY) and Action Outputs
    await core.summary.addRaw(markdownReport).write();
    core.setOutput('report', markdownReport);

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
