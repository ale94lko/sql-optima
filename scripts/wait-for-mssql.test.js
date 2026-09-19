/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { waitForMssql } = require('./wait-for-mssql');

describe('waitForMssql', () => {
  it('requires MSSQL_SA_PASSWORD', async () => {
    await expect(
      waitForMssql({
        env: {},
        sqlClient: { connect: vi.fn() },
      }),
    ).rejects.toThrow(/MSSQL_SA_PASSWORD is required/);
  });

  it('rejects unsafe database names', async () => {
    await expect(
      waitForMssql({
        env: { MSSQL_SA_PASSWORD: 'Your_strong_Password123', MSSQL_DATABASE: 'test-db;drop' },
        sqlClient: { connect: vi.fn() },
      }),
    ).rejects.toThrow(/Unsafe MSSQL_DATABASE/);
  });

  it('creates test_db once SQL Server accepts connections', async () => {
    const query = vi.fn().mockResolvedValue({ recordset: [] });
    const close = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn().mockResolvedValue({
      request: () => ({ query }),
      close,
    });

    await waitForMssql({
      env: { MSSQL_SA_PASSWORD: 'Your_strong_Password123' },
      sqlClient: { connect },
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        server: '127.0.0.1',
        port: 1433,
        user: 'sa',
        database: 'master',
      }),
    );
    expect(query).toHaveBeenCalledWith(
      "IF DB_ID('test_db') IS NULL CREATE DATABASE test_db;",
    );
    expect(close).toHaveBeenCalled();
  });

  it('retries then fails when SQL Server stays unreachable', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('offline'));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForMssql({
        env: {
          MSSQL_SA_PASSWORD: 'Your_strong_Password123',
          MSSQL_READY_ATTEMPTS: '2',
          MSSQL_READY_DELAY_MS: '1',
        },
        sqlClient: { connect },
        logger: { log: vi.fn(), error: vi.fn() },
        sleep,
      }),
    ).rejects.toThrow(/did not become ready/);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
