/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

const {
  ALLOWED_ENGINES,
  parseActionInputs,
  engineSchema,
  dbPortSchema,
} = require('./inputSchema');

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
  const result = engineSchema.safeParse(engine);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues[0]?.message || result.error.message,
    };
  }
  return { ok: true, engine: result.data };
}

/**
 * Validates db_port when the caller provided a value. Empty means "use engine default".
 * @param {string|number} dbPort
 * @returns {{ ok: true, port?: number } | { ok: false, error: string }}
 */
function validateDbPort(dbPort) {
  const result = dbPortSchema.safeParse(dbPort);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues[0]?.message || result.error.message,
    };
  }
  const raw = result.data;
  if (raw === '') {
    return { ok: true };
  }
  return { ok: true, port: Number.parseInt(raw, 10) };
}

/**
 * Validates Action inputs through the formal Zod schema before analysis or DB connect.
 * @param {{ engine?: string, dbPort?: string|number, sqlFile?: string, jobSummary?: string }} inputs
 * @returns {{
 *   ok: true,
 *   engine: string,
 *   port?: number,
 *   sqlFile?: string,
 *   jobSummary?: 'full'|'compact'|'none',
 * } | { ok: false, error: string }}
 */
function validateActionInputs(inputs = {}) {
  return parseActionInputs(inputs);
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
