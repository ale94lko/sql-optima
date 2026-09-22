/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Thin structured logger for GitHub Actions + unit tests.
 * Wraps `@actions/core` leveled APIs and emits one JSON object per line.
 * Never logs credential-like field values (redacted).
 */

const SENSITIVE_KEY =
  /^(password|passwd|pwd|secret|token|authorization|api[_-]?key|db_password|connection[_-]?string)$/i;

const CONNECTION_STRING_HINT =
  /(password\s*=|pwd\s*=|:\/\/[^/@]+:[^/@]+@)/i;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function looksSensitiveString(value) {
  return typeof value === 'string' && CONNECTION_STRING_HINT.test(value);
}

/**
 * Redact credential-like keys and connection strings from a fields object.
 * @param {Record<string, unknown>|undefined|null} fields
 * @returns {Record<string, unknown>}
 */
function redactFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return {};
  }

  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key) || looksSensitiveString(value)) {
      out[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactFields(/** @type {Record<string, unknown>} */ (value));
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} message
 * @param {Record<string, unknown>|undefined} fields
 * @returns {string}
 */
function formatLogLine(level, message, fields) {
  return JSON.stringify({
    level,
    msg: String(message ?? ''),
    ...redactFields(fields),
  });
}

/**
 * Create a leveled logger.
 *
 * @param {Object} [options]
 * @param {Pick<typeof import('@actions/core'), 'debug'|'info'|'warning'|'error'>} [options.core]
 * @param {(record: {level: string, msg: string, fields: Record<string, unknown>, line: string}) => void} [options.sink]
 *   Optional test sink that receives the structured record (already redacted).
 */
function createLogger(options = {}) {
  const core = options.core || require('@actions/core');
  const sink = options.sink;

  /**
   * @param {'debug'|'info'|'warn'|'error'} level
   * @param {string} message
   * @param {Record<string, unknown>} [fields]
   */
  function emit(level, message, fields = {}) {
    const safeFields = redactFields(fields);
    const line = formatLogLine(level, message, safeFields);
    if (typeof sink === 'function') {
      sink({ level, msg: String(message ?? ''), fields: safeFields, line });
    }

    switch (level) {
      case 'debug':
        core.debug(line);
        break;
      case 'warn':
        core.warning(line);
        break;
      case 'error':
        core.error(line);
        break;
      case 'info':
      default:
        core.info(line);
        break;
    }
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    /**
     * Structured failure telemetry for Action `setFailed` paths.
     * Always includes type, engine, phase, and message (credentials redacted).
     *
     * @param {{ type?: string, engine?: string|null, phase?: string, message?: string } & Record<string, unknown>} [fields]
     */
    failure: (fields = {}) => {
      const {
        type = 'ActionFailure',
        engine = null,
        phase = 'error',
        message = '',
        ...rest
      } = fields;
      emit('error', message, {
        type,
        engine,
        phase,
        message: String(message ?? ''),
        ...rest,
      });
    },
  };
}

/**
 * Emit structured failure telemetry then mark the Action as failed.
 * Prefer this over bare `core.setFailed` so JSON error fields stay consistent.
 *
 * @param {Object} args
 * @param {Pick<typeof import('@actions/core'), 'setFailed'>} args.core
 * @param {{ failure: (fields: Record<string, unknown>) => void }} args.log
 * @param {string} args.message
 * @param {{ type: string, engine?: string|null, phase: string } & Record<string, unknown>} args.fields
 */
function failAction({ core, log, message, fields }) {
  log.failure({
    ...fields,
    engine: fields.engine ?? null,
    message,
  });
  core.setFailed(message);
}

module.exports = {
  SENSITIVE_KEY,
  redactFields,
  formatLogLine,
  createLogger,
  failAction,
};
