import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
export function validateTestSettings(
  raw: Readonly<Record<string, string | undefined>>,
) {
  if (
    raw.APP_ENV !== 'test' ||
    raw.TEST_DB_HOST !== '127.0.0.1' ||
    raw.TEST_DB_PORT !== '45433' ||
    raw.TEST_DB_ADMIN_USER !== 'foundation_test_admin' ||
    raw.TEST_DB_ADMIN_DATABASE !== 'foundation_test_admin'
  )
    throw new Error('unsafe_test_target');
  return {
    host: '127.0.0.1',
    port: 45433,
    user: 'foundation_test_admin',
    database: 'foundation_test_admin',
  };
}
export function validateTestDatabaseName(name: string): void {
  if (
    !/^foundation_test_[a-z0-9][a-z0-9_]*$/.test(name) ||
    Buffer.byteLength(name) > 63
  )
    throw new Error('unsafe_test_database');
}
export function createTestOwnership(run: string, worker: string) {
  if (!/^[a-f0-9]{16}$/.test(run) || !/^[a-z0-9_]{1,12}$/.test(worker))
    throw new Error('unsafe_test_owner');
  const prefix = `foundation_test_${run}_${worker}_`;
  const owned = new Set<string>();
  let sequence = 0;
  return {
    allocateName() {
      const name = prefix + (sequence++).toString(36);
      validateTestDatabaseName(name);
      return name;
    },
    record(name: string) {
      validateTestDatabaseName(name);
      if (!name.startsWith(prefix)) throw new Error('unowned_test_database');
      owned.add(name);
    },
    assertOwned(name: string) {
      validateTestDatabaseName(name);
      if (!owned.has(name)) throw new Error('unowned_test_database');
    },
    forget(name: string) {
      owned.delete(name);
    },
  };
}
export async function withinTestDeadline<T>(
  work: Promise<T>,
  force: () => void,
  milliseconds = 30000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => {
            try {
              force();
            } finally {
              reject(new Error('test_database_deadline'));
            }
          },
          Math.max(1, milliseconds),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const run = randomUUID().replaceAll('-', '').slice(0, 16);
let worker = 0;
export async function allocateTestDatabase() {
  const target = validateTestSettings({
    APP_ENV: process.env.APP_ENV,
    TEST_DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
    TEST_DB_PORT: process.env.TEST_DB_PORT ?? '45433',
    TEST_DB_ADMIN_USER:
      process.env.TEST_DB_ADMIN_USER ?? 'foundation_test_admin',
    TEST_DB_ADMIN_DATABASE:
      process.env.TEST_DB_ADMIN_DATABASE ?? 'foundation_test_admin',
  });
  const password = await readFile(
    process.env.FOUNDATION_TEST_PASSWORD_FILE ??
      '.local/foundation/test-db-password',
    'utf8',
  ).catch(() => {
    throw new Error('test_database_secret_file_unavailable');
  });
  const owner = createTestOwnership(run, (worker++).toString(36));
  const name = owner.allocateName();
  const configuration = {
    ...target,
    password,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
    application_name: 'foundation_test_allocator',
  };
  const admin = new Client(configuration);
  admin.on('error', () => {});
  const started = performance.now();
  let created = false;
  const terminate = () => {
    void admin.end().catch(() => {});
  };
  const cleanup = async (milliseconds = 30000) => {
    owner.assertOwned(name);
    const client = new Client(configuration);
    client.on('error', () => {});
    try {
      await withinTestDeadline(
        (async () => {
          await client.connect();
          await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        })(),
        () => {
          void client.end().catch(() => {});
        },
        milliseconds,
      );
      owner.forget(name);
    } catch {
      throw new Error('test_database_cleanup_failed');
    } finally {
      await client.end().catch(() => {});
    }
  };
  try {
    await withinTestDeadline(
      (async () => {
        await admin.connect();
        owner.record(name);
        await admin.query(`CREATE DATABASE "${name}"`);
        created = true;
      })(),
      terminate,
    );
  } catch {
    const remaining = 30000 - (performance.now() - started);
    if (created && remaining > 1) await cleanup(remaining);
    throw new Error('test_database_allocation_failed');
  } finally {
    await admin.end().catch(() => {});
  }
  let released = false;
  const url = new URL(`postgresql://${target.host}:${target.port}/${name}`);
  url.username = target.user;
  url.password = password;
  return {
    name,
    connectionString: url.toString(),
    async dispose() {
      if (released) return;
      await cleanup();
      released = true;
    },
  };
}
