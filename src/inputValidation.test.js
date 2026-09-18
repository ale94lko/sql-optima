/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ALLOWED_ENGINES,
  validateEngine,
  validateDbPort,
  validateActionInputs,
} = require('./inputValidation');

describe('inputValidation', () => {
  it('accepts a valid engine (case-insensitive)', () => {
    expect(validateEngine('Postgres')).toEqual({ ok: true, engine: 'postgres' });
    expect(validateEngine('MARIADB')).toEqual({ ok: true, engine: 'mariadb' });
    expect(validateEngine(' sqlite3 ')).toEqual({ ok: true, engine: 'sqlite3' });
    expect(validateEngine('bigquery').ok).toBe(true);
    expect(validateEngine('mssql').ok).toBe(true);
  });

  it('rejects an unknown engine and lists allowed values', () => {
    const result = validateEngine('oracle');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown engine "oracle"');
    expect(result.error).toContain('Allowed values:');
    for (const name of ['postgres', 'mysql', 'sqlite', 'mssql']) {
      expect(result.error).toContain(name);
    }
    expect(ALLOWED_ENGINES.length).toBeGreaterThan(8);
  });

  it('rejects a blank engine', () => {
    const result = validateEngine('  ');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid engine');
  });

  it('accepts an omitted or empty db_port', () => {
    expect(validateDbPort('')).toEqual({ ok: true });
    expect(validateDbPort(undefined)).toEqual({ ok: true });
    expect(validateDbPort(' 5432 ')).toEqual({ ok: true, port: 5432 });
  });

  it('rejects a non-numeric db_port', () => {
    const result = validateDbPort('abc');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid db_port "abc"');
    expect(result.error).toContain('positive integer');
  });

  it('rejects a non-positive db_port', () => {
    expect(validateDbPort('0').ok).toBe(false);
    expect(validateDbPort('-1').ok).toBe(false);
    expect(validateDbPort('12.5').ok).toBe(false);
    expect(validateDbPort('65536').ok).toBe(false);
  });

  it('validateActionInputs combines engine and port checks', () => {
    expect(validateActionInputs({ engine: 'mysql', dbPort: '3306' })).toEqual({
      ok: true,
      engine: 'mysql',
      port: 3306,
    });
    expect(validateActionInputs({ engine: 'oracle', dbPort: '5432' }).ok).toBe(false);
    expect(validateActionInputs({ engine: 'postgres', dbPort: 'nope' }).ok).toBe(false);
  });
});
