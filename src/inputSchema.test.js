/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ALLOWED_ENGINES,
  JOB_SUMMARY_MODES,
  parseActionInputs,
  actionInputsSchema,
} = require('./inputSchema');

describe('inputSchema / parseActionInputs', () => {
  it('accepts valid engine, db_port, sql_file, and job_summary', () => {
    expect(
      parseActionInputs({
        engine: 'Postgres',
        dbPort: '5432',
        sqlFile: 'examples/mixed_postgres.sql',
        jobSummary: 'COMPACT',
      }),
    ).toEqual({
      ok: true,
      engine: 'postgres',
      port: 5432,
      sqlFile: 'examples/mixed_postgres.sql',
      jobSummary: 'compact',
    });
  });

  it('defaults empty job_summary to full and empty db_port to omitted', () => {
    expect(
      parseActionInputs({
        engine: 'sqlite',
        dbPort: '',
        sqlFile: '',
        jobSummary: '',
      }),
    ).toEqual({
      ok: true,
      engine: 'sqlite',
      sqlFile: '',
      jobSummary: 'full',
    });
  });

  it('rejects an unknown engine and lists allowed values', () => {
    const result = parseActionInputs({ engine: 'oracle', jobSummary: 'full' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unknown engine "oracle"');
      expect(result.error).toContain('Allowed values:');
      expect(result.error).toContain('postgres');
    }
    expect(ALLOWED_ENGINES.length).toBeGreaterThan(8);
  });

  it('rejects a blank engine', () => {
    const result = parseActionInputs({ engine: '  ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid engine');
    }
  });

  it('rejects a non-numeric db_port', () => {
    const result = parseActionInputs({ engine: 'mysql', dbPort: 'abc' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid db_port "abc"');
      expect(result.error).toContain('positive integer');
    }
  });

  it('rejects out-of-range db_port values', () => {
    expect(parseActionInputs({ engine: 'postgres', dbPort: '0' }).ok).toBe(false);
    expect(parseActionInputs({ engine: 'postgres', dbPort: '65536' }).ok).toBe(false);
    expect(parseActionInputs({ engine: 'postgres', dbPort: '12.5' }).ok).toBe(false);
  });

  it('rejects an invalid job_summary', () => {
    const result = parseActionInputs({ engine: 'postgres', jobSummary: 'verbose' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Invalid job_summary/);
      expect(result.error).toContain('full, compact, or none');
    }
  });

  it('accepts every documented job_summary mode', () => {
    for (const mode of JOB_SUMMARY_MODES) {
      const result = parseActionInputs({ engine: 'mariadb', jobSummary: mode });
      expect(result).toEqual({
        ok: true,
        engine: 'mariadb',
        sqlFile: '',
        jobSummary: mode,
      });
    }
  });

  it('exposes actionInputsSchema for introspection', () => {
    expect(actionInputsSchema.safeParse({ engine: 'mssql' }).success).toBe(true);
    expect(actionInputsSchema.safeParse({ engine: 'oracle' }).success).toBe(false);
  });
});
