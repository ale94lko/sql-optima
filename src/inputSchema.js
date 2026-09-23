/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Formal Zod schemas for GitHub Action inputs (Action boundary).
 * Keeps error messages aligned with the previous hand-written validators.
 */

const { z } = require('zod');

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

const JOB_SUMMARY_MODES = Object.freeze(['full', 'compact', 'none']);
const JOB_SUMMARY_SET = new Set(JOB_SUMMARY_MODES);

const ENGINE_ALLOWED_HINT = ALLOWED_ENGINES.join(', ');

/**
 * @param {unknown} value
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

const engineSchema = z.preprocess(
  (value) => asTrimmedString(value).toLowerCase(),
  z.string().superRefine((engine, ctx) => {
    if (!engine) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid engine "". Allowed values: ${ENGINE_ALLOWED_HINT}.`,
      });
      return;
    }
    if (!ALLOWED_ENGINE_SET.has(engine)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown engine "${engine}". Allowed values: ${ENGINE_ALLOWED_HINT}.`,
      });
    }
  }),
);

const dbPortSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}, z.string().superRefine((raw, ctx) => {
  if (raw === '') {
    return;
  }
  if (!/^[1-9]\d*$/.test(raw) || Number.parseInt(raw, 10) > 65535) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid db_port "${raw}". Provide a positive integer (1-65535), or omit it to use the engine default.`,
    });
  }
}));

const sqlFileSchema = z.preprocess(
  (value) => asTrimmedString(value),
  z.string(),
);

const jobSummarySchema = z.preprocess(
  (value) => {
    const raw = asTrimmedString(value);
    return (raw === '' ? 'full' : raw).toLowerCase();
  },
  z.string().superRefine((mode, ctx) => {
    if (!JOB_SUMMARY_SET.has(mode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid job_summary "${mode}". Use full, compact, or none.`,
      });
    }
  }),
);

/**
 * Action-boundary schema for the inputs we validate before analysis.
 * `sql_file` path containment (CWE-22) stays in `resolveSqlFileWithinWorkspace`.
 */
const actionInputsSchema = z.object({
  engine: engineSchema,
  dbPort: dbPortSchema.optional().default(''),
  sqlFile: sqlFileSchema.optional().default(''),
  jobSummary: jobSummarySchema.optional().default('full'),
});

/**
 * Parse Action inputs through the Zod schema.
 *
 * @param {Record<string, unknown>} [raw]
 * @returns {{
 *   ok: true,
 *   engine: string,
 *   port?: number,
 *   sqlFile: string,
 *   jobSummary: 'full'|'compact'|'none',
 * } | { ok: false, error: string }}
 */
function parseActionInputs(raw = {}) {
  const result = actionInputsSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      error: issue?.message || result.error.message,
    };
  }

  const { engine, dbPort, sqlFile, jobSummary } = result.data;
  /** @type {{ ok: true, engine: string, sqlFile: string, jobSummary: 'full'|'compact'|'none', port?: number }} */
  const parsed = {
    ok: true,
    engine,
    sqlFile,
    jobSummary: /** @type {'full'|'compact'|'none'} */ (jobSummary),
  };
  if (dbPort !== '') {
    parsed.port = Number.parseInt(dbPort, 10);
  }
  return parsed;
}

module.exports = {
  ALLOWED_ENGINES,
  JOB_SUMMARY_MODES,
  engineSchema,
  dbPortSchema,
  sqlFileSchema,
  jobSummarySchema,
  actionInputsSchema,
  parseActionInputs,
};
