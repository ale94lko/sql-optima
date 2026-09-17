const { Parser } = require('node-sql-parser');
const { resolveParserDialect } = require('../sqlUtils');

/**
 * Performs static AST analysis on raw SQL content.
 * Identifies potential schema flaws, anti-patterns, and missing optimization targets.
 *
 * @param {string} sqlContent - Raw SQL query or schema definition string.
 * @param {string} engine - Target SQL engine ('postgres' | 'mysql' | 'mariadb' | 'sqlite' | ...).
 * @returns {Array<Object>} List of issue objects containing type, severity, message, and suggestion.
 */
function analyzeStaticSQL(sqlContent, engine = 'postgres') {
  const parser = new Parser();
  const issues = [];
  const dialect = resolveParserDialect(engine);

  try {
    // Parse SQL string into AST (handles single or multiple statements)
    const ast = parser.astify(sqlContent, { database: dialect });
    const statements = Array.isArray(ast) ? ast : [ast];

    statements.forEach((stmt) => {
      if (!stmt) return;

      switch (stmt.type) {
        case 'create':
          if (stmt.keyword === 'table') {
            analyzeCreateTable(stmt, issues);
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
    issues.push({
      type: 'SYNTAX_ERROR',
      severity: 'CRITICAL',
      message: `Failed to parse SQL syntax: ${error.message}`,
      suggestion: 'Ensure the SQL syntax is valid for the selected database engine.',
    });
  }

  return issues;
}

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
    if (typeof column.expr?.value === 'string') {
      return column.expr.value;
    }
    if (typeof column.value === 'string') {
      return column.value;
    }
    if (typeof column.column === 'string') {
      return column.column;
    }
    if (typeof column.column?.expr?.value === 'string') {
      return column.column.expr.value;
    }
  }

  return null;
}

/**
 * Inspects CREATE TABLE statements for structural best practices.
 */
function analyzeCreateTable(stmt, issues) {
  const tableName = stmt.table[0]?.table || 'unknown_table';
  const definitions = stmt.create_definitions || [];

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

      const isPkColumn = def.definition?.constraints?.some(
        (c) => c.constraint_type?.toLowerCase() === 'primary key',
      );
      if (isPkColumn) {
        hasPrimaryKey = true;
      }
    }

    // 2. Identify Foreign Key references to suggest indexing
    if (def.resource === 'constraint' && def.constraint_type === 'FOREIGN KEY') {
      const fkColumns = (def.definition || [])
        .map((col) => getColumnName(col) || getColumnName(col?.column))
        .filter(Boolean);
      if (fkColumns.length > 0) {
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
};
