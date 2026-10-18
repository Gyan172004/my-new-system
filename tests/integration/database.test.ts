import { beforeAll, afterAll, expect, it } from 'vitest';
import { Client } from 'pg';
import { allocateTestDatabase } from '../helpers/test-database';
import { createDatabase } from '../../src/server/database';
import { parseRuntimeConfig } from '../../src/server/config';
let lease: Awaited<ReturnType<typeof allocateTestDatabase>>;
beforeAll(async () => {
  lease = await allocateTestDatabase();
}, 30000);
afterAll(async () => {
  await lease?.dispose();
}, 30000);
function config(extra: Record<string, string> = {}) {
  return parseRuntimeConfig({
    APP_ENV: 'test',
    DATABASE_URL: lease.connectionString,
    ...extra,
  });
}
async function inspect(sql: string) {
  const client = new Client({
    connectionString: lease.connectionString,
    connectionTimeoutMillis: 500,
  });
  try {
    await client.connect();
    return await client.query(sql);
  } finally {
    await client.end();
  }
}
it('creates no connection until used, releases successful work and observes absent ledger without DDL', async () => {
  const db = createDatabase(config());
  try {
    expect(
      (
        await inspect(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='foundation_runtime'",
        )
      ).rows[0].n,
    ).toBe(0);
    const result = await db.withClient((client) =>
      client.query('SELECT 42 AS answer'),
    );
    expect(result.rows[0].answer).toBe(42);
    expect(await db.observe(new AbortController().signal)).toEqual({
      revisions: null,
    });
    expect(
      (await inspect("SELECT to_regclass('public.pgmigrations') AS ledger"))
        .rows[0].ledger,
    ).toBeNull();
  } finally {
    await db.close();
  }
});
it('bounds actual pg_sleep work and leaves no active query after timeout', async () => {
  const db = createDatabase(config());
  const start = performance.now();
  try {
    await expect(
      db.withClient((client) =>
        client.query('SELECT pg_sleep(5) /* foundation_slow_query */'),
      ),
    ).rejects.toThrow('database_unavailable');
    expect(performance.now() - start).toBeLessThan(1200);
    expect(
      (
        await inspect(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND application_name='foundation_runtime' AND query LIKE '%foundation_slow_query%'",
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (await db.withClient((client) => client.query('SELECT 1 AS n'))).rows[0]
        .n,
    ).toBe(1);
  } finally {
    await db.close();
  }
});
it('times out pool acquisition rather than queuing indefinitely, then recovers', async () => {
  const db = createDatabase(config({ DB_POOL_MAX: '1' }));
  await expect(
    db.withClient((client) => client.query('SELECT 1')),
  ).resolves.toBeDefined();
  let release!: () => void;
  let acquired!: () => void;
  const held = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const blocker = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = db.withClient(async (client) => {
    await client.query('SELECT 1');
    acquired();
    await blocker;
  });
  try {
    await held;
    const start = performance.now();
    await expect(
      db.withClient((client) => client.query('SELECT 1')),
    ).rejects.toThrow('database_unavailable');
    expect(performance.now() - start).toBeLessThan(1200);
  } finally {
    release();
    await first;
    await db.close();
  }
});
it('destroys a checked-out client on abort and on the enclosing deadline', async () => {
  const db = createDatabase(
    config({
      DB_CONNECT_TIMEOUT_MS: '40',
      DB_STATEMENT_TIMEOUT_MS: '40',
      READINESS_TIMEOUT_MS: '100',
    }),
  );
  try {
    const abort = new AbortController();
    const work = db.withClient(
      (client) => client.query('SELECT pg_sleep(5)'),
      abort.signal,
    );
    setTimeout(() => abort.abort(), 15);
    await expect(work).rejects.toThrow('database_unavailable');
    const start = performance.now();
    await expect(
      db.withClient(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }),
    ).rejects.toThrow('database_unavailable');
    expect(performance.now() - start).toBeLessThan(400);
    expect(
      (
        await inspect(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='foundation_runtime' AND state='active'",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await db.close();
  }
});
it('prevents new work after shutdown and terminates an owned checked-out connection', async () => {
  const db = createDatabase(config());
  await expect(
    db.withClient((client) => client.query('SELECT 1')),
  ).resolves.toBeDefined();
  let ready!: () => void;
  const active = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const work = db.withClient(async (client) => {
    ready();
    return client.query('SELECT pg_sleep(5)');
  });
  await active;
  db.destroy();
  await expect(work).rejects.toThrow('database_unavailable');
  await db.close();
  await expect(
    db.withClient((client) => client.query('SELECT 1')),
  ).rejects.toThrow('database_unavailable');
});

it('sanitizes idle pool errors and reconnects after an owned backend is terminated', async () => {
  let output = '';
  const { Writable } = await import('node:stream');
  const { createSafeLogger } = await import('../../src/server/logger');
  const db = createDatabase(
    config(),
    createSafeLogger(
      config(),
      new Writable({
        write(chunk, _encoding, next) {
          output += chunk.toString();
          next();
        },
      }),
    ),
  );
  try {
    const pid = (
      await db.withClient((client) =>
        client.query('SELECT pg_backend_pid() AS pid'),
      )
    ).rows[0].pid;
    const admin = new Client({
      connectionString: lease.connectionString,
      connectionTimeoutMillis: 500,
    });
    try {
      await admin.connect();
      await admin.query('SELECT pg_terminate_backend($1)', [pid]);
    } finally {
      await admin.end();
    }
    const until = performance.now() + 2000;
    while (!output && performance.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 20));
    expect(output).not.toBe('');
    expect(output).not.toContain('terminating connection');
    expect(output).not.toContain(lease.connectionString);
    expect(JSON.parse(output.trim())).toMatchObject({
      event: 'database_error',
      code: 'database_unavailable',
    });
    expect(
      (await db.withClient((client) => client.query('SELECT 1 AS n'))).rows[0]
        .n,
    ).toBe(1);
  } finally {
    await db.close();
  }
});

it('never executes an aborted queued acquisition and recovers after bounded native cleanup', async () => {
  const db = createDatabase(config({ DB_POOL_MAX: '1' }));
  let release!: () => void;
  let ready!: () => void;
  let ran = false;
  const held = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const unblock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = db.withClient(async (client) => {
    await client.query('SELECT 1');
    ready();
    await unblock;
  });
  try {
    await held;
    const abort = new AbortController();
    const waiting = db.withClient(async (client) => {
      ran = true;
      await client.query('SELECT 1');
    }, abort.signal);
    setTimeout(() => abort.abort(), 15);
    await expect(waiting).rejects.toThrow('database_unavailable');
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(ran).toBe(false);
    release();
    await first;
    expect(
      (await db.withClient((client) => client.query('SELECT 1 AS n'))).rows[0]
        .n,
    ).toBe(1);
  } finally {
    release();
    await first;
    await db.close();
  }
});

it('does not let connection URL parameters disable runtime query/statement bounds', async () => {
  const target = new URL(lease.connectionString);
  target.searchParams.set('statement_timeout', '0');
  target.searchParams.set('query_timeout', '10000');
  target.searchParams.set('options', '-c statement_timeout=0');
  const db = createDatabase(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: target.toString(),
      DB_CONNECT_TIMEOUT_MS: '100',
      DB_STATEMENT_TIMEOUT_MS: '60',
    }),
  );
  try {
    await expect(
      db.withClient((client) => client.query('SELECT pg_sleep(0.3)')),
    ).rejects.toThrow('database_unavailable');
  } finally {
    await db.close();
  }
});
