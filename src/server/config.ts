import { z } from 'zod';

type Environment = Readonly<Record<string, string | undefined>>;
const timer = (fallback: number) =>
  z.coerce.number().int().min(1).max(2_147_483_647).default(fallback);
const publicSecrets = {
  NEXT_PUBLIC_DATABASE_URL: z.never().optional(),
  NEXT_PUBLIC_OPENAI_API_KEY: z.never().optional(),
  NEXT_PUBLIC_CLERK_SECRET_KEY: z.never().optional(),
};
const schema = z
  .object({
    APP_ENV: z.enum(['development', 'staging', 'production', 'test']),
    NODE_TLS_REJECT_UNAUTHORIZED: z.enum(['0', '1']).optional(),
    DATABASE_URL: z
      .string()
      .min(1)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            ['postgres:', 'postgresql:'].includes(url.protocol) &&
            url.hostname !== '' &&
            url.pathname.length > 1
          );
        } catch {
          return false;
        }
      }),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default('info'),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(10).default(5),
    IDENTITY_ADAPTER: z.enum(['disabled', 'clerk', 'test']).default('disabled'),
    DB_CONNECT_TIMEOUT_MS: timer(500),
    DB_STATEMENT_TIMEOUT_MS: timer(500),
    READINESS_TIMEOUT_MS: timer(2000),
    STARTUP_TIMEOUT_MS: timer(60000),
    SHUTDOWN_TIMEOUT_MS: timer(30000),
    ...publicSecrets,
  })
  .superRefine((settings, context) => {
    const reject = (key: string) =>
      context.addIssue({
        code: 'custom',
        path: [key],
        message: 'invalid_setting',
      });
    const remote =
      settings.APP_ENV === 'staging' || settings.APP_ENV === 'production';
    if (
      settings.IDENTITY_ADAPTER === 'clerk' ||
      (remote && settings.IDENTITY_ADAPTER === 'test')
    )
      reject('IDENTITY_ADAPTER');
    if (remote && settings.NODE_TLS_REJECT_UNAUTHORIZED === '0')
      reject('NODE_TLS_REJECT_UNAUTHORIZED');
    if (remote) {
      try {
        const url = new URL(settings.DATABASE_URL);
        const sslKeys = [...url.searchParams.keys()].filter((key) =>
          key.toLowerCase().startsWith('ssl'),
        );
        if (
          url.searchParams.getAll('sslmode').length !== 1 ||
          url.searchParams.get('sslmode') !== 'verify-full' ||
          sslKeys.some((key) => key !== 'sslmode')
        )
          reject('DATABASE_URL');
      } catch {
        reject('DATABASE_URL');
      }
    }
    if (
      settings.DB_CONNECT_TIMEOUT_MS + settings.DB_STATEMENT_TIMEOUT_MS >
      settings.READINESS_TIMEOUT_MS
    )
      reject('READINESS_TIMEOUT_MS');
  });

// Never preserve Zod errors, raw values or causes on an error that may reach stderr.
export class ConfigurationError extends Error {
  constructor(keys: readonly string[]) {
    super(`invalid_configuration: ${[...new Set(keys)].sort().join(',')}`);
    this.name = 'ConfigurationError';
  }
}

export function parseRuntimeConfig(raw: Environment) {
  const result = schema.safeParse({
    ...raw,
    STARTUP_TIMEOUT_MS:
      raw.STARTUP_TIMEOUT_MS ??
      (raw.APP_ENV === 'development' ? '120000' : '60000'),
  });
  if (!result.success)
    throw new ConfigurationError(
      result.error.issues.map((issue) => String(issue.path[0])),
    );
  const value = result.data;
  return Object.freeze({
    appEnv: value.APP_ENV,
    databaseUrl: value.DATABASE_URL,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    poolMax: value.DB_POOL_MAX,
    identityAdapter: value.IDENTITY_ADAPTER,
    connectTimeoutMs: value.DB_CONNECT_TIMEOUT_MS,
    statementTimeoutMs: value.DB_STATEMENT_TIMEOUT_MS,
    readinessTimeoutMs: value.READINESS_TIMEOUT_MS,
    startupTimeoutMs: value.STARTUP_TIMEOUT_MS,
    shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS,
  });
}
export type RuntimeConfig = ReturnType<typeof parseRuntimeConfig>;

// Build settings deliberately contain no runtime environment or secret material.
export function parseBuildConfig(raw: Environment) {
  const result = z.object(publicSecrets).safeParse(raw);
  if (!result.success)
    throw new ConfigurationError(
      result.error.issues.map((issue) => String(issue.path[0])),
    );
  return Object.freeze({ phase: 'build' as const });
}
