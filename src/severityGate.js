/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Severity gating helpers for CI fail-on-threshold behavior.
 */

const SEVERITY_RANK = {
  none: 0,
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

/**
 * @param {string} severity
 * @returns {number}
 */
function severityRank(severity) {
  const key = String(severity || 'info').toLowerCase();
  return SEVERITY_RANK[key] ?? SEVERITY_RANK.info;
}

/**
 * @param {Array<{severity?: string}>} issues
 * @returns {string} Uppercase severity label, or `NONE` when empty.
 */
function highestSeverity(issues = []) {
  if (!issues.length) {
    return 'NONE';
  }

  let best = 'INFO';
  let bestRank = SEVERITY_RANK.info;

  for (const issue of issues) {
    const label = String(issue.severity || 'INFO').toUpperCase();
    const rank = severityRank(label);
    if (rank > bestRank) {
      best = label;
      bestRank = rank;
    }
  }

  return best;
}

/**
 * @param {string} failOnTypesInput
 * @returns {Set<string>}
 */
function parseFailOnTypes(failOnTypesInput = '') {
  return new Set(
    String(failOnTypesInput)
      .split(',')
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean),
  );
}

/**
 * Normalize fail_on_severity input. Unknown values throw.
 * @param {string} value
 * @returns {string} lowercase severity key including `none`
 */
function normalizeFailOnSeverity(value = 'none') {
  const key = String(value || 'none').trim().toLowerCase();
  if (!(key in SEVERITY_RANK)) {
    throw new Error(
      `Invalid fail_on_severity "${value}". Use none, info, low, medium, high, or critical.`,
    );
  }
  return key;
}

/**
 * Evaluate whether findings should fail the Action.
 *
 * @param {Object} options
 * @param {Array<{type?: string, severity?: string}>} [options.issues]
 * @param {string} [options.failOnSeverity='none']
 * @param {string} [options.failOnTypes='']
 * @returns {{
 *   shouldFail: boolean,
 *   issueCount: number,
 *   highestSeverity: string,
 *   matchingIssues: Array,
 *   reason: string|null
 * }}
 */
function evaluateSeverityGate({
  issues = [],
  failOnSeverity = 'none',
  failOnTypes = '',
} = {}) {
  const threshold = normalizeFailOnSeverity(failOnSeverity);
  const typeSet = parseFailOnTypes(failOnTypes);
  const issueCount = issues.length;
  const topSeverity = highestSeverity(issues);

  const matchingByType = issues.filter((issue) =>
    typeSet.has(String(issue.type || '').toUpperCase()),
  );

  const matchingBySeverity =
    threshold === 'none'
      ? []
      : issues.filter((issue) => severityRank(issue.severity) >= SEVERITY_RANK[threshold]);

  const matchingIssues = [...matchingByType];
  for (const issue of matchingBySeverity) {
    if (!matchingIssues.includes(issue)) {
      matchingIssues.push(issue);
    }
  }

  if (matchingByType.length > 0) {
    const types = [...new Set(matchingByType.map((i) => i.type))].join(', ');
    return {
      shouldFail: true,
      issueCount,
      highestSeverity: topSeverity,
      matchingIssues,
      reason: `Failing because ${matchingByType.length} finding(s) match fail_on_types (${types}).`,
    };
  }

  if (matchingBySeverity.length > 0) {
    return {
      shouldFail: true,
      issueCount,
      highestSeverity: topSeverity,
      matchingIssues,
      reason: `Failing because ${matchingBySeverity.length} finding(s) meet or exceed fail_on_severity=${threshold} (highest: ${topSeverity}).`,
    };
  }

  return {
    shouldFail: false,
    issueCount,
    highestSeverity: topSeverity,
    matchingIssues: [],
    reason: null,
  };
}

module.exports = {
  SEVERITY_RANK,
  severityRank,
  highestSeverity,
  parseFailOnTypes,
  normalizeFailOnSeverity,
  evaluateSeverityGate,
};

