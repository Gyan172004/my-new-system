import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { allocateTestDatabase } from '../helpers/test-database';
import { runMigrations } from '../../scripts/migrate';
import { acceptedMigrations } from '../helpers/migration-chain';
const baseline = '1781654400000_foundation';
async function query(url: string, text: string) {
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 500,
    statement_timeout: 1000,
  });
  try {
    await client.connect();
    return await client.query(text);
  } finally {
    await client.end();
  }
}
async function fixture(
  files: Record<string, string>,
  work: (directory: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'foundation-migrations-'));
  try {
    for (const [name, sql] of Object.entries(files))
      await writeFile(
        join(root, name),
        `-- Up Migration\n${sql}\n-- Down Migration\nSELECT 1;\n`,
      );
    await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function database(work: (url: string) => Promise<void>) {
  const lease = await allocateTestDatabase({ purpose: 'migration-under-test' });
  try {
    await work(lease.connectionString);
  } finally {
    await lease.dispose();
  }
}
function options(url: string, directory = resolve('migrations')) {
  return { environment: 'test', migrationDatabaseUrl: url, directory };
}
async function migrationActive(url: string) {
  return (
    await query(
      url,
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='foundation_migration' AND state='active' AND query LIKE '%pg_sleep%'",
    )
  ).rows[0].n;
}
async function waitForActive(url: string, wanted: number) {
  const until = performance.now() + 2000;
  while (performance.now() < until) {
    if ((await migrationActive(url)) === wanted) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}
it(
  'applies the accepted domain chain to empty storage and repeats without changing history',
  async () =>
    database(async (url) => {
      expect(
        (
          await query(
            url,
            "SELECT to_regclass('public.pgmigrations') AS ledger",
          )
        ).rows[0].ledger,
      ).toBeNull();
      expect(await runMigrations(options(url))).toEqual({
        applied: acceptedMigrations.length,
      });
      const before = (
        await query(
          url,
          'SELECT id,name,run_on FROM public.pgmigrations ORDER BY id',
        )
      ).rows;
      expect(before.map((row) => row.name)).toEqual(acceptedMigrations);
      expect(await runMigrations(options(url))).toEqual({ applied: 0 });
      expect(
        (
          await query(
            url,
            'SELECT id,name,run_on FROM public.pgmigrations ORDER BY id',
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await query(
            url,
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
          )
        ).rows.map((row) => row.tablename),
      ).toEqual([
        'approach_assessments',
        'catalogue_hint_routing_current',
        'catalogue_hint_routing_revisions',
        'catalogue_problems',
        'catalogue_release_availability',
        'catalogue_releases',
        'catalogue_test_cases',
        'content_hint_routing_reviews',
        'content_publication_audit',
        'content_publications',
        'content_reviews',
        'conversation_turns',
        'hint_exposures',
        'interview_sessions',
        'pgmigrations',
        'session_command_operations',
        'session_events',
        'users',
      ]);
    }),
  15000,
);
it(
  'rolls back the complete attempted batch without stamping failed changes or exposing raw SQL/errors',
  async () =>
    database(async (url) => {
      await fixture(
        {
          '1781654400000_first.sql':
            'CREATE TABLE fixture_transaction(value int);',
          '1781654400001_failure.sql':
            "DO $$ BEGIN RAISE EXCEPTION 'CANARY_MIGRATION_SECRET'; END $$;",
        },
        async (directory) => {
          await expect(runMigrations(options(url, directory))).rejects.toThrow(
            'migration_failed',
          );
          expect(
            (
              await query(
                url,
                "SELECT to_regclass('public.fixture_transaction') AS value",
              )
            ).rows[0].value,
          ).toBeNull();
          expect(
            (await query(url, 'SELECT name FROM public.pgmigrations')).rows,
          ).toEqual([]);
        },
      );
    }),
  15000,
);
it(
  'rejects inserted historical revisions and preserves immutable ordered applied history',
  async () =>
    database(async (url) => {
      await fixture(
        {
          '1781654400000_first.sql': 'SELECT 1;',
          '1781654400002_later.sql': 'SELECT 1;',
        },
        async (directory) => {
          expect(await runMigrations(options(url, directory))).toEqual({
            applied: 2,
          });
          await writeFile(
            join(directory, '1781654400001_inserted.sql'),
            '-- Up Migration\nCREATE TABLE should_not_exist(id int);\n-- Down Migration\nSELECT 1;',
          );
          await expect(runMigrations(options(url, directory))).rejects.toThrow(
            'migration_failed',
          );
          expect(
            (
              await query(
                url,
                'SELECT name FROM public.pgmigrations ORDER BY id',
              )
            ).rows.map((row) => row.name),
          ).toEqual(['1781654400000_first', '1781654400002_later']);
          expect(
            (
              await query(
                url,
                "SELECT to_regclass('public.should_not_exist') AS value",
              )
            ).rows[0].value,
          ).toBeNull();
        },
      );
    }),
  15000,
);
it(
  'fails fast on overlapping migrations without releasing the other runner session lock',
  async () =>
    database(async (url) => {
      await fixture(
        { '1781654400000_overlap.sql': 'SELECT pg_sleep(2);' },
        async (directory) => {
          const first = runMigrations(options(url, directory)).then(
            (value) => ({ value }),
            () => ({ value: undefined }),
          );
          try {
            expect(await waitForActive(url, 1)).toBe(true);
            const started = performance.now();
            await expect(
              runMigrations(options(url, directory)),
            ).rejects.toThrow('migration_busy');
            expect(performance.now() - started).toBeLessThan(1000);
            expect(await migrationActive(url)).toBe(1);
            expect((await first).value).toEqual({ applied: 1 });
          } finally {
            await first;
          }
        },
      );
    }),
  15000,
);
it(
  'terminates actual work and releases the session lock on command deadline, allowing forward recovery',
  async () =>
    database(async (url) => {
      await fixture(
        { '1781654400000_slow.sql': 'SELECT pg_sleep(5);' },
        async (directory) => {
          await expect(
            runMigrations({
              ...options(url, directory),
              limits: { commandMs: 150, statementMs: 1000 },
            }),
          ).rejects.toThrow('migration_deadline');
          expect(await waitForActive(url, 0)).toBe(true);
          await writeFile(
            join(directory, '1781654400000_slow.sql'),
            '-- Up Migration\nSELECT 1;\n-- Down Migration\nSELECT 1;',
          );
          expect(await runMigrations(options(url, directory))).toEqual({
            applied: 1,
          });
        },
      );
    }),
  15000,
);
it(
  'enforces the server statement bound and releases locks after a SQL timeout',
  async () =>
    database(async (url) => {
      await fixture(
        { '1781654400000_timeout.sql': 'SELECT pg_sleep(3);' },
        async (directory) => {
          const started = performance.now();
          await expect(
            runMigrations({
              ...options(url, directory),
              limits: { statementMs: 60, commandMs: 2000 },
            }),
          ).rejects.toThrow('migration_failed');
          expect(performance.now() - started).toBeLessThan(1000);
          expect(await waitForActive(url, 0)).toBe(true);
          await writeFile(
            join(directory, '1781654400000_timeout.sql'),
            '-- Up Migration\nSELECT 1;\n-- Down Migration\nSELECT 1;',
          );
          expect(await runMigrations(options(url, directory))).toEqual({
            applied: 1,
          });
        },
      );
    }),
  15000,
);
it('rejects missing dedicated migration configuration rather than falling back to the runtime URL', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', resolve('scripts/migrate.ts')],
    {
      env: {
        ...process.env,
        APP_ENV: 'test',
        MIGRATION_DATABASE_URL: undefined,
        DATABASE_URL: 'CANARY_RUNTIME_URL',
      },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr.trim()).toBe('migration_configuration_invalid');
  expect(result.stdout + result.stderr).not.toContain('CANARY');
});

it(
  'executes the explicit migration CLI against an owned target with safe completion output',
  async () =>
    database(async (url) => {
      for (const applied of [acceptedMigrations.length, 0]) {
        const result = spawnSync(
          process.execPath,
          ['--import', 'tsx', resolve('scripts/migrate.ts')],
          {
            env: {
              ...process.env,
              APP_ENV: 'test',
              MIGRATION_DATABASE_URL: url,
            },
            encoding: 'utf8',
            timeout: 65000,
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
          event: 'migration_completed',
          applied,
        });
        expect(result.stderr).toBe('');
        expect(result.stdout).not.toMatch(/postgres(?:ql)?:\/\//);
      }
    }),
  70000,
);

it(
  'rejects an applied suffix beyond the packaged chain instead of reporting a successful no-op',
  async () =>
    database(async (url) => {
      await fixture(
        {
          '1781654400000_foundation.sql': 'SELECT 1;',
          '1781654400001_future.sql': 'SELECT 1;',
        },
        async (directory) => {
          await runMigrations(options(url, directory));
          await expect(runMigrations(options(url))).rejects.toThrow(
            'migration_failed',
          );
          expect(
            (
              await query(
                url,
                'SELECT name FROM public.pgmigrations ORDER BY id',
              )
            ).rows.map((row) => row.name),
          ).toEqual([baseline, '1781654400001_future']);
        },
      );
    }),
  15000,
);
it(
  'enforces the configured statement cap despite conflicting connection URL options',
  async () =>
    database(async (url) => {
      await fixture(
        { '1781654400000_bound.sql': 'SELECT pg_sleep(0.3);' },
        async (directory) => {
          const target = new URL(url);
          target.searchParams.set('statement_timeout', '0');
          target.searchParams.set('options', '-c statement_timeout=0');
          await expect(
            runMigrations({
              ...options(target.toString(), directory),
              limits: { statementMs: 60, commandMs: 2000 },
            }),
          ).rejects.toThrow('migration_failed');
        },
      );
    }),
  15000,
);

it('sanitizes connection-option parsing failures without retaining private path diagnostics', async () => {
  await expect(
    runMigrations({
      environment: 'test',
      migrationDatabaseUrl:
        'postgresql://127.0.0.1/foundation?sslrootcert=/CANARY_PRIVATE_CA_PATH',
    }),
  ).rejects.toThrow('migration_configuration_invalid');
});
