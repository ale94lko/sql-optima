/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

/** Canonical and alias engine names accepted by the Action. */
const ALLOWED_ENGINES = Object.freeze([
  'aurora-mysql',
  'aurora-postgres',
  'aurora_postgresql',
  'bigquery',
  'bq',
  'cockroach',
  'cockroachdb',
  'mariadb',
  'mssql',
  'mysql',
  'postgres',
  'postgresql',
  'snowflake',
  'sql-server',
  'sqlite',
  'sqlite3',
  'sqlserver',
  'transactsql',
  'tsql',
]);

const ALLOWED_ENGINE_SET = new Set(ALLOWED_ENGINES);

/**
 * @param {string} engine
 * @returns {string}
 */
function normalizeEngine(engine) {
  return String(engine || '').trim().toLowerCase();
}

/**
 * @param {string} engine
 * @returns {{ ok: true, engine: string } | { ok: false, error: string }}
 */
function validateEngine(engine) {
  const normalized = normalizeEngine(engine);
  if (!normalized) {
    return {
      ok: false,
      error: `Invalid engine "". Allowed values: ${ALLOWED_ENGINES.join(', ')}.`,
    };
  }
  if (!ALLOWED_ENGINE_SET.has(normalized)) {
    return {
      ok: false,
      error: `Unknown engine "${normalized}". Allowed values: ${ALLOWED_ENGINES.join(', ')}.`,
    };
  }
  return { ok: true, engine: normalized };
}

/**
 * Validates db_port when the caller provided a value. Empty means "use engine default".
 * @param {string|number} dbPort
 * @returns {{ ok: true, port?: number } | { ok: false, error: string }}
 */
function validateDbPort(dbPort) {
  if (dbPort === undefined || dbPort === null) {
    return { ok: true };
  }
  const raw = String(dbPort).trim();
  if (raw === '') {
    return { ok: true };
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    return {
      ok: false,
      error: `Invalid db_port "${raw}". Provide a positive integer (1-65535), or omit it to use the engine default.`,
    };
  }
  const port = Number.parseInt(raw, 10);
  if (port > 65535) {
    return {
      ok: false,
      error: `Invalid db_port "${raw}". Provide a positive integer (1-65535), or omit it to use the engine default.`,
    };
  }
  return { ok: true, port };
}

/**
 * Validates Action inputs that must fail before analysis or DB connect.
 * @param {{ engine?: string, dbPort?: string|number }} inputs
 * @returns {{ ok: true, engine: string, port?: number } | { ok: false, error: string }}
 */
function validateActionInputs(inputs = {}) {
  const engineResult = validateEngine(inputs.engine);
  if (!engineResult.ok) {
    return engineResult;
  }
  const portResult = validateDbPort(inputs.dbPort);
  if (portResult.ok === false) {
    return portResult;
  }
  return { ok: true, engine: engineResult.engine, port: portResult.port };
}

/**
 * Resolves `sql_file` and ensures it stays inside the Action workspace (CWE-22).
 *
 * @param {string} sqlFile
 * @param {Object} [options]
 * @param {string} [options.workspaceRoot] - Defaults to GITHUB_WORKSPACE or cwd.
 * @param {typeof import('path')} [options.pathModule] - Injected path module for tests.
 * @returns {{ ok: true, resolvedPath: string, workspaceRoot: string } | { ok: false, error: string }}
 */
function resolveSqlFileWithinWorkspace(sqlFile, options = {}) {
  const pathMod = options.pathModule || require('path');
  const rawRoot =
    options.workspaceRoot !== undefined && options.workspaceRoot !== null
      ? options.workspaceRoot
      : process.env.GITHUB_WORKSPACE || process.cwd();
  const workspaceRoot = pathMod.resolve(String(rawRoot));
  const resolvedPath = pathMod.resolve(workspaceRoot, String(sqlFile || ''));
  const relative = pathMod.relative(workspaceRoot, resolvedPath);

  if (relative.startsWith('..') || pathMod.isAbsolute(relative)) {
    return {
      ok: false,
      error: `sql_file must be inside the workspace: ${sqlFile}`,
    };
  }

  return { ok: true, resolvedPath, workspaceRoot };
}

module.exports = {
  ALLOWED_ENGINES,
  normalizeEngine,
  validateEngine,
  validateDbPort,
  validateActionInputs,
  resolveSqlFileWithinWorkspace,
};
