/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  severityRank,
  highestSeverity,
  parseFailOnTypes,
  normalizeFailOnSeverity,
  evaluateSeverityGate,
} = require('./severityGate');

describe('severityGate', () => {
  it('ranks severities in order', () => {
    expect(severityRank('none')).toBeLessThan(severityRank('info'));
    expect(severityRank('info')).toBeLessThan(severityRank('low'));
    expect(severityRank('low')).toBeLessThan(severityRank('medium'));
    expect(severityRank('medium')).toBeLessThan(severityRank('high'));
    expect(severityRank('high')).toBeLessThan(severityRank('critical'));
  });

  it('returns NONE when there are no issues', () => {
    expect(highestSeverity([])).toBe('NONE');
  });

  it('picks the highest severity among findings', () => {
    expect(
      highestSeverity([
        { severity: 'LOW' },
        { severity: 'HIGH' },
        { severity: 'INFO' },
      ]),
    ).toBe('HIGH');
  });

  it('parses fail_on_types as an uppercase set', () => {
    expect(parseFailOnTypes(' WILDCARD_SELECT , missing_primary_key ')).toEqual(
      new Set(['WILDCARD_SELECT', 'MISSING_PRIMARY_KEY']),
    );
  });

  it('rejects invalid fail_on_severity values', () => {
    expect(() => normalizeFailOnSeverity('urgent')).toThrow(/Invalid fail_on_severity/);
  });

  it('does not fail when fail_on_severity is none (warn-only)', () => {
    const result = evaluateSeverityGate({
      issues: [{ type: 'MISSING_PRIMARY_KEY', severity: 'HIGH' }],
      failOnSeverity: 'none',
    });

    expect(result.shouldFail).toBe(false);
    expect(result.issueCount).toBe(1);
    expect(result.highestSeverity).toBe('HIGH');
    expect(result.reason).toBeNull();
  });

  it('fails when a finding meets or exceeds fail_on_severity', () => {
    const result = evaluateSeverityGate({
      issues: [
        { type: 'WILDCARD_SELECT', severity: 'LOW' },
        { type: 'MISSING_PRIMARY_KEY', severity: 'HIGH' },
      ],
      failOnSeverity: 'high',
    });

    expect(result.shouldFail).toBe(true);
    expect(result.matchingIssues).toHaveLength(1);
    expect(result.matchingIssues[0].type).toBe('MISSING_PRIMARY_KEY');
    expect(result.reason).toContain('fail_on_severity=high');
  });

  it('does not fail when findings are below the severity threshold', () => {
    const result = evaluateSeverityGate({
      issues: [
        { type: 'WILDCARD_SELECT', severity: 'LOW' },
        { type: 'FILTER_COLUMN_INDEX_CANDIDATE', severity: 'INFO' },
      ],
      failOnSeverity: 'high',
    });

    expect(result.shouldFail).toBe(false);
    expect(result.highestSeverity).toBe('LOW');
  });

  it('fails on matching fail_on_types even below severity threshold', () => {
    const result = evaluateSeverityGate({
      issues: [{ type: 'WILDCARD_SELECT', severity: 'LOW' }],
      failOnSeverity: 'high',
      failOnTypes: 'WILDCARD_SELECT',
    });

    expect(result.shouldFail).toBe(true);
    expect(result.reason).toContain('fail_on_types');
    expect(result.reason).toContain('WILDCARD_SELECT');
  });

  it('treats critical findings as meeting a high threshold', () => {
    const result = evaluateSeverityGate({
      issues: [{ type: 'SYNTAX_ERROR', severity: 'CRITICAL' }],
      failOnSeverity: 'high',
    });

    expect(result.shouldFail).toBe(true);
    expect(result.highestSeverity).toBe('CRITICAL');
  });
});

