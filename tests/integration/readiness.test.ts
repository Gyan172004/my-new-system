import { Client } from 'pg';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  allocateTestDatabase,
  type TestDatabaseOptions,
} from '../helpers/test-database';
import { runMigrations } from '../../scripts/migrate';
import { createDatabase } from '../../src/server/database';
import { parseRuntimeConfig } from '../../src/server/config';
import { readiness } from '../../src/server/health';
const baseline = '1781654400000_foundation';
const migrate = async (url: string, signal: AbortSignal) => {
  await runMigrations({
    environment: 'test',
    migrationDatabaseUrl: url,
    signal,
  });
};
const prepared: TestDatabaseOptions = {
  purpose: 'prepared-schema-readiness',
  initialize: migrate,
};
function database(url: string, extra: Record<string, string> = {}) {
  return createDatabase(
    parseRuntimeConfig({ APP_ENV: 'test', DATABASE_URL: url, ...extra }),
  );
}
function probe(
  db: ReturnType<typeof createDatabase>,
  expected: readonly string[] = [baseline],
) {
  return readiness({
    state: () => 'SERVING',
    expected,
    deadlineMs: 2000,
    check: (signal) => db.observe(signal),
  });
}
async function owned(
  options: TestDatabaseOptions,
  work: (
    lease: Awaited<ReturnType<typeof allocateTestDatabase>>,
  ) => Promise<void>,
) {
  const lease = await allocateTestDatabase(options);
  try {
    await work(lease);
  } finally {
    await lease.dispose();
  }
}
it(
  'reports no-ledger storage unavailable without repair or migrations',
  async () =>
    owned({ purpose: 'no-ledger-readiness' }, async (lease) => {
      const db = database(lease.connectionString);
      try {
        const report = await probe(db);
        expect(report.httpStatus).toBe(503);
        expect(report.body.checks).toEqual({
          application: 'ok',
          database: 'ok',
          schema: 'unavailable',
        });
        expect(await db.observe(new AbortController().signal)).toEqual({
          revisions: null,
        });
      } finally {
        await db.close();
      }
    }),
  15000,
);
it(
  'accepts only exact prepared history with absent optional model/audio/sandbox credentials',
  async () =>
    owned(prepared, async (lease) => {
      const db = database(lease.connectionString);
      try {
        const healthy = await probe(db);
        expect(healthy.httpStatus).toBe(200);
        expect(healthy.body.checks).toEqual({
          application: 'ok',
          database: 'ok',
          schema: 'ok',
        });
        for (const expected of [
          [],
          [baseline, '1781654400001_missing'],
          ['1781654400000_unknown'],
        ]) {
          const report = await probe(db, expected);
          expect(report.httpStatus).toBe(503);
          expect(report.body.checks.schema).toBe('unavailable');
        }
      } finally {
        await db.close();
      }
    }),
  15000,
);
it(
  'rejects actual newer or unknown applied revisions using library-created history',
  async () =>
    owned(prepared, async (lease) => {
      const root = await mkdtemp(join(tmpdir(), 'foundation-readiness-'));
      const db = database(lease.connectionString);
      try {
        await writeFile(
          join(root, baseline + '.sql'),
          '-- Up Migration\nSELECT 1;\n-- Down Migration\nSELECT 1;',
        );
        await writeFile(
          join(root, '1781654400001_unknown.sql'),
          '-- Up Migration\nSELECT 1;\n-- Down Migration\nSELECT 1;',
        );
        await runMigrations({
          environment: 'test',
          migrationDatabaseUrl: lease.connectionString,
          directory: root,
        });
        expect((await probe(db)).body.checks.schema).toBe('unavailable');
        expect(
          (await probe(db, [baseline, '1781654400001_unknown'])).httpStatus,
        ).toBe(200);
      } finally {
        await db.close();
        await rm(root, { recursive: true, force: true });
      }
    }),
  15000,
);
it(
  'bounds exhausted-pool readiness and recovers after its owning request releases',
  async () =>
    owned(prepared, async (lease) => {
      const db = database(lease.connectionString, { DB_POOL_MAX: '1' });
      let release!: () => void;
      let ready!: () => void;
      const held = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const unblock = new Promise<void>((resolve) => {
        release = resolve;
      });
      const work = db.withClient(async (client) => {
        await client.query('SELECT 1');
        ready();
        await unblock;
      });
      try {
        await held;
        const start = performance.now();
        const report = await probe(db);
        expect(report.body.checks).toEqual({
          application: 'ok',
          database: 'unavailable',
          schema: 'skipped',
        });
        expect(performance.now() - start).toBeLessThan(1500);
        release();
        await work;
        expect((await probe(db)).httpStatus).toBe(200);
      } finally {
        release();
        await work;
        await db.close();
      }
    }),
  15000,
);
it(
  'cancels an actual blocked ledger query and recovers after the test transaction releases its lock',
  async () =>
    owned(prepared, async (lease) => {
      const db = database(lease.connectionString);
      const lock = new Client({
        connectionString: lease.connectionString,
        connectionTimeoutMillis: 500,
      });
      try {
        await lock.connect();
        await lock.query('BEGIN');
        await lock.query(
          'LOCK TABLE public.pgmigrations IN ACCESS EXCLUSIVE MODE',
        );
        const start = performance.now();
        const report = await probe(db);
        expect(report.httpStatus).toBe(503);
        expect(report.body.checks.database).toBe('unavailable');
        expect(performance.now() - start).toBeLessThan(1500);
        const pending = await lock.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='foundation_runtime' AND state='active'",
        );
        expect(pending.rows[0].n).toBe(0);
        await lock.query('ROLLBACK');
        expect((await probe(db)).httpStatus).toBe(200);
      } finally {
        await lock.end();
        await db.close();
      }
    }),
  15000,
);
it('recovers after an owned database is removed and restored through actual migration initialization', async () => {
  const options = {
    ...prepared,
    runId: 'b123456789abcdef',
    workerId: 'restore',
  };
  const first = await allocateTestDatabase(options);
  let second: Awaited<ReturnType<typeof allocateTestDatabase>> | undefined;
  const db = database(first.connectionString);
  try {
    expect((await probe(db)).httpStatus).toBe(200);
    await first.dispose();
    expect((await probe(db)).httpStatus).toBe(503);
    second = await allocateTestDatabase(options);
    expect(second.name).toBe(first.name);
    expect((await probe(db)).httpStatus).toBe(200);
  } finally {
    await db.close();
    await second?.dispose();
    await first.dispose();
  }
}, 15000);
