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
 * Extracts the last SELECT or WITH statement from a SQL script.
 * @param {string} sqlQuery
 * @returns {string|null}
 */
function extractSelectStatement(sqlQuery) {
  const statements = splitStatements(sqlQuery);

  for (let i = statements.length - 1; i >= 0; i -= 1) {
    const trimmed = statements[i].toLowerCase();
    if (trimmed.startsWith('select') || trimmed.startsWith('with')) {
      return statements[i];
    }
  }

  return null;
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
 * Returns DDL-like statements safe to apply before EXPLAIN (CREATE / INSERT / etc.).
 * @param {string} sqlQuery
 * @returns {string[]}
 */
function extractSchemaStatements(sqlQuery) {
  return splitStatements(sqlQuery).filter((statement) => {
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

  // mysql, mariadb, aurora-mysql, etc.
  return 'mysql';
}

/**
 * Default connection hints per engine family.
 * @param {string} engine
 * @returns {{ port: string, user: string }}
 */
function resolveEngineDefaults(engine) {
  const normalized = (engine || 'postgres').toLowerCase();

  if (normalized === 'mysql' || normalized === 'mariadb' || normalized === 'aurora-mysql') {
    return { port: '3306', user: 'root' };
  }

  if (normalized === 'sqlite' || normalized === 'sqlite3') {
    return { port: '0', user: '' };
  }

  return { port: '5432', user: 'postgres' };
}

module.exports = {
  splitStatements,
  extractSelectStatement,
  extractSchemaStatements,
  stripLeadingComments,
  resolveParserDialect,
  resolveEngineDefaults,
};
