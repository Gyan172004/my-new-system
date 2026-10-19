import { describe, expect, it } from 'vitest';
import { parseBuildConfig, parseRuntimeConfig } from '../../src/server/config';

// Breaking validation, environment separation, defaults or freezing must fail these cases.
const valid = {
  APP_ENV: 'development',
  DATABASE_URL: 'postgresql://localhost/foundation',
};

describe('runtime configuration', () => {
  it('uses bounded defaults and ignores unused provider keys', () => {
    expect(parseRuntimeConfig(valid)).toMatchObject({
      appEnv: 'development',
      port: 3000,
      poolMax: 5,
      identityAdapter: 'disabled',
      connectTimeoutMs: 500,
      statementTimeoutMs: 500,
      readinessTimeoutMs: 2000,
      startupTimeoutMs: 120000,
      shutdownTimeoutMs: 30000,
      logLevel: 'info',
    });
  });
  it.each([undefined, '', 'staging ', 'preview', 'Production'])(
    'requires exact APP_ENV: %s',
    (APP_ENV) => {
      expect(() => parseRuntimeConfig({ ...valid, APP_ENV })).toThrow(
        'APP_ENV',
      );
    },
  );
  it.each(['development', 'test', 'staging', 'production'])(
    'accepts environment %s with verified TLS',
    (APP_ENV) => {
      expect(
        parseRuntimeConfig({
          ...valid,
          APP_ENV,
          DATABASE_URL:
            'postgresql://db.invalid/foundation?sslmode=verify-full',
        }).appEnv,
      ).toBe(APP_ENV);
    },
  );
  it.each([
    undefined,
    '',
    'https://db.invalid/app',
    'postgresql://',
    'postgresql://localhost',
  ])('requires a usable PostgreSQL runtime target: %s', (DATABASE_URL) => {
    expect(() => parseRuntimeConfig({ ...valid, DATABASE_URL })).toThrow(
      'DATABASE_URL',
    );
  });
  it.each(['1', '65535'])('accepts port boundary %s', (PORT) =>
    expect(parseRuntimeConfig({ ...valid, PORT }).port).toBe(Number(PORT)),
  );
  it.each(['0', '65536', '-1', '1.5', '', 'NaN', 'Infinity'])(
    'rejects invalid port %s',
    (PORT) =>
      expect(() => parseRuntimeConfig({ ...valid, PORT })).toThrow('PORT'),
  );
  it.each(['1', '10'])('accepts pool boundary %s', (DB_POOL_MAX) =>
    expect(parseRuntimeConfig({ ...valid, DB_POOL_MAX }).poolMax).toBe(
      Number(DB_POOL_MAX),
    ),
  );
  it.each(['0', '11', '1.5', 'NaN'])(
    'rejects invalid pool size %s',
    (DB_POOL_MAX) =>
      expect(() => parseRuntimeConfig({ ...valid, DB_POOL_MAX })).toThrow(
        'DB_POOL_MAX',
      ),
  );
  it.each(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])(
    'accepts log level %s',
    (LOG_LEVEL) =>
      expect(parseRuntimeConfig({ ...valid, LOG_LEVEL }).logLevel).toBe(
        LOG_LEVEL,
      ),
  );
  it('rejects unknown log level', () =>
    expect(() =>
      parseRuntimeConfig({ ...valid, LOG_LEVEL: 'verbose' }),
    ).toThrow('LOG_LEVEL'));
  it.each(['development', 'test'])(
    'allows test identity only locally: %s',
    (APP_ENV) =>
      expect(
        parseRuntimeConfig({ ...valid, APP_ENV, IDENTITY_ADAPTER: 'test' })
          .identityAdapter,
      ).toBe('test'),
  );
  it.each(['staging', 'production'])('rejects test identity in %s', (APP_ENV) =>
    expect(() =>
      parseRuntimeConfig({ ...valid, APP_ENV, IDENTITY_ADAPTER: 'test' }),
    ).toThrow('IDENTITY_ADAPTER'),
  );
  it.each(['unknown', ''])(
    'rejects unavailable adapter without fallback: %s',
    (IDENTITY_ADAPTER) =>
      expect(() => parseRuntimeConfig({ ...valid, IDENTITY_ADAPTER })).toThrow(
        'IDENTITY_ADAPTER',
      ),
  );
  it.each([
    'DB_CONNECT_TIMEOUT_MS',
    'DB_STATEMENT_TIMEOUT_MS',
    'READINESS_TIMEOUT_MS',
    'STARTUP_TIMEOUT_MS',
    'SHUTDOWN_TIMEOUT_MS',
  ])('rejects nonpositive/nonfinite budgets: %s', (key) => {
    for (const value of [
      '0',
      '-1',
      'Infinity',
      'NaN',
      '',
      '1.5',
      '9007199254740992',
      '2147483648',
    ]) {
      expect(() => parseRuntimeConfig({ ...valid, [key]: value })).toThrow(key);
    }
  });
  it.each([
    { DB_CONNECT_TIMEOUT_MS: '2001' },
    { DB_STATEMENT_TIMEOUT_MS: '2001' },
    { DB_CONNECT_TIMEOUT_MS: '1200', DB_STATEMENT_TIMEOUT_MS: '1200' },
  ])('rejects DB work exceeding total readiness budget: %j', (overrides) => {
    expect(() => parseRuntimeConfig({ ...valid, ...overrides })).toThrow(
      'READINESS_TIMEOUT_MS',
    );
  });
  it('accepts custom consistent budgets', () => {
    expect(
      parseRuntimeConfig({
        ...valid,
        DB_CONNECT_TIMEOUT_MS: '100',
        DB_STATEMENT_TIMEOUT_MS: '100',
        READINESS_TIMEOUT_MS: '200',
        STARTUP_TIMEOUT_MS: '1000',
        SHUTDOWN_TIMEOUT_MS: '1000',
      }).readinessTimeoutMs,
    ).toBe(200);
  });
  it('uses a 60 second startup budget outside development', () => {
    expect(
      parseRuntimeConfig({
        ...valid,
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://db.invalid/foundation?sslmode=verify-full',
      }).startupTimeoutMs,
    ).toBe(60000);
  });
  it.each(['staging', 'production'])(
    'requires verified TLS in %s',
    (APP_ENV) => {
      for (const suffix of [
        '',
        '?sslmode=disable',
        '?sslmode=require',
        '?sslmode=no-verify',
        '?sslmode=verify-full&sslmode=disable',
        '?sslmode=verify-full&sslcert=other',
      ]) {
        expect(() =>
          parseRuntimeConfig({
            ...valid,
            APP_ENV,
            DATABASE_URL: `postgresql://db.invalid/foundation${suffix}`,
          }),
        ).toThrow('DATABASE_URL');
      }
    },
  );
  it.each([
    'NEXT_PUBLIC_DATABASE_URL',
    'NEXT_PUBLIC_OPENAI_API_KEY',
    'NEXT_PUBLIC_CLERK_SECRET_KEY',
  ])('rejects known public secret aliases: %s', (key) => {
    expect(() => parseRuntimeConfig({ ...valid, [key]: 'CANARY' })).toThrow(
      key,
    );
  });
  it('freezes returned settings without changing caller input', () => {
    const raw = { ...valid };
    const config = parseRuntimeConfig(raw);
    expect(Object.isFrozen(config)).toBe(true);
    expect(() => {
      Object.assign(config, { port: 42 });
    }).toThrow();
    raw.APP_ENV = 'test';
    expect(config.appEnv).toBe('development');
  });
  it('reports only known setting names and stable codes, never raw input', () => {
    const secret = 'CANARY_private_password_query';
    try {
      parseRuntimeConfig({
        APP_ENV: secret,
        DATABASE_URL: secret,
        LOG_LEVEL: secret,
      });
      expect.fail('must reject');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain('APP_ENV');
      expect(String(error)).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });
});

describe('build configuration', () => {
  it('rejects public secret aliases before a framework build can inline them', () => {
    expect(() =>
      parseBuildConfig({ NEXT_PUBLIC_DATABASE_URL: 'CANARY' }),
    ).toThrow('NEXT_PUBLIC_DATABASE_URL');
  });
  it('needs no runtime secrets, APP_ENV or provider credentials', () => {
    expect(parseBuildConfig({})).toEqual({ phase: 'build' });
  });
  it('does not import runtime secrets into the build settings', () => {
    expect(
      parseBuildConfig({ DATABASE_URL: 'CANARY', OPENAI_API_KEY: 'CANARY' }),
    ).toEqual({ phase: 'build' });
  });
});

describe('environment TLS isolation', () => {
  it.each(['staging', 'production'])(
    'rejects a global TLS-verification bypass in %s',
    (APP_ENV) => {
      expect(() =>
        parseRuntimeConfig({
          APP_ENV,
          DATABASE_URL:
            'postgresql://db.invalid/foundation?sslmode=verify-full',
          NODE_TLS_REJECT_UNAUTHORIZED: '0',
        }),
      ).toThrow('NODE_TLS_REJECT_UNAUTHORIZED');
    },
  );
  it('accepts explicitly verified production TLS without unused provider credentials', () => {
    expect(
      parseRuntimeConfig({
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://db.invalid/foundation?sslmode=verify-full',
        NODE_TLS_REJECT_UNAUTHORIZED: '1',
      }).identityAdapter,
    ).toBe('disabled');
  });
});
