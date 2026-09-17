/**
 * Shared SQL statement helpers for dynamic analyzers.
 */

/**
 * Splits a SQL script into trimmed statements.
 * @param {string} sql
 * @returns {string[]}
 */
function splitStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Removes leading line comments from a statement for classification.
 * @param {string} statement
 * @returns {string}
 */
function stripLeadingComments(statement) {
  return statement
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n')
    .trim();
}

/**
 * Extracts the last SELECT or WITH statement from a SQL script.
 * @param {string} sqlQuery
 * @returns {string|null}
 */
function extractSelectStatement(sqlQuery) {
  const statements = splitStatements(sqlQuery);

  for (let i = statements.length - 1; i >= 0; i -= 1) {
    const trimmed = stripLeadingComments(statements[i]).toLowerCase();
    if (trimmed.startsWith('select') || trimmed.startsWith('with')) {
      return stripLeadingComments(statements[i]);
    }
  }

  return null;
}

/**
 * Returns whether a statement is blocked from auto-apply (destructive / admin).
 * @param {string} statement
 * @returns {boolean}
 */
function isBlockedSchemaStatement(statement) {
  const normalized = stripLeadingComments(statement).toLowerCase().replace(/\s+/g, ' ');
  return (
    normalized.startsWith('drop database') ||
    normalized.startsWith('drop schema') ||
    normalized.startsWith('create database') ||
    normalized.startsWith('create schema') ||
    normalized.startsWith('grant ') ||
    normalized.startsWith('revoke ') ||
    normalized.startsWith('alter system')
  );
}

/**
 * Returns DDL-like statements safe to apply before EXPLAIN (CREATE / INSERT / etc.).
 * @param {string} sqlQuery
 * @returns {string[]}
 */
function extractSchemaStatements(sqlQuery) {
  return splitStatements(sqlQuery).filter((statement) => {
    if (isBlockedSchemaStatement(statement)) {
      return false;
    }

    const normalized = stripLeadingComments(statement).toLowerCase();
    return (
      normalized.startsWith('create') ||
      normalized.startsWith('insert') ||
      normalized.startsWith('alter table') ||
      normalized.startsWith('drop table') ||
      normalized.startsWith('pragma')
    );
  });
}

/**
 * Maps user-facing engine names to node-sql-parser dialects.
 * @param {string} engine
 * @returns {string}
 */
function resolveParserDialect(engine) {
  const normalized = (engine || 'postgres').toLowerCase();

  if (
    normalized === 'postgres' ||
    normalized === 'postgresql' ||
    normalized === 'cockroach' ||
    normalized === 'cockroachdb' ||
    normalized === 'aurora-postgres' ||
    normalized === 'aurora_postgresql'
  ) {
    return 'postgresql';
  }

  if (normalized === 'sqlite' || normalized === 'sqlite3') {
    return 'sqlite';
  }

  if (
    normalized === 'mssql' ||
    normalized === 'sqlserver' ||
    normalized === 'sql-server' ||
    normalized === 'transactsql' ||
    normalized === 'tsql'
  ) {
    return 'transactsql';
  }

  if (normalized === 'bigquery' || normalized === 'bq') {
    return 'bigquery';
  }

  if (normalized === 'snowflake') {
    return 'snowflake';
  }

  // mysql, mariadb, aurora-mysql, etc.
  return 'mysql';
}

/**
 * Engines that only support static analysis (no live EXPLAIN adapter yet).
 * @param {string} engine
 * @returns {boolean}
 */
function isStaticOnlyEngine(engine) {
  const normalized = (engine || '').toLowerCase();
  return (
    normalized === 'bigquery' ||
    normalized === 'bq' ||
    normalized === 'snowflake'
  );
}

/**
 * Default connection hints per engine family.
 * @param {string} engine
 * @returns {{ port: string, user: string, password: string }}
 */
function resolveEngineDefaults(engine) {
  const normalized = (engine || 'postgres').toLowerCase();

  if (normalized === 'mysql' || normalized === 'mariadb' || normalized === 'aurora-mysql') {
    return { port: '3306', user: 'root', password: 'root' };
  }

  if (normalized === 'sqlite' || normalized === 'sqlite3') {
    return { port: '0', user: '', password: '' };
  }

  if (
    normalized === 'mssql' ||
    normalized === 'sqlserver' ||
    normalized === 'sql-server' ||
    normalized === 'transactsql' ||
    normalized === 'tsql'
  ) {
    return { port: '1433', user: 'sa', password: 'Your_strong_Password123' };
  }

  return { port: '5432', user: 'postgres', password: 'root' };
}

module.exports = {
  splitStatements,
  extractSelectStatement,
  extractSchemaStatements,
  stripLeadingComments,
  isBlockedSchemaStatement,
  isStaticOnlyEngine,
  resolveParserDialect,
  resolveEngineDefaults,
};
