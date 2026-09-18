/**
 * Copyright (c) 2026 sql-optima contributors
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLogger, redactFields, formatLogLine } = require('./logger');

describe('redactFields', () => {
  it('redacts password-like keys and connection strings', () => {
    expect(
      redactFields({
        host: 'localhost',
        password: 'super-secret',
        db_password: 'also-secret',
        url: 'postgres://user:hunter2@db.example/app',
        count: 3,
      }),
    ).toEqual({
      host: 'localhost',
      password: '[REDACTED]',
      db_password: '[REDACTED]',
      url: '[REDACTED]',
      count: 3,
    });
  });

  it('redacts nested sensitive keys', () => {
    expect(
      redactFields({
        phase: 'connect',
        config: { user: 'postgres', password: 'root' },
      }),
    ).toEqual({
      phase: 'connect',
      config: { user: 'postgres', password: '[REDACTED]' },
    });
  });
});

describe('formatLogLine', () => {
  it('emits a JSON line with level, msg, and fields', () => {
    const line = formatLogLine('info', 'static complete', {
      engine: 'postgres',
      phase: 'static',
      issueCount: 2,
    });
    expect(JSON.parse(line)).toEqual({
      level: 'info',
      msg: 'static complete',
      engine: 'postgres',
      phase: 'static',
      issueCount: 2,
    });
  });
});

describe('createLogger', () => {
  it('routes levels through @actions/core and the optional sink', () => {
    const core = {
      debug: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    };
    const sink = vi.fn();
    const log = createLogger({ core, sink });

    log.debug('dbg', { phase: 'init' });
    log.info('hello', { engine: 'mysql', phase: 'start', statementCount: 4 });
    log.warn('slow', { phase: 'dynamic' });
    log.error('boom', { phase: 'gate' });

    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining('"level":"debug"'),
    );
    expect(core.info).toHaveBeenCalledWith(
      JSON.stringify({
        level: 'info',
        msg: 'hello',
        engine: 'mysql',
        phase: 'start',
        statementCount: 4,
      }),
    );
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('"level":"warn"'),
    );
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('"level":"error"'),
    );
    expect(sink).toHaveBeenCalledTimes(4);
    expect(sink.mock.calls[1][0].fields).toEqual({
      engine: 'mysql',
      phase: 'start',
      statementCount: 4,
    });
  });

  it('never forwards credentials to core or the sink', () => {
    const core = {
      debug: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    };
    const sink = vi.fn();
    const log = createLogger({ core, sink });

    log.info('connecting', {
      engine: 'postgres',
      phase: 'connect',
      host: 'localhost',
      password: 'root',
      db_password: 'root',
      connectionString: 'Server=.;Password=root;',
    });

    const line = core.info.mock.calls[0][0];
    expect(line).not.toContain('root');
    expect(line).toContain('[REDACTED]');
    expect(sink.mock.calls[0][0].fields).toEqual({
      engine: 'postgres',
      phase: 'connect',
      host: 'localhost',
      password: '[REDACTED]',
      db_password: '[REDACTED]',
      connectionString: '[REDACTED]',
    });
  });
});
