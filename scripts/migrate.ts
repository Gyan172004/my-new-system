import { createLegacySqlMigrationLoader } from 'node-pg-migrate/migrationLoader';
import { readSchemaHistory } from '../src/server/schema-version';
import { databaseConnectionOptions } from '../src/server/database-options';
import { Client } from 'pg';
import { runner } from 'node-pg-migrate/runner';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRuntimeConfig } from '../src/server/config';
export interface MigrationOptions {
  environment: string | undefined;
  migrationDatabaseUrl?: string;
  directory?: string;
  limits?: { connectMs?: number; statementMs?: number; commandMs?: number };
  signal?: AbortSignal;
}
export class MigrationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MigrationError';
  }
}
export async function runMigrations(
  options: MigrationOptions,
): Promise<{ applied: number }> {
  try {
    parseRuntimeConfig({
      APP_ENV: options.environment,
      DATABASE_URL: options.migrationDatabaseUrl,
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    });
  } catch {
    throw new MigrationError('migration_configuration_invalid');
  }
  const budget = (value: number | undefined, maximum: number) => {
    const actual = value ?? maximum;
    if (!Number.isInteger(actual) || actual < 1 || actual > maximum)
      throw new MigrationError('migration_configuration_invalid');
    return actual;
  };
  const commandMs = budget(options.limits?.commandMs, 60000);
  const connectMs = Math.min(
    budget(options.limits?.connectMs, 2000),
    commandMs,
  );
  const statementMs = budget(options.limits?.statementMs, 30000);
  const directory = resolve(options.directory ?? 'migrations');
  let names: string[];
  try {
    const files = (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    if (
      !files.length ||
      files.some((name) => !/^\d{13}_[a-z0-9_]+\.sql$/.test(name)) ||
      new Set(files.map((name) => name.slice(0, 13))).size !== files.length
    )
      throw new Error('invalid_chain');
    names = files.map((file) => file.slice(0, -4));
  } catch {
    throw new MigrationError('migration_configuration_invalid');
  }
  let connection: ReturnType<typeof databaseConnectionOptions>;
  try {
    connection = databaseConnectionOptions(options.migrationDatabaseUrl!);
  } catch {
    throw new MigrationError('migration_configuration_invalid');
  }
  const client = new Client({
    ...connection,
    connectionTimeoutMillis: connectMs,
    statement_timeout: statementMs,
    application_name: 'foundation_migration',
    options: `-c statement_timeout=${statementMs}`,
  });
  client.on('error', () => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  let rejectDeadline!: (error: Error) => void;
  const close = () => {
    void client.end().catch(() => {});
  };
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const abort = () => {
    expired = true;
    close();
    rejectDeadline(new MigrationError('migration_deadline'));
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  const quiet = () => {};
  try {
    const work = (async () => {
      if (options.signal?.aborted)
        throw new MigrationError('migration_deadline');
      await client.connect();
      if (expired || options.signal?.aborted)
        throw new MigrationError('migration_deadline');
      const legacyLoader = createLegacySqlMigrationLoader();
      const validateHistory = async (exact: boolean) => {
        const actual = await readSchemaHistory(client);
        if (
          actual === null ||
          actual.length > names.length ||
          (exact && actual.length !== names.length) ||
          actual.some((name, index) => name !== names[index])
        )
          throw new MigrationError('migration_failed');
      };
      const applied = await runner({
        dbClient: client,
        dir: directory,
        direction: 'up',
        migrationsTable: 'pgmigrations',
        migrationsSchema: 'public',
        schema: 'public',
        singleTransaction: true,
        checkOrder: true,
        noLock: false,
        advisoryLockMode: 'fail',
        migrationLoaderStrategies: [
          {
            extensions: ['.sql'],
            loader: async (paths) => {
              // Public loader runs after the library lock is acquired, before apply.
              await validateHistory(false);
              return legacyLoader(paths);
            },
          },
        ],
        ignorePattern: '^(?!\\d{13}_[a-z0-9_]+\\.sql$)',
        logger: { debug: quiet, info: quiet, warn: quiet, error: quiet },
        verbose: false,
      });
      if (expired) throw new MigrationError('migration_deadline');
      // A newer concurrent artifact after unlock causes a safe nonzero result.
      await validateHistory(true);
      return { applied: applied.length };
    })();
    timer = setTimeout(abort, commandMs);
    return await Promise.race([work, deadline]);
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError(
      error instanceof Error &&
        error.message.startsWith('Another migration is already running.')
        ? 'migration_busy'
        : 'migration_failed',
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    await client.end().catch(() => {});
  }
}
async function main() {
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    if (process.argv.length > 2)
      throw new MigrationError('migration_configuration_invalid');
    const result = await runMigrations({
      environment: process.env.APP_ENV,
      ...(process.env.MIGRATION_DATABASE_URL
        ? { migrationDatabaseUrl: process.env.MIGRATION_DATABASE_URL }
        : {}),
      signal: abort.signal,
    });
    process.stdout.write(
      JSON.stringify({
        event: 'migration_completed',
        applied: result.applied,
      }) + '\n',
    );
  } catch (error) {
    process.stderr.write(
      (error instanceof MigrationError ? error.code : 'migration_failed') +
        '\n',
    );
    process.exitCode = 1;
  } finally {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();
