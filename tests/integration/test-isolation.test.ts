import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { allocateTestDatabase } from '../helpers/test-database';
async function query(url: string, sql: string) {
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 500,
    statement_timeout: 500,
  });
  try {
    await client.connect();
    return await client.query(sql);
  } finally {
    await client.end();
  }
}
async function databaseExists(name: string) {
  const client = new Client({
    host: '127.0.0.1',
    port: 45433,
    user: 'foundation_test_admin',
    database: 'foundation_test_admin',
    password: await readFile('.local/foundation/test-db-password', 'utf8'),
    connectionTimeoutMillis: 500,
  });
  try {
    await client.connect();
    return (
      (await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]))
        .rowCount === 1
    );
  } finally {
    await client.end();
  }
}
it('isolates two simultaneous run/worker allocations and drops only each owned database', async () => {
  const leases = await Promise.all([
    allocateTestDatabase({ purpose: 'isolation' }),
    allocateTestDatabase({ purpose: 'isolation' }),
  ]);
  try {
    expect(leases[0]!.name).not.toBe(leases[1]!.name);
    await Promise.all(
      leases.map((lease, i) =>
        query(
          lease.connectionString,
          `CREATE TABLE fixture_marker(value int); INSERT INTO fixture_marker VALUES (${i + 1})`,
        ),
      ),
    );
    await leases[0]!.dispose();
    expect(await databaseExists(leases[0]!.name)).toBe(false);
    expect(
      (
        await query(
          leases[1]!.connectionString,
          'SELECT value FROM fixture_marker',
        )
      ).rows[0].value,
    ).toBe(2);
    await Promise.all([leases[1]!.dispose(), leases[1]!.dispose()]);
    expect(await databaseExists(leases[1]!.name)).toBe(false);
  } finally {
    await Promise.all(leases.map((lease) => lease.dispose()));
  }
}, 30000);
it('leaves an existing allocation intact when a colliding creation fails', async () => {
  const options = {
    purpose: 'isolation',
    runId: 'a123456789abcdef',
    workerId: 'collision',
  };
  const first = await allocateTestDatabase(options);
  let second: Awaited<ReturnType<typeof allocateTestDatabase>> | undefined;
  try {
    await query(
      first.connectionString,
      'CREATE TABLE fixture_marker(value int); INSERT INTO fixture_marker VALUES (42)',
    );
    let outcome = 'succeeded';
    try {
      second = await allocateTestDatabase(options);
    } catch (error) {
      outcome = error instanceof Error ? error.message : 'unexpected';
    }
    expect(outcome).toBe('test_database_allocation_failed');
    expect(
      (await query(first.connectionString, 'SELECT value FROM fixture_marker'))
        .rows[0].value,
    ).toBe(42);
  } finally {
    await second?.dispose();
    await first.dispose();
  }
}, 30000);
it('cleans an owned database when its requested initializer fails without exposing raw errors', async () => {
  let initialized = false;
  let name = '';
  let lease: Awaited<ReturnType<typeof allocateTestDatabase>> | undefined;
  try {
    let outcome = 'succeeded';
    try {
      lease = await allocateTestDatabase({
        purpose: 'prepared-schema-readiness',
        initialize: async (url) => {
          initialized = true;
          name = (await query(url, 'SELECT current_database() AS name')).rows[0]
            .name;
          throw new Error('CANARY_INITIALIZER_SECRET');
        },
      });
    } catch (error) {
      outcome = error instanceof Error ? error.message : 'unexpected';
    }
    expect(initialized).toBe(true);
    expect(outcome).toBe('test_database_initialization_failed');
    expect(await databaseExists(name)).toBe(false);
  } finally {
    await lease?.dispose();
  }
}, 30000);
it('keeps migration-under-test allocations empty and never invokes a supplied initializer', async () => {
  let initialized = false;
  const lease = await allocateTestDatabase({
    purpose: 'migration-under-test',
    initialize: async () => {
      initialized = true;
    },
  });
  try {
    expect(initialized).toBe(false);
    expect(
      (
        await query(
          lease.connectionString,
          "SELECT to_regclass('public.pgmigrations') AS ledger",
        )
      ).rows[0].ledger,
    ).toBeNull();
  } finally {
    await lease.dispose();
  }
}, 30000);

it('runs the guarded fixture CLI without exposing its connection settings', async () => {
  const { spawnSync } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', resolve('scripts/test-database.ts')],
    {
      env: { ...process.env, APP_ENV: 'test' },
      encoding: 'utf8',
      timeout: 65000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  const value = JSON.parse(result.stdout);
  expect(value).toMatchObject({ status: 'ok' });
  expect(value.database).toMatch(/^foundation_test_/);
  expect(result.stdout + result.stderr).not.toMatch(/postgres(?:ql)?:\/\//);
}, 70000);
