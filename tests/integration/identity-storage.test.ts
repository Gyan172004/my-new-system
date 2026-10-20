import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { allocateTestDatabase } from '../helpers/test-database';
import { runMigrations } from '../../scripts/migrate';
import { createDatabase } from '../../src/server/database';
import { parseRuntimeConfig } from '../../src/server/config';
let lease: Awaited<ReturnType<typeof allocateTestDatabase>>;
let db: ReturnType<typeof createDatabase>;
beforeAll(async () => {
  lease = await allocateTestDatabase({ purpose: 'migration-under-test' });
  await runMigrations({
    environment: 'test',
    migrationDatabaseUrl: lease.connectionString,
  });
  db = createDatabase(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: lease.connectionString,
    }),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
  await lease?.dispose();
}, 30000);
const alice = {
  provider: 'test' as const,
  issuer: 'test://local',
  subject: 'alice',
};
it('migrates real domain tables and retains uniqueness and owner indexes', async () => {
  const result = await db.withClient((c) =>
    c.query(
      "SELECT to_regclass('users') AS users, to_regclass('interview_sessions') AS sessions, to_regclass('session_events') AS events",
    ),
  );
  expect(result.rows[0]).toEqual({
    users: 'users',
    sessions: 'interview_sessions',
    events: 'session_events',
  });
});
it('maps simultaneous first requests to one stable user; scopes issuers and preserves disablement', async () => {
  const { createUserRepository } =
    await import('../../src/modules/identity-profile/persistence/users');
  const users = createUserRepository(db);
  const results = await Promise.all(
    Array.from({ length: 12 }, () => users.resolve(alice)),
  );
  expect(new Set(results.map((u) => u.id)).size).toBe(1);
  const id = results[0]!.id;
  expect(
    (await users.resolve({ ...alice, issuer: 'test://other' })).id,
  ).not.toBe(id);
  expect((await users.resolve({ ...alice, subject: 'bob' })).id).not.toBe(id);
  await db.withClient((c) =>
    c.query("UPDATE users SET account_status='disabled' WHERE id=$1", [id]),
  );
  expect(await users.resolve(alice)).toEqual({ id, status: 'disabled' });
  const count = await db.withClient((c) =>
    c.query(
      'SELECT count(*)::int AS n FROM users WHERE identity_issuer=$1 AND identity_subject=$2',
      [alice.issuer, alice.subject],
    ),
  );
  expect(count.rows[0].n).toBe(1);
});
it('denies foreign reads/writes identically to absence and atomically guards real snapshots and events', async () => {
  const { createUserRepository } =
    await import('../../src/modules/identity-profile/persistence/users');
  const { createSessionService } =
    await import('../../src/modules/interview-session/application/service');
  const users = createUserRepository(db);
  const owner = {
    userId: (await users.resolve({ ...alice, subject: 'owner' })).id,
  };
  const stranger = {
    userId: (await users.resolve({ ...alice, subject: 'stranger' })).id,
  };
  const sessions = createSessionService(db);
  await expect(
    sessions.createPinned(
      { userId: randomUUID() },
      {
        problemId: 'x',
        problemPackVersion: 'v1',
        clientContext: { selfReportedExperience: 'x'.repeat(2001) },
      },
    ),
  ).rejects.toThrow('invalid_session_input');
  const first = await sessions.createPinned(owner, {
    problemId: 'fixture-problem',
    problemPackVersion: 'fixture-v1',
  });
  expect(first).toMatchObject({
    currentStage: 'created',
    status: 'created',
    version: 0,
  });
  expect(await sessions.readOwned(stranger, first.sessionId)).toBeNull();
  expect(await sessions.readOwned(stranger, randomUUID())).toBeNull();
  expect(await sessions.startOwned(stranger, first.sessionId, 0)).toEqual({
    outcome: 'not_found',
  });
  expect(await sessions.readOwned(owner, first.sessionId)).toEqual(first);
  const races = await Promise.all([
    sessions.startOwned(owner, first.sessionId, 0),
    sessions.startOwned(owner, first.sessionId, 0),
  ]);
  expect(races.map((r) => r.outcome).sort()).toEqual([
    'accepted',
    'stale_version',
  ]);
  expect(await sessions.readOwned(owner, first.sessionId)).toMatchObject({
    currentStage: 'intro',
    status: 'active',
    version: 1,
    problemPackVersion: 'fixture-v1',
  });
  expect(await sessions.startOwned(owner, first.sessionId, 1)).toEqual({
    outcome: 'invalid_transition',
  });
  const events = await db.withClient((c) =>
    c.query(
      'SELECT session_version,event_type,payload FROM session_events WHERE session_id=$1 ORDER BY session_version',
      [first.sessionId],
    ),
  );
  expect(events.rows.map((r) => [r.session_version, r.event_type])).toEqual([
    [0, 'interview.session.created'],
    [1, 'interview.session.started'],
  ]);
  expect(events.rows[1].payload).toMatchObject({
    userId: owner.userId,
    sessionVersion: 1,
  });
});
it('rolls back the snapshot when the event insert fails, preserving the pack pin', async () => {
  const { createUserRepository } =
    await import('../../src/modules/identity-profile/persistence/users');
  const { createSessionService } =
    await import('../../src/modules/interview-session/application/service');
  const owner = {
    userId: (
      await createUserRepository(db).resolve({ ...alice, subject: 'rollback' })
    ).id,
  };
  const sessions = createSessionService(db);
  const before = await sessions.createPinned(owner, {
    problemId: 'fixture-problem',
    problemPackVersion: 'fixture-v1',
  });
  await db.withClient((c) =>
    c.query(
      "ALTER TABLE session_events ADD CONSTRAINT fixture_event_failure CHECK (event_type <> 'interview.session.started') NOT VALID",
    ),
  );
  try {
    await expect(
      sessions.startOwned(owner, before.sessionId, 0),
    ).rejects.toThrow('session_unavailable');
  } finally {
    await db.withClient((c) =>
      c.query(
        'ALTER TABLE session_events DROP CONSTRAINT fixture_event_failure',
      ),
    );
  }
  expect(await sessions.readOwned(owner, before.sessionId)).toEqual(before);
  const events = await db.withClient((c) =>
    c.query(
      'SELECT count(*)::int AS n FROM session_events WHERE session_id=$1',
      [before.sessionId],
    ),
  );
  expect(events.rows[0].n).toBe(1);
  await expect(
    db.withClient((c) =>
      c.query(
        "UPDATE interview_sessions SET problem_pack_version='other' WHERE id=$1",
        [before.sessionId],
      ),
    ),
  ).rejects.toThrow('database_unavailable');
});
it('rejects oversized/untrusted context and invalid IDs before persistence', async () => {
  const { createSessionService } =
    await import('../../src/modules/interview-session/application/service');
  const sessions = createSessionService(db);
  await expect(
    sessions.createPinned({ userId: randomUUID() }, {
      problemId: 'x',
      problemPackVersion: 'v1',
      clientContext: { hiddenTests: 'private' },
    } as never),
  ).rejects.toThrow('invalid_session_input');
  expect(
    await sessions.readOwned({ userId: randomUUID() }, 'bad-id'),
  ).toBeNull();
});

it('returns no provisional identity on storage outage/cancellation and recovers the stable mapping', async () => {
  const { createUserRepository } =
    await import('../../src/modules/identity-profile/persistence/users');
  const { createAuthenticator } =
    await import('../../src/modules/identity-profile/application/authenticate');
  const { createTestVerifier } =
    await import('../../src/modules/identity-profile/adapters/test-verifier');
  const { createAdmission } =
    await import('../../src/modules/identity-profile/application/admission');
  const users = createUserRepository(db);
  const before = await users.resolve({ ...alice, subject: 'outage' });
  const separate = createDatabase(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: lease.connectionString,
    }),
  );
  const failing = createUserRepository(separate);
  await separate.close();
  await expect(
    failing.resolve({ ...alice, subject: 'outage' }),
  ).rejects.toThrow('database_unavailable');
  await expect(
    users.resolve({ ...alice, subject: 'outage' }, AbortSignal.abort()),
  ).rejects.toThrow('database_unavailable');
  expect(await users.resolve({ ...alice, subject: 'outage' })).toEqual(before);
  const authenticate = createAuthenticator({
    mode: 'test',
    verifier: createTestVerifier('test'),
    admission: createAdmission(),
    resolveUser: users.resolve,
  });
  const disabled = await users.resolve(alice);
  await db.withClient((c) =>
    c.query("UPDATE users SET account_status='disabled' WHERE id=$1", [
      disabled.id,
    ]),
  );
  await expect(
    authenticate({
      authorization: 'Bearer test_alice',
      sourceAddress: '127.0.0.1',
    }),
  ).rejects.toMatchObject({ status: 403 });
  const unavailable = createAuthenticator({
    mode: 'test',
    verifier: createTestVerifier('test'),
    admission: createAdmission(),
    resolveUser: failing.resolve,
  });
  await expect(
    unavailable({
      authorization: 'Bearer test_bob',
      sourceAddress: '127.0.0.1',
    }),
  ).rejects.toMatchObject({ status: 503, code: 'identity_unavailable' });
});

it('preserves contract-valid language and Unicode experience through real storage', async () => {
  const { createUserRepository } =
    await import('../../src/modules/identity-profile/persistence/users');
  const { createSessionService } =
    await import('../../src/modules/interview-session/application/service');
  const owner = {
    userId: (
      await createUserRepository(db).resolve({
        ...alice,
        subject: 'unicode-context',
      })
    ).id,
  };
  const sessions = createSessionService(db);
  const input = {
    problemId: 'é'.repeat(128),
    problemPackVersion: '版本'.repeat(42),
    clientContext: {
      preferredInterviewLanguage: 'language'.repeat(50),
      selfReportedExperience: '🙂'.repeat(2000),
    },
  };
  const created = await sessions.createPinned(owner, input);
  expect(await sessions.readOwned(owner, created.sessionId)).toMatchObject({
    problemId: input.problemId,
    problemPackVersion: input.problemPackVersion,
  });
  const stored = await db.withClient((c) =>
    c.query('SELECT context FROM interview_sessions WHERE id=$1', [
      created.sessionId,
    ]),
  );
  expect(stored.rows[0].context).toEqual(input.clientContext);
  await expect(
    sessions.createPinned(owner, {
      ...input,
      clientContext: { selfReportedExperience: '🙂'.repeat(2001) },
    }),
  ).rejects.toThrow('invalid_session_input');
});
it.each(['problemId', 'problemPackVersion'] as const)(
  'rejects an oversized UTF-8 %s as input, before database work',
  async (field) => {
    const { createSessionService } =
      await import('../../src/modules/interview-session/application/service');
    const sessions = createSessionService(db);
    await expect(
      sessions.createPinned(
        { userId: randomUUID() },
        { problemId: 'x', problemPackVersion: 'v1', [field]: 'é'.repeat(129) },
      ),
    ).rejects.toThrow('invalid_session_input');
  },
);
