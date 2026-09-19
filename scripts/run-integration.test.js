/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DYNAMIC_EXECUTED_MARKER,
  parseIssueCount,
  assertExpectedFindings,
  assertDynamicExecuted,
  runIntegration,
} = require('./run-integration');

function createCore() {
  return {
    getInput: vi.fn().mockReturnValue(''),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setFailed: vi.fn(),
    setOutput: vi.fn(),
    summary: {
      addRaw: vi.fn().mockReturnValue({
        write: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
}

describe('parseIssueCount', () => {
  it('parses numeric strings and treats invalid values as 0', () => {
    expect(parseIssueCount('3')).toBe(3);
    expect(parseIssueCount(0)).toBe(0);
    expect(parseIssueCount(undefined)).toBe(0);
    expect(parseIssueCount('nope')).toBe(0);
  });
});

describe('assertExpectedFindings', () => {
  it('returns the count when findings are present', () => {
    expect(assertExpectedFindings({ issueCount: '4', fixture: 'examples/mixed_postgres.sql' })).toBe(
      4,
    );
  });

  it('throws when issue_count is 0', () => {
    expect(() =>
      assertExpectedFindings({ issueCount: '0', fixture: 'examples/mixed_mysql.sql' }),
    ).toThrow(/examples\/mixed_mysql.sql.*issue_count=0/);
  });
});

describe('assertDynamicExecuted', () => {
  it('accepts reports that include the live EXPLAIN marker', () => {
    expect(() =>
      assertDynamicExecuted({
        report: `| ${DYNAMIC_EXECUTED_MARKER} | \`1 ms\` |`,
        fixture: 'examples/mixed_mssql.sql',
      }),
    ).not.toThrow();
  });

  it('throws when dynamic analysis did not run', () => {
    expect(() =>
      assertDynamicExecuted({
        report: '| **Dynamic Execution** | ℹ️ static only |',
        fixture: 'examples/mixed_postgres.sql',
      }),
    ).toThrow(/did not execute against a live engine/);
  });

  it('throws when the report records an execution error', () => {
    expect(() =>
      assertDynamicExecuted({
        report: `| ${DYNAMIC_EXECUTED_MARKER} |\n| **Dynamic Execution** | ⚠️ Execution Error |`,
        fixture: 'examples/mixed_postgres.sql',
      }),
    ).toThrow(/Dynamic analysis failed/);
  });
});

describe('runIntegration', () => {
  it('fails when the orchestrator reports zero findings', async () => {
    const core = createCore();
    await expect(
      runIntegration({
        core,
        env: { INPUT_SQL_FILE: 'examples/mixed_postgres.sql' },
        log: { info: vi.fn() },
        runFn: async ({ core: wrapped }) => {
          wrapped.setOutput('issue_count', '0');
          wrapped.setOutput('report', `| ${DYNAMIC_EXECUTED_MARKER} | \`2 ms\` |`);
        },
      }),
    ).rejects.toThrow(/issue_count=0/);
  });

  it('fails when run() calls setFailed', async () => {
    const core = createCore();
    await expect(
      runIntegration({
        core,
        env: { INPUT_SQL_FILE: 'examples/mixed_postgres.sql' },
        log: { info: vi.fn() },
        runFn: async ({ core: wrapped }) => {
          wrapped.setFailed('db_password is required');
        },
      }),
    ).rejects.toThrow(/db_password is required/);
  });

  it('passes when findings exist and dynamic analysis executed', async () => {
    const core = createCore();
    const info = vi.fn();
    const outputs = await runIntegration({
      core,
      env: { INPUT_SQL_FILE: 'examples/mixed_mysql.sql' },
      log: { info },
      runFn: async ({ core: wrapped }) => {
        wrapped.setOutput('issue_count', '2');
        wrapped.setOutput('report', `| ${DYNAMIC_EXECUTED_MARKER} | \`N/A\` |`);
      },
    });

    expect(outputs.issue_count).toBe('2');
    expect(info).toHaveBeenCalledWith(
      'OK: examples/mixed_mysql.sql produced issue_count=2',
    );
  });
});
