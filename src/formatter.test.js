import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { generateMarkdownReport } = require('./formatter');

describe('generateMarkdownReport', () => {
  it('renders a clean report when there are no issues', () => {
    const report = generateMarkdownReport({
      engine: 'postgres',
      sqlContent: 'SELECT id FROM users;',
      staticIssues: [],
      dynamicResult: { executed: false, reason: 'Skipped for unit test', issues: [] },
    });

    expect(report).toContain('SQL Optima Report');
    expect(report).toContain('POSTGRES');
    expect(report).toContain('Skipped for unit test');
    expect(report).toContain('No issues or anti-patterns detected');
    expect(report).toContain('SELECT id FROM users;');
  });

  it('escapes backslashes and pipes in table cells', () => {
    const report = generateMarkdownReport({
      engine: 'postgres',
      sqlContent: 'SELECT 1;',
      staticIssues: [
        {
          type: 'NOTE',
          severity: 'INFO',
          message: 'path\\with|pipes',
          suggestion: 'use\\safe|text',
        },
      ],
      dynamicResult: { executed: false, issues: [] },
    });

    expect(report).toContain('path\\\\with\\|pipes');
    expect(report).toContain('use\\\\safe\\|text');
  });

  it('renders severity badges, escaped pipes, and dynamic metrics', () => {
    const report = generateMarkdownReport({
      engine: 'mysql',
      sqlContent: 'SELECT * FROM t;',
      staticIssues: [
        {
          type: 'WILDCARD_SELECT',
          severity: 'LOW',
          message: 'Query uses | wildcard',
          suggestion: 'Specify | columns',
        },
        {
          type: 'MISSING_PRIMARY_KEY',
          severity: 'HIGH',
          message: 'Missing PK',
        },
        {
          type: 'SYNTAX_ERROR',
          severity: 'CRITICAL',
          message: 'Broken',
        },
        {
          type: 'OTHER',
          severity: 'MEDIUM',
          message: 'Medium issue',
        },
        {
          type: 'NOTE',
          severity: 'INFO',
          message: 'Info issue',
        },
      ],
      dynamicResult: {
        executed: true,
        executionTimeMs: 12.5,
        planningTimeMs: 1.2,
        totalCost: 42,
        issues: [],
        rawPlan: { Plan: { 'Node Type': 'Seq Scan' } },
      },
    });

    expect(report).toContain('🔴 **CRITICAL**');
    expect(report).toContain('🟠 **HIGH**');
    expect(report).toContain('🟡 **MEDIUM**');
    expect(report).toContain('🔵 **LOW**');
    expect(report).toContain('ℹ️ **INFO**');
    expect(report).toContain('12.5 ms');
    expect(report).toContain('1.2 ms');
    expect(report).toContain('Query uses \\| wildcard');
    expect(report).toContain('View Raw EXPLAIN Plan');
    expect(report).toContain('"Node Type": "Seq Scan"');
  });

  it('renders dynamic execution errors', () => {
    const report = generateMarkdownReport({
      engine: 'postgres',
      sqlContent: 'SELECT 1;',
      dynamicResult: {
        executed: false,
        error: 'connection refused',
        issues: [],
      },
    });

    expect(report).toContain('Execution Error');
    expect(report).toContain('Dynamic Execution Warning');
    expect(report).toContain('connection refused');
  });

  it('handles missing timing metrics when executed is true', () => {
    const report = generateMarkdownReport({
      engine: 'postgres',
      sqlContent: 'SELECT 1;',
      dynamicResult: {
        executed: true,
        issues: [],
      },
    });

    expect(report).toContain('N/A');
  });
});
