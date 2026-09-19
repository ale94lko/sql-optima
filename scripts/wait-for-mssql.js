/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Wait until SQL Server accepts connections, then ensure the target database exists.
 *
 * The official `mcr.microsoft.com/mssql/server` image has no reliable Docker
 * HEALTHCHECK in GitHub Actions service containers, so this job polls instead.
 *
 * Env (job-level; in-container services only):
 *   MSSQL_SA_PASSWORD  — required; must meet SQL Server complexity rules
 *   MSSQL_HOST         — default 127.0.0.1 (mapped service port)
 *   MSSQL_PORT         — default 1433
 *   MSSQL_USER         — default sa
 *   MSSQL_DATABASE     — default test_db (created on master if missing)
 */

const sql = require('mssql');

const DEFAULT_ATTEMPTS = 40;
const DEFAULT_DELAY_MS = 3000;

/**
 * @param {object} [options]
 * @param {typeof sql} [options.sqlClient]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {{ log?: Function, error?: Function }} [options.logger]
 * @param {() => Promise<void>} [options.sleep]
 * @returns {Promise<void>}
 */
async function waitForMssql({
  sqlClient = sql,
  env = process.env,
  logger = console,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const password = String(env.MSSQL_SA_PASSWORD || '').trim();
  if (!password) {
    throw new Error('MSSQL_SA_PASSWORD is required to wait for SQL Server');
  }

  const host = env.MSSQL_HOST || '127.0.0.1';
  const port = Number.parseInt(env.MSSQL_PORT || '1433', 10);
  const user = env.MSSQL_USER || 'sa';
  const database = env.MSSQL_DATABASE || 'test_db';
  const attempts = Number.parseInt(env.MSSQL_READY_ATTEMPTS || String(DEFAULT_ATTEMPTS), 10);
  const delayMs = Number.parseInt(env.MSSQL_READY_DELAY_MS || String(DEFAULT_DELAY_MS), 10);

  const config = {
    server: host,
    port,
    user,
    password,
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 5000,
  };

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
    throw new Error(`Unsafe MSSQL_DATABASE name: ${database}`);
  }

  for (let i = 0; i < attempts; i += 1) {
    try {
      const pool = await sqlClient.connect(config);
      await pool.request().query(`IF DB_ID('${database}') IS NULL CREATE DATABASE ${database};`);
      await pool.close();
      logger.log('SQL Server ready');
      return;
    } catch (error) {
      logger.log(`Waiting for SQL Server (${i + 1}/${attempts}): ${error.message}`);
      await sleep(delayMs);
    }
  }

  throw new Error('SQL Server did not become ready in time');
}

module.exports = { waitForMssql, DEFAULT_ATTEMPTS, DEFAULT_DELAY_MS };

if (require.main === module) {
  waitForMssql().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
