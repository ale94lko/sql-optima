/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

const { Parser } = require('node-sql-parser');
const { resolveParserDialect } = require('../sqlUtils');

/**
 * Performs static AST analysis on raw SQL content.
 * Identifies potential schema flaws, anti-patterns, and missing optimization targets.
 *
 * @param {string} sqlContent - Raw SQL query or schema definition string.
 * @param {string} engine - Target SQL engine ('postgres' | 'mysql' | 'mariadb' | 'sqlite' | ...).
 * @param {{ sourcePath?: string|null }} [options] - Optional source path (e.g. `sql_file`) for locations.
 * @returns {Array<Object>} List of issue objects containing type, severity, message, and suggestion.
 */
function analyzeStaticSQL(sqlContent, engine = 'postgres', options = {}) {
  const parser = new Parser();
  const issues = [];
  const dialect = resolveParserDialect(engine);
  const sourcePath =
    typeof options.sourcePath === 'string' && options.sourcePath.trim()
      ? options.sourcePath.trim()
      : null;

  try {
    // Parse SQL string into AST (handles single or multiple statements)
    const ast = parser.astify(sqlContent, { database: dialect });
    const statements = Array.isArray(ast) ? ast : [ast];

    statements.forEach((stmt) => {
      if (!stmt) return;

      switch (stmt.type) {
        case 'create':
          if (stmt.keyword === 'table') {
            analyzeCreateTable(/** @type {SqlCreateTableStmt} */ (stmt), issues, engine);
          }
          break;

        case 'select':
          analyzeSelectStatement(stmt, issues);
          break;

        default:
          break;
      }
    });
  } catch (error) {
    issues.push(buildSyntaxErrorIssue(error, sqlContent, sourcePath));
  }

  return issues;
}

/**
 * Reads 1-based line/column from a node-sql-parser / peg.js SyntaxError.
 * @param {unknown} error
 * @returns {{ line: number, column: number, endLine?: number, endColumn?: number }|null}
 */
function extractParseLocation(error) {
  if (!error || typeof error !== 'object') return null;
  const loc = /** @type {{ location?: { start?: { line?: number, column?: number }, end?: { line?: number, column?: number } }, loc?: { start?: { line?: number, column?: number }, end?: { line?: number, column?: number } } }} */ (
    error
  ).location || /** @type {{ loc?: { start?: { line?: number, column?: number }, end?: { line?: number, column?: number } } }} */ (error).loc;
  const start = loc?.start;
  if (!start || typeof start.line !== 'number' || typeof start.column !== 'number') {
    return null;
  }
  /** @type {{ line: number, column: number, endLine?: number, endColumn?: number }} */
  const result = { line: start.line, column: start.column };
  if (typeof loc?.end?.line === 'number') result.endLine = loc.end.line;
  if (typeof loc?.end?.column === 'number') result.endColumn = loc.end.column;
  return result;
}

/**
 * Builds a numbered ±radius context snippet around a 1-based line.
 * @param {string} sqlContent
 * @param {number} line
 * @param {number} [radius]
 * @returns {string|null}
 */
function extractSqlContextSnippet(sqlContent, line, radius = 2) {
  if (!Number.isInteger(line) || line < 1) return null;
  const lines = String(sqlContent ?? '').split(/\r?\n/);
  if (lines.length === 0) return null;
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const width = String(end).length;
  const out = [];
  for (let i = start; i <= end; i += 1) {
    const marker = i === line ? '>' : ' ';
    out.push(`${marker} ${String(i).padStart(width, ' ')} | ${lines[i - 1] ?? ''}`);
  }
  return out.join('\n');
}

/**
 * @param {Error & { location?: unknown }} error
 * @param {string} sqlContent
 * @param {string|null} sourcePath
 * @returns {Object}
 */
function buildSyntaxErrorIssue(error, sqlContent, sourcePath) {
  const loc = extractParseLocation(error);
  const baseMessage = `Failed to parse SQL syntax: ${error?.message || 'Unknown parse error'}`;
  /** @type {Record<string, unknown>} */
  const issue = {
    type: 'SYNTAX_ERROR',
    severity: 'CRITICAL',
    message: baseMessage,
    suggestion: 'Ensure the SQL syntax is valid for the selected database engine.',
  };

  if (!loc) {
    return issue;
  }

  issue.line = loc.line;
  issue.column = loc.column;
  if (loc.endLine != null) issue.endLine = loc.endLine;
  if (loc.endColumn != null) issue.endColumn = loc.endColumn;

  const locationLabel = sourcePath
    ? `${sourcePath}:${loc.line}:${loc.column}`
    : `L${loc.line}:C${loc.column}`;
  issue.location = locationLabel;
  if (sourcePath) issue.source = sourcePath;

  const snippet = extractSqlContextSnippet(sqlContent, loc.line);
  if (snippet) issue.snippet = snippet;

  issue.message = `${locationLabel} — ${baseMessage}`;
  return issue;
}

/**
 * @typedef {{ expr?: { value?: unknown }, value?: unknown, column?: string | { expr?: { value?: unknown } } }} SqlColumnNode
 * @typedef {{ keyword?: string, value?: unknown }} SqlTableOption
 * @typedef {{ constraint_type?: string }} SqlConstraintNode
 * @typedef {{
 *   resource?: string,
 *   definition?: Array<unknown> | { constraints?: SqlConstraintNode[] },
 *   constraint_type?: string,
 *   column?: unknown,
 *   primary_key?: string,
 *   unique?: string
 * }} SqlCreateDefinition
 * @typedef {{
 *   table_options?: SqlTableOption[],
 *   table?: Array<{ table?: string }> | { table?: string },
 *   create_definitions?: SqlCreateDefinition[]
 * }} SqlCreateTableStmt
 */

/**
 * Normalizes node-sql-parser column identifiers to a plain string.
 * @param {unknown} column
 * @returns {string|null}
 */
function getColumnName(column) {
  if (typeof column === 'string') {
    return column;
  }

  if (column && typeof column === 'object') {
    const node = /** @type {SqlColumnNode} */ (column);
    if (typeof node.expr?.value === 'string') {
      return node.expr.value;
    }
    if (typeof node.value === 'string') {
      return node.value;
    }
    if (typeof node.column === 'string') {
      return node.column;
    }
    if (typeof node.column === 'object' && typeof node.column.expr?.value === 'string') {
      return node.column.expr.value;
    }
  }

  return null;
}

/**
 * Returns whether the engine is MySQL / MariaDB (or Aurora MySQL).
 * @param {string} engine
 * @returns {boolean}
 */
function isMysqlFamilyEngine(engine) {
  const normalized = String(engine || '')
    .toLowerCase()
    .replace(/_/g, '-');
  return (
    normalized === 'mysql' ||
    normalized === 'mariadb' ||
    normalized === 'aurora-mysql' ||
    normalized.endsWith('-mysql') ||
    normalized.includes('mariadb')
  );
}

/**
 * Resolves the storage engine from CREATE TABLE options.
 * MySQL/MariaDB default to InnoDB when ENGINE is omitted.
 * @param {SqlCreateTableStmt} stmt
 * @param {string} engine
 * @returns {string|null} Lowercase engine name, or null when not MySQL-family.
 */
function resolveMysqlStorageEngine(stmt, engine) {
  if (!isMysqlFamilyEngine(engine)) {
    return null;
  }

  const options = Array.isArray(stmt.table_options) ? stmt.table_options : [];
  const engineOption = options.find(
    (opt) => typeof opt?.keyword === 'string' && opt.keyword.toLowerCase() === 'engine',
  );

  if (!engineOption || engineOption.value == null || engineOption.value === '') {
    return 'innodb';
  }

  return String(engineOption.value).toLowerCase();
}

/**
 * True when MySQL/MariaDB InnoDB will auto-create indexes for FOREIGN KEY columns.
 * @param {SqlCreateTableStmt} stmt
 * @param {string} engine
 * @returns {boolean}
 */
function innodbAutoIndexesForeignKeys(stmt, engine) {
  return resolveMysqlStorageEngine(stmt, engine) === 'innodb';
}

/**
 * Extracts ordered column names from an index / key / PK / UNIQUE definition.
 * @param {unknown} definition
 * @returns {string[]}
 */
function getIndexColumnNames(definition) {
  if (!Array.isArray(definition)) {
    return [];
  }
  return definition
    .map((col) => getColumnName(col) || getColumnName(col?.column))
    .filter((name) => typeof name === 'string' && name.length > 0)
    .map((name) => name.toLowerCase());
}

/**
 * Collects index column prefixes declared in the same CREATE TABLE.
 * An index covers an FK when the FK columns are a leftmost prefix of the index.
 * @param {SqlCreateDefinition[]} definitions
 * @returns {string[][]}
 */
function collectIndexColumnPrefixes(definitions) {
  /** @type {string[][]} */
  const prefixes = [];

  definitions.forEach((def) => {
    if (def.resource === 'index') {
      const cols = getIndexColumnNames(def.definition);
      if (cols.length > 0) {
        prefixes.push(cols);
      }
      return;
    }

    if (def.resource === 'constraint') {
      const constraintType = String(def.constraint_type || '').toLowerCase();
      if (
        constraintType === 'primary key' ||
        constraintType === 'unique' ||
        constraintType === 'unique key' ||
        constraintType === 'unique index'
      ) {
        const cols = getIndexColumnNames(def.definition);
        if (cols.length > 0) {
          prefixes.push(cols);
        }
      }
      return;
    }

    if (def.resource === 'column') {
      const columnName = getColumnName(def.column);
      if (!columnName) {
        return;
      }
      const normalized = columnName.toLowerCase();

      if (typeof def.primary_key === 'string' && def.primary_key.toLowerCase().includes('primary')) {
        prefixes.push([normalized]);
      }

      if (typeof def.unique === 'string' && def.unique.toLowerCase().includes('unique')) {
        prefixes.push([normalized]);
      }

      const columnDefinition =
        def.definition && !Array.isArray(def.definition) ? def.definition : null;
      const hasPkConstraint = columnDefinition?.constraints?.some(
        (c) => c.constraint_type?.toLowerCase() === 'primary key',
      );
      if (hasPkConstraint) {
        prefixes.push([normalized]);
      }
    }
  });

  return prefixes;
}

/**
 * @param {string[]} fkColumns lowercase FK column names in order
 * @param {string[][]} indexPrefixes
 * @returns {boolean}
 */
function indexCoversForeignKey(fkColumns, indexPrefixes) {
  if (fkColumns.length === 0) {
    return false;
  }
  return indexPrefixes.some(
    (prefix) =>
      prefix.length >= fkColumns.length &&
      fkColumns.every((column, index) => prefix[index] === column),
  );
}

/**
 * Inspects CREATE TABLE statements for structural best practices.
 * @param {SqlCreateTableStmt} stmt
 * @param {object[]} issues
 * @param {string} engine
 */
function analyzeCreateTable(stmt, issues, engine = 'postgres') {
  const tableRef = Array.isArray(stmt.table) ? stmt.table[0] : stmt.table;
  const tableName = tableRef?.table || 'unknown_table';
  const definitions = stmt.create_definitions || [];
  const indexPrefixes = collectIndexColumnPrefixes(definitions);
  const skipUnindexedFkForInnoDb = innodbAutoIndexesForeignKeys(stmt, engine);

  let hasPrimaryKey = false;
  const foreignKeysWithoutIndex = [];

  definitions.forEach((def) => {
    // 1. Check for Primary Keys defined as column constraints or table constraints
    if (def.resource === 'constraint' && def.constraint_type?.toLowerCase() === 'primary key') {
      hasPrimaryKey = true;
    }

    if (def.resource === 'column') {
      if (typeof def.primary_key === 'string' && def.primary_key.toLowerCase().includes('primary')) {
        hasPrimaryKey = true;
      }

      const columnDefinition =
        def.definition && !Array.isArray(def.definition) ? def.definition : null;
      const isPkColumn = columnDefinition?.constraints?.some(
        (c) => c.constraint_type?.toLowerCase() === 'primary key',
      );
      if (isPkColumn) {
        hasPrimaryKey = true;
      }
    }

    // 2. Identify Foreign Key references that still need an explicit index
    if (def.resource === 'constraint' && def.constraint_type === 'FOREIGN KEY') {
      if (skipUnindexedFkForInnoDb) {
        return;
      }

      const fkColumns = getIndexColumnNames(def.definition);
      if (fkColumns.length === 0) {
        return;
      }

      if (!indexCoversForeignKey(fkColumns, indexPrefixes)) {
        foreignKeysWithoutIndex.push(fkColumns.join(', '));
      }
    }
  });

  // Flag missing Primary Key
  if (!hasPrimaryKey) {
    issues.push({
      type: 'MISSING_PRIMARY_KEY',
      severity: 'HIGH',
      message: `Table "${tableName}" does not have a PRIMARY KEY defined.`,
      suggestion:
        'Add a PRIMARY KEY column (e.g., id) to ensure unique row identification and optimal index lookup.',
    });
  }

  // Flag Foreign Keys that might require explicit B-Tree indexes
  foreignKeysWithoutIndex.forEach((fkCols) => {
    issues.push({
      type: 'UNINDEXED_FOREIGN_KEY',
      severity: 'MEDIUM',
      message: `Table "${tableName}" defines a FOREIGN KEY on column(s): [${fkCols}].`,
      suggestion: `Create an index on (${fkCols}) to speed up JOIN operations and prevent table locks during cascading updates.`,
    });
  });
}

/**
 * Inspects SELECT statements for query performance anti-patterns.
 */
function analyzeSelectStatement(stmt, issues) {
  // 1. Check for wildcard SELECT *
  if (stmt.columns === '*') {
    issues.push({
      type: 'WILDCARD_SELECT',
      severity: 'LOW',
      message: 'Query uses wildcard "SELECT *".',
      suggestion:
        'Explicitly specify only required columns to reduce network payload and memory overhead.',
    });
  } else if (Array.isArray(stmt.columns)) {
    const hasWildcard = stmt.columns.some((col) => {
      const columnName = getColumnName(col.expr?.column) || getColumnName(col.expr);
      return col.expr?.type === 'column_ref' && columnName === '*';
    });
    if (hasWildcard) {
      issues.push({
        type: 'WILDCARD_SELECT',
        severity: 'LOW',
        message: 'Query includes a wildcard column selection (e.g., table.*).',
        suggestion:
          'Replace wildcard selections with explicit column names to maximize index coverage.',
      });
    }
  }

  // 2. Inspect WHERE clause for indexing candidates and anti-patterns
  if (stmt.where) {
    inspectWhereClause(stmt.where, issues);
  }
}

/**
 * Recursively inspects WHERE clause conditions.
 */
function inspectWhereClause(whereNode, issues) {
  if (!whereNode) return;

  // Handle binary operations (e.g., column = value, column LIKE '%term')
  if (whereNode.type === 'binary_expr') {
    const operator = whereNode.operator?.toUpperCase();

    // Detect leading wildcard LIKE searches (e.g., LIKE '%abc')
    if (operator === 'LIKE' && typeof whereNode.right?.value === 'string') {
      const val = whereNode.right.value;
      if (val.startsWith('%') || val.startsWith('_')) {
        issues.push({
          type: 'LEADING_WILDCARD_LIKE',
          severity: 'MEDIUM',
          message: `LIKE pattern "${val}" starts with a wildcard.`,
          suggestion:
            'Leading wildcards prevent B-tree index utilization. Consider using full-text search indexes or trigram matching.',
        });
      }
    }

    // Flag columns used in filter predicates for index consideration
    if (whereNode.left?.type === 'column_ref') {
      const colName = getColumnName(whereNode.left.column) || getColumnName(whereNode.left);
      if (colName) {
        issues.push({
          type: 'FILTER_COLUMN_INDEX_CANDIDATE',
          severity: 'INFO',
          message: `Column "${colName}" is used as a filter predicate in the WHERE clause.`,
          suggestion: `Ensure an index exists on "${colName}" if this query executes frequently on large datasets.`,
        });
      }
    }

    // Recurse left and right branches
    inspectWhereClause(whereNode.left, issues);
    inspectWhereClause(whereNode.right, issues);
  }
}

module.exports = {
  analyzeStaticSQL,
  getColumnName,
  extractParseLocation,
  extractSqlContextSnippet,
  buildSyntaxErrorIssue,
};

