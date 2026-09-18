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
  if (!portResult.ok) {
    return portResult;
  }
  return { ok: true, engine: engineResult.engine, port: portResult.port };
}

module.exports = {
  ALLOWED_ENGINES,
  normalizeEngine,
  validateEngine,
  validateDbPort,
  validateActionInputs,
};
