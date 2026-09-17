/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const target = path.join(__dirname, '..', 'dist', 'sql-wasm.wasm');

if (!fs.existsSync(source)) {
  console.error(`sql.js wasm not found at ${source}. Run npm install first.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
fs.chmodSync(target, 0o644);
console.log(`Copied sql-wasm.wasm to ${target}`);
