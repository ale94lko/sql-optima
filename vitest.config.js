/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

const { defineConfig } = require('vitest/config');

// Coverage floors (OpenSSF Gold-aligned): unmet globals make `vitest run --coverage`
// exit non-zero — same gate as the CI `unit` job (`npm run test:coverage`).
module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'scripts/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js'],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
