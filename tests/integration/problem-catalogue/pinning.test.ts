import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createSessionService } from '../../../src/modules/interview-session/public';
import { createSessionRepository } from '../../../src/modules/interview-session/persistence/sessions';
import { createPublishingService } from '../../../src/modules/content-publishing/application/service';
import { eventually } from '../../helpers/process';
import { createCatalogueResolver } from '../../../src/modules/problem-catalogue/public';
import {
  createTransactionRunner,
  type TransactionDatabase,
  type TransactionScope,
} from '../../../src/server/transaction';
import {
  publicationFixture,
  approvedChecklist,
  auth,
} from '../../helpers/catalogue-publication';

let f: Awaited<ReturnType<typeof publicationFixture>>;
beforeAll(async () => {
  f = await publicationFixture();
}, 30000);
afterAll(async () => {
  await f?.close();
}, 30000);
const operator = () => ({ ...auth, sourceAddress: randomUUID() });
async function publish(problemId = 'pin-' + randomUUID(), version = 'A') {
  const pack = structuredClone(f.pack);
  pack.problemId = problemId;
  pack.slug = problemId;
  pack.version = version;
  pack.candidate.statement = `Candidate statement ${version}`;
  const raw = JSON.stringify(pack);
  const reviewed = await f.service.review(operator(), raw, {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  const receipt = await f.service.publish(operator(), raw, reviewed.reviewId);
  return { pack, raw, reviewed, receipt };
}
function instrument(
  after: (sql: string, client: PoolClient) => Promise<void>,
): TransactionDatabase {
  return {
    withClient<T>(
      work: (client: PoolClient) => Promise<T>,
      signal?: AbortSignal,
    ) {
      return f.db.withClient(
        (client) =>
          work(
            new Proxy(client, {
              get(target, key, receiver) {
                if (key === 'query')
                  return async (...args: unknown[]) => {
                    const result = await Reflect.apply(
                      target.query,
                      target,
                      args,
                    );
                    if (typeof args[0] === 'string')
                      await after(args[0], target);
                    return result;
                  };
                return Reflect.get(target, key, receiver);
              },
            }),
          ),
        signal,
      );
    },
  };
}
async function persisted(problemId: string) {
  return (
    await f.db.withClient((c) =>
      c.query(
        "SELECT (SELECT count(*)::int FROM interview_sessions WHERE problem_id=$1) sessions,(SELECT count(*)::int FROM session_events WHERE payload->>'problemId'=$1) events",
        [problemId],
      ),
    )
  ).rows[0];
}
it('resolves and persists one exact session and created event on one backend transaction', async () => {
  const { pack } = await publish();
  const evidence: { sql: string; pid: number; tx: string }[] = [];
  const db = instrument(async (sql, client) => {
    if (sql === 'COMMIT' || sql === 'ROLLBACK') return;
    const row = (
      await client.query(
        'SELECT pg_backend_pid() AS pid, txid_current()::text AS tx',
      )
    ).rows[0];
    evidence.push({ sql, ...row });
  });
  const session = await createSessionService(db).createPublishedSession(
    f.author,
    pack.problemId,
  );
  expect(session).toMatchObject({
    problemId: pack.problemId,
    problemPackVersion: 'A',
    currentStage: 'created',
    status: 'created',
    version: 0,
  });
  expect(evidence.filter((r) => r.sql === 'BEGIN')).toHaveLength(1);
  expect(new Set(evidence.map((r) => r.pid)).size).toBe(1);
  expect(new Set(evidence.map((r) => r.tx)).size).toBe(1);
  const event = (
    await f.db.withClient((c) =>
      c.query(
        'SELECT event_type,session_version,payload FROM session_events WHERE session_id=$1',
        [session.sessionId],
      ),
    )
  ).rows;
  expect(event).toEqual([
    {
      event_type: 'interview.session.created',
      session_version: 0,
      payload: {
        sessionId: session.sessionId,
        userId: f.author.userId,
        sessionVersion: 0,
        problemId: pack.problemId,
        problemPackVersion: 'A',
        stage: 'created',
      },
    },
  ]);
  expect(await persisted(pack.problemId)).toEqual({ sessions: 1, events: 1 });
});
it.each([
  'FROM catalogue_releases WHERE id=',
  'INSERT INTO interview_sessions',
  'INSERT INTO session_events',
])(
  'rolls back resolve, snapshot and event when failure follows %s',
  async (stage) => {
    const { pack } = await publish();
    const db = instrument(async (sql) => {
      if (sql.includes(stage)) throw Error('PRIVATE_DRIVER_CANARY');
    });
    await expect(
      createSessionService(db).createPublishedSession(f.author, pack.problemId),
    ).rejects.toThrow('session_unavailable');
    expect(await persisted(pack.problemId)).toEqual({ sessions: 0, events: 0 });
  },
);
it('rejects unavailable problems without a snapshot or event', async () => {
  const problemId = 'missing-' + randomUUID();
  await expect(
    createSessionService(f.db).createPublishedSession(f.author, problemId),
  ).rejects.toMatchObject({ code: 'problem_unavailable', path: 'problemId' });
  expect(await persisted(problemId)).toEqual({ sessions: 0, events: 0 });
});
it('rejects invalid callers and object/version selectors before opening a database connection', async () => {
  const db: TransactionDatabase = {
    async withClient() {
      throw Error('unexpected_database_access');
    },
  };
  const sessions = createSessionService(db);
  await expect(
    sessions.createPublishedSession({ userId: 'invalid' }, 'valid'),
  ).rejects.toThrow('invalid_session_input');
  for (const id of [
    '',
    ' ',
    'bad\u0000id',
    'x'.repeat(257),
    '\ud800',
    { problemId: 'valid', problemPackVersion: 'chosen' },
  ]) {
    await expect(
      sessions.createPublishedSession(f.author, id as never),
    ).rejects.toThrow('invalid_session_input');
  }
});
it('rejects expired and foreign scopes in the owning session repository and catalogue resolver', async () => {
  const { pack } = await publish();
  const runner = createTransactionRunner(f.db);
  let expired!: TransactionScope;
  await runner.run(async (scope) => {
    expired = scope;
  });
  const repository = createSessionRepository(f.db);
  const input = { problemId: pack.problemId, problemPackVersion: 'A' };
  await expect(
    repository.createInScope(expired, f.author.userId, input),
  ).rejects.toThrow('invalid_transaction_scope');
  await expect(
    createCatalogueResolver(f.db).resolveForNewSession(pack.problemId, expired),
  ).rejects.toThrow('invalid_transaction_scope');
  const foreign = { withClient: f.db.withClient };
  await runner.run(async (scope) => {
    await expect(
      createSessionRepository(foreign).createInScope(
        scope,
        f.author.userId,
        input,
      ),
    ).rejects.toThrow('invalid_transaction_scope');
    await expect(
      createCatalogueResolver(foreign).resolveForNewSession(
        pack.problemId,
        scope,
      ),
    ).rejects.toThrow('invalid_transaction_scope');
  });
  expect(await persisted(pack.problemId)).toEqual({ sessions: 0, events: 0 });
});
it('authorizes the session owner and retains exact A after B publication and withdrawal', async () => {
  const a = await publish();
  const sessions = createSessionService(f.db);
  const original = await sessions.createPublishedSession(
    f.author,
    a.pack.problemId,
  );
  await publish(a.pack.problemId, 'B');
  const next = await sessions.createPublishedSession(
    f.author,
    a.pack.problemId,
  );
  expect(next.problemPackVersion).toBe('B');
  expect(
    await sessions.readPinnedCandidateOwned(f.reviewer, original.sessionId),
  ).toBeNull();
  expect(
    await sessions.readPinnedCandidateOwned(f.reviewer, randomUUID()),
  ).toBeNull();
  expect(
    await sessions.readPinnedCandidateOwned(f.author, 'bad-id'),
  ).toBeNull();
  expect(
    await sessions.readPinnedCandidateOwned(
      { userId: 'bad-user' },
      original.sessionId,
    ),
  ).toBeNull();
  await f.service.withdraw(operator(), a.pack.problemId, 'A', 'content_error');
  await f.service.withdraw(operator(), a.pack.problemId, 'B', 'content_error');
  const pinned = await sessions.readPinnedCandidateOwned(
    f.author,
    original.sessionId,
  );
  expect(pinned).toMatchObject({
    problemId: a.pack.problemId,
    problemPackVersion: 'A',
    candidate: { statement: 'Candidate statement A' },
  });
  expect(pinned).not.toHaveProperty('latestPublishedVersion');
  expect(pinned!.candidate).not.toHaveProperty('interview');
  expect(pinned!.candidate).not.toHaveProperty('evaluation');
  expect(Object.isFrozen(pinned)).toBe(true);
  expect(await sessions.readOwned(f.author, original.sessionId)).toEqual(
    original,
  );
  await expect(
    sessions.createPublishedSession(f.author, a.pack.problemId),
  ).rejects.toMatchObject({ code: 'problem_unavailable' });
  expect(await persisted(a.pack.problemId)).toEqual({ sessions: 2, events: 2 });
});
it('fails recoverably for missing and corrupted historical pins without replacing them with current B', async () => {
  const a = await publish();
  const sessions = createSessionService(f.db);
  const original = await sessions.createPublishedSession(
    f.author,
    a.pack.problemId,
  );
  const missing = await sessions.createPinned(f.author, {
    problemId: a.pack.problemId,
    problemPackVersion: 'missing',
  });
  await publish(a.pack.problemId, 'B');
  await expect(
    sessions.readPinnedCandidateOwned(f.author, missing.sessionId),
  ).rejects.toThrow('pinned_content_unavailable');
  // Simulate storage corruption on this isolated, allocator-owned database.
  // The local setting resets at transaction completion; production writes retain guards.
  await f.db.withClient(async (c) => {
    await c.query('BEGIN');
    try {
      await c.query('SET LOCAL session_replication_role = replica');
      await c.query(
        "UPDATE catalogue_releases SET candidate='{}'::jsonb WHERE id=$1",
        [a.receipt.releaseId],
      );
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    }
  });
  await expect(
    sessions.readPinnedCandidateOwned(f.author, original.sessionId),
  ).rejects.toThrow('pinned_content_unavailable');
  expect(await sessions.readOwned(f.author, original.sessionId)).toEqual(
    original,
  );
});
it.each([
  'FROM catalogue_releases WHERE id=',
  'INSERT INTO interview_sessions',
  'INSERT INTO session_events',
])(
  'cancellation after %s rolls back and releases the eligibility locks',
  async (stage) => {
    const { pack } = await publish();
    const controller = new AbortController();
    const db = instrument(async (sql) => {
      if (sql.includes(stage)) {
        controller.abort();
        throw Error('cancelled-test-operation');
      }
    });
    await expect(
      createSessionService(db).createPublishedSession(
        f.author,
        pack.problemId,
        controller.signal,
      ),
    ).rejects.toThrow('session_unavailable');
    await eventually(
      () =>
        f.db.withClient((c) =>
          c
            .query(
              'SELECT id FROM catalogue_problems WHERE id=$1 FOR UPDATE NOWAIT',
              [pack.problemId],
            )
            .then((r) => r.rowCount),
        ),
      (count) => count === 1,
      1500,
    );
    expect(await persisted(pack.problemId)).toEqual({ sessions: 0, events: 0 });
    expect(
      (
        await createSessionService(f.db).createPublishedSession(
          f.author,
          pack.problemId,
        )
      ).problemPackVersion,
    ).toBe('A');
  },
);
it('a pre-cancelled new pin fails safely without creating rows', async () => {
  const { pack } = await publish();
  const controller = new AbortController();
  controller.abort();
  await expect(
    createSessionService(f.db).createPublishedSession(
      f.author,
      pack.problemId,
      controller.signal,
    ),
  ).rejects.toThrow('session_unavailable');
  expect(await persisted(pack.problemId)).toEqual({ sessions: 0, events: 0 });
});
function gateAfter(stage: string) {
  const held = Promise.withResolvers<number>();
  const resumed = Promise.withResolvers<void>();
  let gated = false;
  const db = instrument(async (sql, client) => {
    if (!gated && sql.includes(stage)) {
      gated = true;
      held.resolve(
        (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,
      );
      await resumed.promise;
    }
  });
  return { db, held: held.promise, release: () => resumed.resolve() };
}
async function blockedBy(pid: number) {
  await eventually(
    () =>
      f.db.withClient(
        async (c) =>
          (
            await c.query(
              'SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND $1::int=ANY(pg_blocking_pids(pid))',
              [pid],
            )
          ).rows[0].n,
      ),
    (count: number) => count > 0,
    1500,
  );
}
function publishing(db: TransactionDatabase) {
  return createPublishingService(db, { identity: f.identity, staff: f.staff });
}
it('a committed pin keeps A when withdrawal waits for its session/event transaction', async () => {
  const a = await publish();
  const gate = gateAfter('INSERT INTO interview_sessions');
  const creation = createSessionService(gate.db).createPublishedSession(
    f.author,
    a.pack.problemId,
  );
  const pid = await gate.held;
  const withdrawal = f.service.withdraw(
    operator(),
    a.pack.problemId,
    'A',
    'content_error',
  );
  try {
    await blockedBy(pid);
  } finally {
    gate.release();
  }
  const session = await creation;
  await withdrawal;
  expect(session.problemPackVersion).toBe('A');
  expect(await persisted(a.pack.problemId)).toEqual({ sessions: 1, events: 1 });
  expect(
    await createSessionService(f.db).readPinnedCandidateOwned(
      f.author,
      session.sessionId,
    ),
  ).toMatchObject({
    problemPackVersion: 'A',
    candidate: { statement: 'Candidate statement A' },
  });
  await expect(
    createSessionService(f.db).createPublishedSession(
      f.author,
      a.pack.problemId,
    ),
  ).rejects.toMatchObject({ code: 'problem_unavailable' });
});
it('withdrawal committing first prevents the waiting new pin without falling back to an older eligible release', async () => {
  const a = await publish();
  await publish(a.pack.problemId, 'B');
  const gate = gateAfter('UPDATE catalogue_release_availability');
  const withdrawal = publishing(gate.db).withdraw(
    operator(),
    a.pack.problemId,
    'B',
    'content_error',
  );
  const pid = await gate.held;
  // Attach rejection observation immediately while proving the lock dependency.
  const creation = createSessionService(f.db)
    .createPublishedSession(f.author, a.pack.problemId)
    .then(
      (session) => ({ session }),
      (error: unknown) => ({ error }),
    );
  try {
    await blockedBy(pid);
  } finally {
    gate.release();
  }
  await withdrawal;
  expect(await creation).toMatchObject({
    error: { code: 'problem_unavailable' },
  });
  expect(await persisted(a.pack.problemId)).toEqual({ sessions: 0, events: 0 });
});
it.each(['pin', 'publication'] as const)(
  '%s committing first selects a coherent pin while publication and creation race',
  async (first) => {
    const a = await publish();
    const b = structuredClone(a.pack);
    b.version = 'B';
    b.candidate.statement = 'Candidate statement B';
    const raw = JSON.stringify(b);
    const review = await f.service.review(operator(), raw, {
      decision: 'approved',
      checklist: approvedChecklist,
    });
    const gate = gateAfter(
      first === 'pin'
        ? 'INSERT INTO interview_sessions'
        : 'UPDATE catalogue_problems SET current_release_id',
    );
    let creation: ReturnType<
      ReturnType<typeof createSessionService>['createPublishedSession']
    >;
    let publication: ReturnType<
      ReturnType<typeof createPublishingService>['publish']
    >;
    if (first === 'pin') {
      creation = createSessionService(gate.db).createPublishedSession(
        f.author,
        a.pack.problemId,
      );
      const pid = await gate.held;
      publication = f.service.publish(operator(), raw, review.reviewId);
      try {
        await blockedBy(pid);
      } finally {
        gate.release();
      }
    } else {
      publication = publishing(gate.db).publish(
        operator(),
        raw,
        review.reviewId,
      );
      const pid = await gate.held;
      creation = createSessionService(f.db).createPublishedSession(
        f.author,
        a.pack.problemId,
      );
      try {
        await blockedBy(pid);
      } finally {
        gate.release();
      }
    }
    const [session] = await Promise.all([creation, publication]);
    const expectedVersion = first === 'pin' ? 'A' : 'B';
    expect(session.problemPackVersion).toBe(expectedVersion);
    expect(
      (
        await f.db.withClient((c) =>
          c.query(
            "SELECT payload->>'problemPackVersion' AS version FROM session_events WHERE session_id=$1",
            [session.sessionId],
          ),
        )
      ).rows,
    ).toEqual([{ version: expectedVersion }]);
    expect(
      (
        await createSessionService(f.db).readPinnedCandidateOwned(
          f.author,
          session.sessionId,
        )
      )?.candidate.statement,
    ).toBe(`Candidate statement ${expectedVersion}`);
    expect(
      (
        await createSessionService(f.db).createPublishedSession(
          f.author,
          a.pack.problemId,
        )
      ).problemPackVersion,
    ).toBe('B');
  },
);
it('an exact publication retry after a lost commit response cannot change an existing session pin', async () => {
  const a = await publish();
  const sessions = createSessionService(f.db);
  const session = await sessions.createPublishedSession(
    f.author,
    a.pack.problemId,
  );
  const b = structuredClone(a.pack);
  b.version = 'B';
  b.candidate.statement = 'Candidate statement B';
  const raw = JSON.stringify(b);
  const review = await f.service.review(operator(), raw, {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  let committed = false;
  const db = instrument(async (sql) => {
    if (sql === 'COMMIT') {
      committed = true;
      throw Error('lost-commit-response');
    }
  });
  await expect(
    publishing(db).publish(operator(), raw, review.reviewId),
  ).rejects.toThrow('database_unavailable');
  expect(committed).toBe(true);
  const receipt = await f.service.publish(operator(), raw, review.reviewId);
  await expect(
    f.service.publish(operator(), raw, review.reviewId),
  ).resolves.toEqual(receipt);
  expect(await persisted(a.pack.problemId)).toEqual({ sessions: 1, events: 1 });
  expect(await sessions.readOwned(f.author, session.sessionId)).toEqual(
    session,
  );
  expect(
    await sessions.readPinnedCandidateOwned(f.author, session.sessionId),
  ).toMatchObject({ problemPackVersion: 'A' });
  expect(
    (await sessions.createPublishedSession(f.author, a.pack.problemId))
      .problemPackVersion,
  ).toBe('B');
});
it('does not query historical catalogue content for a foreign or absent session', async () => {
  const a = await publish();
  const session = await createSessionService(f.db).createPublishedSession(
    f.author,
    a.pack.problemId,
  );
  let historicalReads = 0;
  const db = instrument(async (sql) => {
    if (sql.includes('FROM catalogue_releases')) {
      historicalReads++;
      throw Error('historical-read-must-be-authorized');
    }
  });
  const sessions = createSessionService(db);
  expect(
    await sessions.readPinnedCandidateOwned(f.reviewer, session.sessionId),
  ).toBeNull();
  expect(
    await sessions.readPinnedCandidateOwned(f.author, randomUUID()),
  ).toBeNull();
  expect(historicalReads).toBe(0);
});
it('masks storage faults in owned historical reads and rejects a nonexistent owner atomically', async () => {
  const a = await publish();
  const session = await createSessionService(f.db).createPublishedSession(
    f.author,
    a.pack.problemId,
  );
  const db = instrument(async (sql) => {
    if (sql.includes('FROM catalogue_releases'))
      throw Error('PRIVATE_STORAGE_CANARY');
  });
  await expect(
    createSessionService(db).readPinnedCandidateOwned(
      f.author,
      session.sessionId,
    ),
  ).rejects.toThrow('pinned_content_unavailable');
  await expect(
    createSessionService(f.db).createPublishedSession(
      { userId: randomUUID() },
      a.pack.problemId,
    ),
  ).rejects.toThrow('session_unavailable');
  expect(await persisted(a.pack.problemId)).toEqual({ sessions: 1, events: 1 });
});
