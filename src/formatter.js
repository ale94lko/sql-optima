/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Formats static and dynamic analysis results into a structured GitHub Markdown report.
 */

/** GitHub Step Summary hard limit is 1024 KiB; stay under with room for other steps. */
const STEP_SUMMARY_SOFT_LIMIT = 900 * 1024;

/** Default embed caps for the Job Summary (full SQL stays in the report file / output). */
const DEFAULT_SUMMARY_EMBED_LIMITS = {
  maxSqlChars: 24_000,
  maxPlanChars: 16_000,
};

/**
 * Escape text for use inside a GitHub Markdown table cell.
 * Backslashes first, then pipes, so escaped pipes stay intact.
 * @param {string} value
 * @returns {string}
 */
function escapeMarkdownTableCell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
}

/**
 * Truncate a large embed with an explicit marker.
 * @param {string} text
 * @param {number|null|undefined} maxChars
 * @param {string} kind
 * @returns {{ text: string, truncated: boolean }}
 */
function truncateEmbed(text, maxChars, kind) {
  const raw = String(text ?? '');
  if (maxChars == null || maxChars <= 0 || raw.length <= maxChars) {
    return { text: raw, truncated: false };
  }
  const omitted = raw.length - maxChars;
  return {
    text:
      raw.slice(0, maxChars) +
      `\n\n… truncated ${omitted.toLocaleString()} more ${kind} character(s); see sql-optima-report.md for the full report …\n`,
    truncated: true,
  };
}

/**
 * Normalize `job_summary` Action input.
 * @param {string} [value='full']
 * @returns {'full'|'compact'|'none'}
 */
function normalizeJobSummaryMode(value = 'full') {
  const key = String(value || 'full').trim().toLowerCase();
  if (key === 'full' || key === 'compact' || key === 'none') {
    return key;
  }
  throw new Error(
    `Invalid job_summary "${value}". Use full, compact, or none.`,
  );
}

/**
 * Short Job Summary for consumers that append their own narrative.
 *
 * @param {Object} options
 * @param {string} options.engine
 * @param {number} options.issueCount
 * @param {string} options.highestSeverity
 * @param {string} [options.reportPath='sql-optima-report.md']
 * @returns {string}
 */
function generateCompactJobSummary({
  engine,
  issueCount,
  highestSeverity,
  reportPath = 'sql-optima-report.md',
}) {
  const engineLabel = String(engine || 'unknown').toUpperCase();
  const count = Number.isFinite(issueCount) ? issueCount : 0;
  const severity = String(highestSeverity || 'NONE').toUpperCase();
  const pathLabel = String(reportPath || 'sql-optima-report.md');

  return (
    `## SQL Optima\n\n` +
    `| Metric | Value |\n` +
    `| :--- | :--- |\n` +
    `| **Engine** | \`${engineLabel}\` |\n` +
    `| **Issues** | \`${count}\` |\n` +
    `| **Highest severity** | \`${severity}\` |\n\n` +
    `Full report: \`${pathLabel}\` (upload as a workflow artifact to download).\n`
  );
}

/**
 * Generates a GitHub Step Summary Markdown string.
 *
 * @param {Object} options
 * @param {string} options.engine - Database engine used ('postgres' | 'mysql').
 * @param {string} options.sqlContent - Raw SQL query or schema tested.
 * @param {Array<Object>} options.staticIssues - Issues detected by static AST parsing.
 * @param {Object} options.dynamicResult - Result object from dynamic EXPLAIN execution.
 * @param {{ maxSqlChars?: number|null, maxPlanChars?: number|null }|null} [options.embedLimits]
 *   Caps for SQL / EXPLAIN embeds. Pass `null` for a full report (file / artifact).
 *   Omit to use {@link DEFAULT_SUMMARY_EMBED_LIMITS} (safe for `$GITHUB_STEP_SUMMARY`).
 * @returns {string} Markdown formatted report.
 */
function generateMarkdownReport({
  engine,
  sqlContent,
  staticIssues = [],
  dynamicResult = {},
  embedLimits = DEFAULT_SUMMARY_EMBED_LIMITS,
}) {
  const {
    executed = false,
    executionTimeMs,
    planningTimeMs,
    totalCost,
    issues: dynamicIssues = [],
    error: dynamicError,
    reason: dynamicReason,
  } = dynamicResult;

  const allIssues = [...staticIssues, ...dynamicIssues];
  const limits =
    embedLimits === null
      ? { maxSqlChars: null, maxPlanChars: null }
      : { ...DEFAULT_SUMMARY_EMBED_LIMITS, ...embedLimits };

  // Helper to count issues by severity
  const getSeverityBadge = (severity) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL':
        return '🔴 **CRITICAL**';
      case 'HIGH':
        return '🟠 **HIGH**';
      case 'MEDIUM':
        return '🟡 **MEDIUM**';
      case 'LOW':
        return '🔵 **LOW**';
      default:
        return 'ℹ️ **INFO**';
    }
  };

  let markdown = `## 🚀 SQL Optima Report\n\n`;

  // 1. Overview Table
  markdown += `### 📊 Summary Overview\n\n`;
  markdown += `| Metric | Value |\n`;
  markdown += `| :--- | :--- |\n`;
  markdown += `| **Database Engine** | \`${engine.toUpperCase()}\` |\n`;
  markdown += `| **Static Issues Found** | \`${staticIssues.length}\` |\n`;
  markdown += `| **Dynamic Issues Found** | \`${dynamicIssues.length}\` |\n`;

  if (executed) {
    markdown += `| **Execution Time** | \`${executionTimeMs != null ? `${executionTimeMs} ms` : 'N/A'}\` |\n`;
    markdown += `| **Planning Time** | \`${planningTimeMs != null ? `${planningTimeMs} ms` : 'N/A'}\` |\n`;
    markdown += `| **Total Estimated Cost** | \`${totalCost != null ? totalCost : 'N/A'}\` |\n`;
  } else if (dynamicReason) {
    markdown += `| **Dynamic Execution** | ℹ️ ${dynamicReason} |\n`;
  } else if (dynamicError) {
    markdown += `| **Dynamic Execution** | ⚠️ Execution Error |\n`;
  }

  markdown += `\n---\n\n`;

  // 2. Tested SQL Snippet Collapsible Block
  const sqlEmbed = truncateEmbed(sqlContent.trim(), limits.maxSqlChars, 'SQL');
  markdown += `<details>\n<summary>🔍 <b>View Analyzed SQL Code</b>${sqlEmbed.truncated ? ' (truncated)' : ''}</summary>\n\n`;
  markdown += `\`\`\`sql\n${sqlEmbed.text}\n\`\`\`\n\n`;
  markdown += `</details>\n\n---\n\n`;

  // 3. Dynamic Execution Error Notice (if any)
  if (dynamicError) {
    markdown += `### ⚠️ Dynamic Execution Warning\n\n`;
    markdown += `> ${dynamicError}\n\n`;
  }

  // 4. Detected Issues & Recommendations
  markdown += `### 💡 Findings & Optimization Suggestions\n\n`;

  if (allIssues.length === 0) {
    markdown += `🎉 **No issues or anti-patterns detected! Your SQL schema and query look optimal.**\n\n`;
  } else {
    const hasLocation = allIssues.some(
      (issue) => issue.location || (issue.line != null && issue.column != null),
    );

    if (hasLocation) {
      markdown += `| Severity | Issue Type | Location | Message & Recommendation |\n`;
      markdown += `| :---: | :--- | :--- | :--- |\n`;
    } else {
      markdown += `| Severity | Issue Type | Message & Recommendation |\n`;
      markdown += `| :---: | :--- | :--- |\n`;
    }

    allIssues.forEach((issue) => {
      const badge = getSeverityBadge(issue.severity);
      const message = escapeMarkdownTableCell(issue.message);
      const suggestion = issue.suggestion
        ? `<br>👉 *${escapeMarkdownTableCell(issue.suggestion)}*`
        : '';

      if (hasLocation) {
        const location =
          issue.location ||
          (issue.line != null
            ? `L${issue.line}:C${issue.column != null ? issue.column : '?'}`
            : '—');
        markdown += `| ${badge} | \`${issue.type}\` | \`${escapeMarkdownTableCell(location)}\` | ${message}${suggestion} |\n`;
      } else {
        markdown += `| ${badge} | \`${issue.type}\` | ${message}${suggestion} |\n`;
      }
    });

    markdown += `\n`;

    const withSnippets = allIssues.filter(
      (issue) => typeof issue.snippet === 'string' && issue.snippet.trim() !== '',
    );
    withSnippets.forEach((issue) => {
      const label = issue.location || `L${issue.line}:C${issue.column}`;
      markdown += `<details>\n<summary>📍 <b>Context at ${escapeMarkdownTableCell(label)}</b></summary>\n\n`;
      markdown += `\`\`\`sql\n${issue.snippet}\n\`\`\`\n\n`;
      markdown += `</details>\n\n`;
    });
  }

  // 5. Raw EXPLAIN JSON Collapsible Block (if executed)
  if (executed && dynamicResult.rawPlan) {
    const planJson = JSON.stringify(dynamicResult.rawPlan, null, 2);
    const planEmbed = truncateEmbed(planJson, limits.maxPlanChars, 'EXPLAIN');
    markdown += `<details>\n<summary>📄 <b>View Raw EXPLAIN Plan (JSON)</b>${planEmbed.truncated ? ' (truncated)' : ''}</summary>\n\n`;
    markdown += `\`\`\`json\n${planEmbed.text}\n\`\`\`\n\n`;
    markdown += `</details>\n\n`;
  }

  markdown += `---\n*Generated by [SQL Optima Action](https://github.com/ale94lko/sql-optima)*\n`;

  // Only enforce the Step Summary soft cap on the compact (default) report variant.
  if (embedLimits !== null) {
    const bytes = Buffer.byteLength(markdown, 'utf8');
    if (bytes > STEP_SUMMARY_SOFT_LIMIT) {
      const clipped = Buffer.from(markdown, 'utf8')
        .subarray(0, STEP_SUMMARY_SOFT_LIMIT)
        .toString('utf8')
        .replace(/\uFFFD$/, '');
      markdown =
        `${clipped}\n\n---\n⚠️ Report truncated to stay under the GitHub Step Summary size limit. ` +
        `Download \`sql-optima-report.md\` for the full report.\n`;
    }
  }

  return markdown;
}

module.exports = {
  generateMarkdownReport,
  generateCompactJobSummary,
  normalizeJobSummaryMode,
  escapeMarkdownTableCell,
  DEFAULT_SUMMARY_EMBED_LIMITS,
  STEP_SUMMARY_SOFT_LIMIT,
  truncateEmbed,
};
