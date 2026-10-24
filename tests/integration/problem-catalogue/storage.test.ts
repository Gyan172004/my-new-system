import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { allocateTestDatabase } from '../../helpers/test-database';
import { runMigrations } from '../../../scripts/migrate';
import { createDatabase } from '../../../src/server/database';
import { parseRuntimeConfig } from '../../../src/server/config';
import {
  createTransactionRunner,
  repositoryClient,
  abortTransaction,
} from '../../../src/server/transaction';
import { createApprovedPack } from '../../fixtures/problem-catalogue';
import {
  validatePack,
  checksumPack,
} from '../../../src/modules/content-publishing/public';
import { createCatalogueInstaller } from '../../../src/modules/problem-catalogue/public';
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
      DB_STATEMENT_TIMEOUT_MS: '2000',
      READINESS_TIMEOUT_MS: '5000',
    }),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
  await lease?.dispose();
}, 30000);
async function pack() {
  const raw = createApprovedPack();
  raw.problemId = randomUUID();
  raw.slug = 'synthetic-' + randomUUID();
  raw.authorId = randomUUID().toUpperCase();
  await db.withClient((c) =>
    c.query(
      "INSERT INTO users(id,identity_provider,identity_issuer,identity_subject) VALUES($1,'test','test://storage',$2)",
      [raw.authorId, raw.authorId],
    ),
  );
  const result = validatePack(JSON.stringify(raw), 'publication');
  if (!result.ok) throw Error(JSON.stringify(result.errors));
  return result.pack;
}
it('retains every checksum input and ordered cases through JSONB including uppercase authored UUID', async () => {
  const p = await pack();
  const runner = createTransactionRunner(db);
  const installer = createCatalogueInstaller(db);
  const release = await runner.run((scope) =>
    installer.install(scope, p, new Date()),
  );
  const { createReleaseRepository } =
    await import('../../../src/modules/problem-catalogue/persistence/releases');
  const restored = await runner.run((scope) =>
    createReleaseRepository(db).readPack(scope, release.releaseId),
  );
  expect(restored).toEqual(p);
  expect(checksumPack(restored!)).toBe(checksumPack(p));
  expect(Object.isFrozen(release)).toBe(true);
});
it('rolls back writes on known failure and cancellation and invalidates scopes', async () => {
  const id = randomUUID();
  let saved: unknown;
  await expect(
    createTransactionRunner(db).run(async (scope) => {
      saved = scope;
      await repositoryClient(scope, db).query(
        'INSERT INTO catalogue_problems(id,slug) VALUES($1,$1)',
        [id],
      );
      abortTransaction('version_conflict');
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  expect(
    (
      await db.withClient((c) =>
        c.query('SELECT id FROM catalogue_problems WHERE id=$1', [id]),
      )
    ).rowCount,
  ).toBe(0);
  expect(() => repositoryClient(saved as never, db)).toThrow(
    'invalid_transaction_scope',
  );
  const controller = new AbortController();
  await expect(
    createTransactionRunner(db).run(async (scope) => {
      saved = scope;
      controller.abort();
      await repositoryClient(scope, db).query('SELECT pg_sleep(1)');
    }, controller.signal),
  ).rejects.toThrow('database_unavailable');
  expect(() => repositoryClient(saved as never, db)).toThrow(
    'invalid_transaction_scope',
  );
});
it('rejects mutation, late cases, duplicate versions, deletion and wrong-problem current selection', async () => {
  const p = await pack();
  const i = createCatalogueInstaller(db);
  const r = createTransactionRunner(db);
  const release = await r.run((s) => i.install(s, p, new Date()));
  for (const sql of [
    "UPDATE catalogue_releases SET version='tampered' WHERE id=$1",
    'DELETE FROM catalogue_releases WHERE id=$1',
    "UPDATE catalogue_test_cases SET visibility='public' WHERE release_id=$1",
    'DELETE FROM catalogue_test_cases WHERE release_id=$1',
    "INSERT INTO catalogue_test_cases SELECT release_id,'late',ordinal+1000,category,visibility,definition FROM catalogue_test_cases WHERE release_id=$1 LIMIT 1",
  ]) {
    await expect(
      db.withClient((c) => c.query(sql, [release.releaseId])),
    ).rejects.toThrow('database_unavailable');
  }
  await expect(r.run((s) => i.install(s, p, new Date()))).rejects.toThrow(
    'database_unavailable',
  );
  const other = randomUUID();
  await db.withClient((c) =>
    c.query('INSERT INTO catalogue_problems(id,slug) VALUES($1,$1)', [other]),
  );
  await expect(
    r.run((s) => i.selectCurrent(s, other, release.releaseId)),
  ).rejects.toThrow('database_unavailable');
});
it('rejects unsealed commits, initially sealed inserts, incomplete sealing and mutable evidence', async () => {
  const p = await pack();
  const r = createTransactionRunner(db);
  const id = randomUUID();
  await db.withClient((c) =>
    c.query('INSERT INTO catalogue_problems(id,slug) VALUES($1,$2)', [
      p.problemId,
      p.slug,
    ]),
  );
  const insert =
    'INSERT INTO catalogue_releases(id,problem_id,version,schema_version,author_id,authored_author_id,candidate,interview,provenance,suite_manifest,content_checksum,published_at,sealed) VALUES($1,$2,$3,1,$4,$11,$5,$6,$7,$8,$9,now(),$10)';
  const values = [
    id,
    p.problemId,
    p.version,
    p.authorId,
    p.candidate,
    p.interview,
    p.provenance,
    p.evaluation.manifest,
    checksumPack(p),
  ];
  await expect(
    db.withClient((c) => c.query(insert, [...values, true, p.authorId])),
  ).rejects.toThrow('database_unavailable');
  await expect(
    r.run(async (s) => {
      await repositoryClient(s, db).query(insert, [
        ...values,
        false,
        p.authorId,
      ]);
    }),
  ).rejects.toThrow('database_unavailable');
  await expect(
    r.run(async (s) => {
      const c = repositoryClient(s, db);
      await c.query(insert, [...values, false, p.authorId]);
      await c.query('UPDATE catalogue_releases SET sealed=true WHERE id=$1', [
        id,
      ]);
    }),
  ).rejects.toThrow('database_unavailable');
});
it('preserves stable authored slug while allowing the current pointer to change', async () => {
  const p = await pack();
  const runner = createTransactionRunner(db);
  const i = createCatalogueInstaller(db);
  const release = await runner.run((s) => i.install(s, p, new Date()));
  await runner.run((s) => i.selectCurrent(s, p.problemId, release.releaseId));
  await expect(
    db.withClient((c) =>
      c.query("UPDATE catalogue_problems SET slug='tampered' WHERE id=$1", [
        p.problemId,
      ]),
    ),
  ).rejects.toThrow('database_unavailable');
});
it('reports slug conflicts as known failures and serializes first-publication locks', async () => {
  const runner = createTransactionRunner(db);
  const i = createCatalogueInstaller(db);
  const id = randomUUID();
  const slug = 'race-' + randomUUID();
  const results = await Promise.all([
    runner.run((s) => i.lockProblem(s, id, slug)),
    runner.run((s) => i.lockProblem(s, id, slug)),
  ]);
  expect(results.map((r) => r?.id)).toEqual([id, id]);
  await expect(
    runner.run((s) => i.lockProblem(s, randomUUID(), slug)),
  ).rejects.toMatchObject({ code: 'slug_conflict', path: 'slug' });
  await expect(
    runner.run((s) => i.lockProblem(s, id, 'another-' + randomUUID())),
  ).rejects.toMatchObject({ code: 'slug_conflict' });
});
it('enforces complete case identity, ordering, sealing-only changes and append-only evidence at SQL boundary', async () => {
  const p = await pack();
  const r = createTransactionRunner(db);
  const i = createCatalogueInstaller(db);
  const release = await r.run((s) => i.install(s, p, new Date()));
  const review = randomUUID();
  const actor = randomUUID();
  await db.withClient((c) =>
    c.query(
      "INSERT INTO users(id,identity_provider,identity_issuer,identity_subject) VALUES($1,'test','test://review',$2)",
      [actor, actor],
    ),
  );
  await db.withClient((c) =>
    c.query(
      "INSERT INTO content_reviews(id,problem_id,version,content_checksum,author_id,reviewer_id,decision,checklist,recorded_at,permission_revision,permission_digest) VALUES($1,$2,$3,$4,$5,$6,'approved','{}',now(),'test-v1',$4)",
      [review, p.problemId, p.version, checksumPack(p), p.authorId, actor],
    ),
  );
  await db.withClient((c) =>
    c.query(
      "INSERT INTO content_publications(release_id,review_id,publisher_id,published_at,permission_revision,permission_digest,event) VALUES($1,$2,$3,now(),'test-v1',$4,'{}')",
      [release.releaseId, review, actor, checksumPack(p)],
    ),
  );
  const audit = randomUUID();
  await db.withClient((c) =>
    c.query(
      "INSERT INTO content_publication_audit(id,action,actor_id,release_id,permission_revision,permission_digest,recorded_at) VALUES($1,'published',$2,$3,'test-v1',$4,now())",
      [audit, actor, release.releaseId, checksumPack(p)],
    ),
  );
  for (const [table, key, value] of [
    ['content_reviews', 'id', review],
    ['content_publications', 'release_id', release.releaseId],
    ['content_publication_audit', 'id', audit],
  ]) {
    for (const operation of [
      `UPDATE ${table} SET permission_revision='tampered' WHERE ${key}=$1`,
      `DELETE FROM ${table} WHERE ${key}=$1`,
    ]) {
      const code = await db.withClient(async (c) => {
        try {
          await c.query(operation, [value]);
          return null;
        } catch (error) {
          return (error as { code: string }).code;
        }
      });
      expect(code).toBe('P0001');
    }
  }
  // Check that FK enforcement, rather than a malformed SQL query, denies cross-problem selection.
  const other = randomUUID();
  await r.run((s) => i.lockProblem(s, other, 'other-' + other));
  const code = await db.withClient(async (c) => {
    try {
      await c.query(
        'UPDATE catalogue_problems SET current_release_id=$1 WHERE id=$2',
        [release.releaseId, other],
      );
      return null;
    } catch (error) {
      return (error as { code: string }).code;
    }
  });
  expect(code).toBe('23503');
});
it('applies after identity data already exists and retains arbitrary fixture session pins', async () => {
  const { mkdtemp, copyFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'catalogue-migrations-'));
  const oldLease = await allocateTestDatabase({
    purpose: 'migration-under-test',
  });
  const { Client } = await import('pg');
  const c = new Client({ connectionString: oldLease.connectionString });
  try {
    for (const name of [
      '1781654400000_foundation.sql',
      '1792454400000_identity_users.sql',
      '1792454400001_owned_session_storage.sql',
    ])
      await copyFile('migrations/' + name, join(dir, name));
    await runMigrations({
      environment: 'test',
      migrationDatabaseUrl: oldLease.connectionString,
      directory: dir,
    });
    await c.connect();
    const owner = randomUUID();
    await c.query(
      "INSERT INTO users(id,identity_provider,identity_issuer,identity_subject) VALUES($1,'test','test://prior',$2)",
      [owner, owner],
    );
    await c.query(
      "INSERT INTO interview_sessions(id,owner_id,problem_id,problem_pack_version,current_stage,status,version) VALUES($1,$2,'legacy-fixture','unregistered-version','created','created',0)",
      [randomUUID(), owner],
    );
    expect(
      await runMigrations({
        environment: 'test',
        migrationDatabaseUrl: oldLease.connectionString,
      }),
    ).toEqual({ applied: 1 });
    expect(
      (
        await c.query(
          'SELECT problem_id,problem_pack_version FROM interview_sessions',
        )
      ).rows,
    ).toEqual([
      {
        problem_id: 'legacy-fixture',
        problem_pack_version: 'unregistered-version',
      },
    ]);
  } finally {
    await c.end();
    await oldLease.dispose();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
it('rejects a suite whose durable order differs from its ordered manifest', async () => {
  const p = await pack();
  const bad = {
    ...p,
    evaluation: {
      ...p.evaluation,
      manifest: {
        ...p.evaluation.manifest,
        caseIds: [...p.evaluation.manifest.caseIds].reverse(),
      },
    },
  };
  expect(p.evaluation.manifest.caseIds.length).toBeGreaterThan(1);
  await expect(
    createTransactionRunner(db).run((s) =>
      createCatalogueInstaller(db).install(s, bad, new Date()),
    ),
  ).rejects.toThrow('database_unavailable');
  expect(
    (
      await db.withClient((c) =>
        c.query('SELECT id FROM catalogue_releases WHERE problem_id=$1', [
          p.problemId,
        ]),
      )
    ).rowCount,
  ).toBe(0);
});
it('does not confuse equal-version content across different problems', async () => {
  const first = await pack();
  const second = await pack();
  const i = createCatalogueInstaller(db);
  const r = createTransactionRunner(db);
  const a = await r.run((s) => i.install(s, first, new Date()));
  const b = await r.run((s) => i.install(s, second, new Date()));
  expect(
    (await r.run((s) => i.findRelease(s, first.problemId, first.version)))
      ?.releaseId,
  ).toBe(a.releaseId);
  expect(
    (await r.run((s) => i.findRelease(s, second.problemId, second.version)))
      ?.releaseId,
  ).toBe(b.releaseId);
  expect(
    await r.run((s) => i.findRelease(s, first.problemId, 'absent')),
  ).toBeNull();
  await r.run((s) =>
    i.setAvailability(
      s,
      a.releaseId,
      'withdrawn',
      'content_quality',
      new Date(),
    ),
  );
  expect(
    (
      await db.withClient((c) =>
        c.query(
          'SELECT status FROM catalogue_release_availability WHERE release_id=$1',
          [a.releaseId],
        ),
      )
    ).rows[0]?.status,
  ).toBe('withdrawn');
});
it('stores a valid large escaped case without imposing a smaller database content limit', async () => {
  const p = await pack();
  const mutable = structuredClone(p) as ReturnType<typeof createApprovedPack>;
  const entry = mutable.evaluation.cases.find(
    (c) => c.visibility === 'hidden',
  )!;
  // 10,000 elements, exactly the [0,1] solution; prose remains below the 32 KiB authored limit.
  entry.input.nums = [
    1,
    2,
    ...Array.from({ length: 9998 }, (_, n) => 100000 + n),
  ];
  entry.input.target = 3;
  entry.expectedOutput = [0, 1];
  entry.rationale = '\\'.repeat(32768);
  entry.validationEvidence.dataCheck = '\\'.repeat(32768);
  entry.validationEvidence.checkedOn = '\\'.repeat(32768);
  const validation = validatePack(JSON.stringify(mutable), 'publication');
  expect(validation.ok).toBe(true);
  if (!validation.ok) throw Error('fixture_invalid');
  expect(Buffer.byteLength(JSON.stringify(entry))).toBeGreaterThan(262144);
  const r = createTransactionRunner(db);
  const installed = await r.run((s) =>
    createCatalogueInstaller(db).install(s, validation.pack, new Date()),
  );
  const { createReleaseRepository } =
    await import('../../../src/modules/problem-catalogue/persistence/releases');
  expect(
    checksumPack(
      (await r.run((s) =>
        createReleaseRepository(db).readPack(s, installed.releaseId),
      ))!,
    ),
  ).toBe(validation.checksum);
});
it('rejects an otherwise-valid late case solely because the parent is sealed', async () => {
  const p = await pack();
  const i = createCatalogueInstaller(db);
  const release = await createTransactionRunner(db).run((s) =>
    i.install(s, p, new Date()),
  );
  const original = p.evaluation.cases[0]!;
  const late = { ...original, id: 'late-case' };
  const code = await db.withClient(async (c) => {
    try {
      await c.query(
        'INSERT INTO catalogue_test_cases(release_id,case_id,ordinal,category,visibility,definition) VALUES($1,$2,$3,$4,$5,$6)',
        [
          release.releaseId,
          late.id,
          p.evaluation.cases.length + 1,
          late.category,
          late.visibility,
          late,
        ],
      );
      return null;
    } catch (e) {
      return (e as { code: string }).code;
    }
  });
  expect(code).toBe('P0001');
  expect(
    (
      await db.withClient((c) =>
        c.query(
          'SELECT count(*)::int AS n FROM catalogue_test_cases WHERE release_id=$1',
          [release.releaseId],
        ),
      )
    ).rows[0]?.n,
  ).toBe(p.evaluation.cases.length);
});
it('reuses the backend after known rollback but destroys it after unknown SQL failure', async () => {
  const single = createDatabase(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: lease.connectionString,
      DB_POOL_MAX: '1',
    }),
  );
  const pid = () =>
    single.withClient(
      async (c) =>
        (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows[0]!.pid,
    );
  try {
    const before = await pid();
    await expect(
      createTransactionRunner(single).run(async () =>
        abortTransaction('version_conflict'),
      ),
    ).rejects.toMatchObject({ code: 'version_conflict' });
    expect(await pid()).toBe(before);
    await expect(
      createTransactionRunner(single).run(async (s) =>
        repositoryClient(s, single).query(
          'SELECT * FROM intentionally_absent_catalogue_relation',
        ),
      ),
    ).rejects.toThrow('database_unavailable');
    expect(await pid()).not.toBe(before);
  } finally {
    await single.close();
  }
});
it('invalidates an aborted scope while its callback remains in flight and recovers a new client', async () => {
  const single = createDatabase(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: lease.connectionString,
      DB_POOL_MAX: '1',
    }),
  );
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const callbackFinished = Promise.withResolvers<void>();
  const controller = new AbortController();
  let scope: import('../../../src/server/transaction').TransactionScope;
  let before = 0;
  let resumedScopeError: string | undefined;
  const operation = createTransactionRunner(single).run(async (s) => {
    scope = s;
    before = (
      await repositoryClient(s, single).query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      )
    ).rows[0]!.pid;
    entered.resolve();
    try {
      await resume.promise;
      try {
        repositoryClient(s, single);
      } catch (error) {
        resumedScopeError = (error as Error).message;
      }
    } finally {
      callbackFinished.resolve();
    }
  }, controller.signal);
  const rejection = expect(operation).rejects.toThrow('database_unavailable');
  try {
    await entered.promise;
    controller.abort();
    await rejection;
    expect(() => repositoryClient(scope!, single)).toThrow(
      'invalid_transaction_scope',
    );
    const after = await single.withClient(
      async (c) =>
        (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows[0]!.pid,
    );
    expect(after).not.toBe(before);
  } finally {
    resume.resolve();
    await callbackFinished.promise;
    await single.close();
  }
  expect(resumedScopeError).toBe('invalid_transaction_scope');
});
it('keeps the suite unchanged when another connection inserts while publication reaches sealing', async () => {
  const p = await pack();
  const ready = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  let releaseId = '';
  const held = {
    withClient<T>(
      work: (c: import('pg').PoolClient) => Promise<T>,
      signal?: AbortSignal,
    ) {
      return db.withClient(
        (c) =>
          work(
            new Proxy(c, {
              get(target, key, receiver) {
                if (key === 'query')
                  return async (...args: unknown[]) => {
                    const sql = args[0];
                    if (
                      typeof sql === 'string' &&
                      sql.includes('INSERT INTO catalogue_releases') &&
                      Array.isArray(args[1])
                    )
                      releaseId = args[1][0] as string;
                    if (
                      typeof sql === 'string' &&
                      sql.startsWith(
                        'UPDATE catalogue_releases SET sealed=true',
                      )
                    ) {
                      ready.resolve();
                      await resume.promise;
                    }
                    return Reflect.apply(target.query, target, args);
                  };
                return Reflect.get(target, key, receiver);
              },
            }),
          ),
        signal,
      );
    },
  };
  const publication = createTransactionRunner(held).run((s) =>
    createCatalogueInstaller(held).install(s, p, new Date()),
  );
  const sent = Promise.withResolvers<void>();
  const late = { ...p.evaluation.cases[0]!, id: 'concurrent-late' };
  let insertion: Promise<string | null> | undefined;
  try {
    await ready.promise;
    insertion = db.withClient(async (c) => {
      const query = c.query(
        'INSERT INTO catalogue_test_cases(release_id,case_id,ordinal,category,visibility,definition) VALUES($1,$2,$3,$4,$5,$6)',
        [
          releaseId,
          late.id,
          p.evaluation.cases.length + 1,
          late.category,
          late.visibility,
          late,
        ],
      );
      sent.resolve();
      try {
        await query;
        return null;
      } catch (e) {
        return (e as { code: string }).code;
      }
    });
    await sent.promise;
    resume.resolve();
    await publication;
    expect(await insertion).toBe('P0001');
    expect(
      (
        await db.withClient((c) =>
          c.query(
            'SELECT count(*)::int AS n FROM catalogue_test_cases WHERE release_id=$1',
            [releaseId],
          ),
        )
      ).rows[0]?.n,
    ).toBe(p.evaluation.cases.length);
  } finally {
    resume.resolve();
    await publication.catch(() => {});
    await insertion?.catch(() => {});
  }
});
