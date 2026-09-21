/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * CI helper: run the Action orchestrator against a live engine (INPUT_* env)
 * and fail when expected findings are missing.
 *
 * Used by the default-path `integration` job in `.github/workflows/ci.yml`.
 * Credentials come from the job env only (in-container service passwords).
 */

const DYNAMIC_EXECUTED_MARKER = '**Execution Time**';

/**
 * Parses Action `issue_count` output into a number.
 * @param {unknown} value
 * @returns {number}
 */
function parseIssueCount(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fails when a fixture that should produce findings reports none.
 * @param {{ issueCount?: unknown, fixture?: string, minCount?: number }} options
 * @returns {number}
 */
function assertExpectedFindings({ issueCount, fixture, minCount = 1 } = {}) {
  const n = parseIssueCount(issueCount);
  if (n < minCount) {
    throw new Error(
      `Expected at least ${minCount} finding(s) from ${fixture || 'fixture'} but issue_count=${issueCount}`,
    );
  }
  return n;
}

/**
 * Fails when the markdown report does not show a live EXPLAIN/SHOWPLAN run.
 * Static-only success is not enough for this job — it must talk to a real engine.
 * @param {{ report?: string, fixture?: string }} options
 */
function assertDynamicExecuted({ report, fixture } = {}) {
  const text = String(report || '');
  if (text.includes('⚠️ Execution Error')) {
    throw new Error(`Dynamic analysis failed for ${fixture || 'fixture'}`);
  }
  if (!text.includes(DYNAMIC_EXECUTED_MARKER)) {
    throw new Error(
      `Dynamic analysis did not execute against a live engine for ${fixture || 'fixture'}`,
    );
  }
}

/**
 * Wraps @actions/core so `setOutput` values can be asserted after `run()`.
 * @param {import('@actions/core')} core
 * @param {Record<string, string>} outputs
 * @param {{ failedMessage?: string }} state
 */
function wrapCore(core, outputs, state) {
  return {
    getInput: (name, options) => core.getInput(name, options),
    info: (message) => core.info(message),
    warning: (message) => core.warning(message),
    error: (message) => core.error(message),
    debug: (message) => (typeof core.debug === 'function' ? core.debug(message) : undefined),
    setFailed(message) {
      state.failedMessage = String(message);
      return core.setFailed(message);
    },
    setOutput(name, value) {
      outputs[name] = String(value);
      return core.setOutput(name, value);
    },
    summary: core.summary,
  };
}

/**
 * Runs the analyzer and asserts expected live-engine findings.
 * @param {{ runFn: Function, core: object, env?: NodeJS.ProcessEnv, log?: { info: Function } }} options
 * @returns {Promise<Record<string, string>>}
 */
async function runIntegration({ runFn, core, env = process.env, log = console } = {}) {
  if (typeof runFn !== 'function') {
    throw new Error('runFn is required');
  }
  if (!core) {
    throw new Error('core is required');
  }

  const outputs = {};
  const state = { failedMessage: null };
  await runFn({ core: wrapCore(core, outputs, state) });

  if (state.failedMessage) {
    throw new Error(state.failedMessage);
  }

  const fixture = String(env.INPUT_SQL_FILE || env.SQL_FILE || '').trim();
  assertExpectedFindings({ issueCount: outputs.issue_count, fixture });
  assertDynamicExecuted({ report: outputs.report, fixture });
  log.info(`OK: ${fixture || 'fixture'} produced issue_count=${outputs.issue_count}`);
  return outputs;
}

async function main() {
  const core = require('@actions/core');
  const { run } = require('../src/index');
  await runIntegration({ runFn: run, core });
}

module.exports = {
  DYNAMIC_EXECUTED_MARKER,
  parseIssueCount,
  assertExpectedFindings,
  assertDynamicExecuted,
  wrapCore,
  runIntegration,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
