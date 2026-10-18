import { expect, it, vi } from 'vitest';
import {
  validateTestSettings,
  validateTestDatabaseName,
  createTestOwnership,
  withinTestDeadline,
} from '../helpers/test-database';
const approved = {
  APP_ENV: 'test',
  TEST_DB_HOST: '127.0.0.1',
  TEST_DB_PORT: '45433',
  TEST_DB_ADMIN_USER: 'foundation_test_admin',
  TEST_DB_ADMIN_DATABASE: 'foundation_test_admin',
};
it('accepts only the explicit dedicated test target', () => {
  expect(validateTestSettings(approved)).toMatchObject({
    host: '127.0.0.1',
    port: 45433,
    user: 'foundation_test_admin',
    database: 'foundation_test_admin',
  });
});
for (const overrides of [
  { APP_ENV: 'production' },
  { APP_ENV: 'development' },
  { APP_ENV: undefined },
  { TEST_DB_HOST: 'localhost' },
  { TEST_DB_HOST: 'db.production.invalid' },
  { TEST_DB_PORT: '45432' },
  { TEST_DB_ADMIN_USER: 'foundation_dev_owner' },
  { TEST_DB_ADMIN_DATABASE: 'foundation_development' },
])
  it(`rejects unsafe target fields ${Object.keys(overrides).join(',')} without values`, () => {
    expect(() => validateTestSettings({ ...approved, ...overrides })).toThrow(
      'unsafe_test_target',
    );
  });
for (const name of [
  'postgres',
  'foundation_development',
  'foundation_test_',
  'foundation_test_UPPER',
  'foundation_test_x;drop',
  'foundation_test_x-y',
  'foundation_test_' + 'a'.repeat(49),
])
  it(`rejects invalid database identifier length/shape ${name.length}`, () => {
    expect(() => validateTestDatabaseName(name)).toThrow(
      'unsafe_test_database',
    );
  });
it('enforces unique run/worker ownership and refuses foreign cleanup names', () => {
  const owner = createTestOwnership('0123456789abcdef', 'worker_1');
  const name = owner.allocateName();
  validateTestDatabaseName(name);
  expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63);
  expect(owner.allocateName()).not.toBe(name);
  expect(() => owner.assertOwned(name)).toThrow('unowned_test_database');
  owner.record(name);
  expect(() => owner.assertOwned(name)).not.toThrow();
  expect(() => owner.assertOwned('foundation_test_other_worker')).toThrow(
    'unowned_test_database',
  );
  owner.forget(name);
  expect(() => owner.assertOwned(name)).toThrow('unowned_test_database');
});
it('terminates owned work at the thirty-second setup/teardown deadline', async () => {
  vi.useFakeTimers();
  let forced = false;
  let result = 'pending';
  try {
    const pending = withinTestDeadline(new Promise<void>(() => {}), () => {
      forced = true;
    }).catch(() => {
      result = 'deadline';
    });
    await vi.advanceTimersByTimeAsync(30001);
    expect(forced).toBe(true);
    expect(result).toBe('deadline');
    await pending;
  } finally {
    vi.useRealTimers();
  }
});

it('rejects missing explicit environment through the actual allocator before credential access', async () => {
  const { allocateTestDatabase } = await import('../helpers/test-database');
  vi.stubEnv('APP_ENV', undefined);
  vi.stubEnv(
    'FOUNDATION_TEST_PASSWORD_FILE',
    '/nonexistent/should-not-read-test-secret',
  );
  let outcome = 'allocation_succeeded';
  let lease: Awaited<ReturnType<typeof allocateTestDatabase>> | undefined;
  try {
    try {
      lease = await allocateTestDatabase();
    } catch (error) {
      outcome = error instanceof Error ? error.message : 'unexpected';
    }
  } finally {
    await lease?.dispose();
    vi.unstubAllEnvs();
  }
  expect(outcome).toBe('unsafe_test_target');
});
