import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { allocateTestDatabase } from '../../helpers/test-database';
import { runMigrations } from '../../../scripts/migrate';
import { createDatabase } from '../../../src/server/database';
import { parseRuntimeConfig } from '../../../src/server/config';
import { createTransactionRunner } from '../../../src/server/transaction';
import {
  createCatalogueInstaller,
  createCatalogueReader,
  createCatalogueResolver,
} from '../../../src/modules/problem-catalogue/public';
import { validatePack } from '../../../src/modules/content-publishing/public';
import { createApprovedPack } from '../../fixtures/problem-catalogue';
import { eventually } from '../../helpers/process';
import { ELIGIBLE_SUMMARY_QUERY } from '../../../src/modules/problem-catalogue/persistence/reads';
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
      READINESS_TIMEOUT_MS: '5000',
    }),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
  await lease?.dispose();
}, 30000);
async function install(id: string, version = 'v1', title = 'Visible title') {
  const raw = createApprovedPack();
  raw.problemId = id;
  raw.slug = 'problem-' + id;
  raw.version = version;
  raw.authorId = randomUUID();
  raw.candidate.title = title;
  raw.interview.clarifications[0]!.answer = 'CANARY_PRIVATE_INTERVIEW';
  await db.withClient((c) =>
    c.query(
      "INSERT INTO users(id,identity_provider,identity_issuer,identity_subject) VALUES($1,'test','test://reads',$2)",
      [raw.authorId, raw.authorId],
    ),
  );
  const validated = validatePack(JSON.stringify(raw), 'publication');
  if (!validated.ok) throw Error(JSON.stringify(validated.errors));
  const i = createCatalogueInstaller(db);
  return createTransactionRunner(db).run(async (s) => {
    const r = await i.install(s, validated.pack, new Date());
    await i.selectCurrent(s, id, r.releaseId);
    return r;
  });
}
it('distinguishes empty, unavailable, paginated and exact historical views with same-release metadata', async () => {
  const reader = createCatalogueReader(db);
  expect(await reader.list()).toEqual({ items: [], nextCursor: null });
  await expect(reader.detail('unknown')).rejects.toMatchObject({
    code: 'not_found',
  });
  const a = await install('a');
  await install('b');
  await install('c');
  const first = await reader.list({ limit: '2' });
  expect(first.items.map((r) => r.problemId)).toEqual(['a', 'b']);
  expect(first.nextCursor).not.toBeNull();
  expect(
    (await reader.list({ limit: '2', cursor: first.nextCursor! })).items.map(
      (r) => r.problemId,
    ),
  ).toEqual(['c']);
  await install('a', 'v2', 'New title');
  const latest = await reader.detail('a');
  expect(latest.title).toBe('New title');
  expect(latest.problemPackVersion).toBe('v2');
  expect(latest.latestPublishedVersion).toBe('v2');
  const i = createCatalogueInstaller(db);
  await createTransactionRunner(db).run((s) =>
    i.setAvailability(s, a.releaseId, 'withdrawn', 'test', new Date()),
  );
  const pinned = await reader.readPinnedCandidate('a', 'v1');
  expect(pinned.problemPackVersion).toBe('v1');
  expect(pinned).not.toHaveProperty('latestPublishedVersion');
  expect(JSON.stringify([latest, pinned, first])).not.toContain(
    'CANARY_PRIVATE',
  );
  await expect(
    reader.readPinnedCandidate('a', 'missing'),
  ).rejects.toMatchObject({ code: 'catalogue_unavailable' });
  const pin = await createTransactionRunner(db).run((s) =>
    createCatalogueResolver(db).resolveForNewSession('a', s),
  );
  expect(pin.version).toBe('v2');
  expect(Object.isFrozen(pin)).toBe(true);
  await expect(
    createTransactionRunner(db).run((s) =>
      createCatalogueResolver(db).resolveForNewSession('unknown', s),
    ),
  ).rejects.toMatchObject({ code: 'problem_unavailable' });
});
it('preserves shared eligibility locks until caller transaction ends', async () => {
  const release = await install('lock');
  const runner = createTransactionRunner(db);
  const i = createCatalogueInstaller(db);
  let acquired!: () => void;
  const held = new Promise<void>((r) => (acquired = r));
  let releaseLock!: () => void;
  const gate = new Promise<void>((r) => (releaseLock = r));
  const pin = runner.run(async (s) => {
    const result = await createCatalogueResolver(db).resolveForNewSession(
      'lock',
      s,
    );
    acquired();
    await gate;
    return result;
  });
  await held;
  let finished = false;
  const withdraw = runner
    .run(async (s) => {
      await i.lockProblem(s, 'lock');
      await i.setAvailability(
        s,
        release.releaseId,
        'withdrawn',
        'test',
        new Date(),
      );
      await i.selectCurrent(s, 'lock', null);
    })
    .then(() => {
      finished = true;
    });
  await eventually(
    () =>
      db.withClient(
        async (c) =>
          (
            await c.query(
              "SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
            )
          ).rows[0].n,
      ),
    (n) => n > 0,
    2000,
  );
  expect(finished).toBe(false);
  releaseLock();
  expect((await pin).version).toBe('v1');
  await withdraw;
  await expect(createCatalogueReader(db).detail('lock')).rejects.toMatchObject({
    code: 'not_found',
  });
  await expect(
    runner.run((s) =>
      createCatalogueResolver(db).resolveForNewSession('lock', s),
    ),
  ).rejects.toMatchObject({ code: 'problem_unavailable' });
  expect(
    (await createCatalogueReader(db).readPinnedCandidate('lock', 'v1'))
      .problemPackVersion,
  ).toBe('v1');
});
it('inspects bounded indexed pagination with many inactive problems and sparse eligibility', async () => {
  await db.withClient((c) =>
    c.query(
      "INSERT INTO catalogue_problems(id,slug) SELECT 'sparse-'||lpad(n::text,5,'0'),'problem-sparse-'||lpad(n::text,5,'0') FROM generate_series(1,1200) n",
    ),
  );
  await install('sparse-00400');
  await install('sparse-00800');
  await install('sparse-01200');
  const plan = await db.withClient(async (c) => {
    await c.query('ANALYZE catalogue_problems');
    return (
      await c.query(
        'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + ELIGIBLE_SUMMARY_QUERY,
        ['sparse-', 3],
      )
    ).rows[0]['QUERY PLAN'];
  });
  const root = plan[0].Plan;
  expect(root['Actual Rows']).toBe(3);
  expect(JSON.stringify(plan)).toMatch(/Index|Sort/);
  expect(JSON.stringify(plan)).toContain('catalogue_problems_current_idx');
  expect(
    (
      await createCatalogueReader(db).list({
        cursor: Buffer.from(
          JSON.stringify({ formatVersion: 1, lastProblemId: 'sparse-' }),
        ).toString('base64url'),
        limit: '2',
      })
    ).items.map((r) => r.problemId),
  ).toEqual(['sparse-00400', 'sparse-00800']);
});
it('never treats storage failure as an empty catalogue', async () => {
  const reader = createCatalogueReader({
    async withClient() {
      throw Error('database_unavailable');
    },
  });
  await expect(reader.list()).rejects.toThrow('database_unavailable');
});
