/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * Copy sql.js runtime assets next to the Action entrypoint.
 *
 * sql.js must NOT be inlined by ncc: the bundled Emscripten glue does
 * `module = undefined` then later `module.exports = …`, which throws
 * "Cannot set properties of undefined (setting 'exports')" under Node 24.
 * Shipping `sql-wasm.js` + `sql-wasm.wasm` beside `dist/index.js` keeps
 * a working CommonJS load path for the Action.
 */

const fs = require('fs');
const path = require('path');

const sqlJsDist = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');
const targetDir = path.join(__dirname, '..', 'dist');

const files = ['sql-wasm.js', 'sql-wasm.wasm'];

for (const file of files) {
  const source = path.join(sqlJsDist, file);
  if (!fs.existsSync(source)) {
    console.error(`sql.js asset not found at ${source}. Run npm install first.`);
    process.exit(1);
  }
}

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const source = path.join(sqlJsDist, file);
  const target = path.join(targetDir, file);
  fs.copyFileSync(source, target);
  fs.chmodSync(target, 0o644);
  console.log(`Copied ${file} to ${target}`);
}
