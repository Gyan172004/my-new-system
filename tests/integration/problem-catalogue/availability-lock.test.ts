import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { allocateTestDatabase } from '../../helpers/test-database';
import { runMigrations } from '../../../scripts/migrate';
import { createDatabase } from '../../../src/server/database';
import { parseRuntimeConfig } from '../../../src/server/config';
import { createTransactionRunner } from '../../../src/server/transaction';
import { createCatalogueInstaller } from '../../../src/modules/problem-catalogue/application/installer';
import { createApprovedPack } from '../../fixtures/problem-catalogue';
import { validatePack } from '../../../src/modules/content-publishing/public';
let lease: Awaited<ReturnType<typeof allocateTestDatabase>>;
let db: ReturnType<typeof createDatabase>;
let releaseId: string;
let problemId: string;
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
  const pack = createApprovedPack();
  pack.problemId = randomUUID();
  pack.slug = 'availability-' + randomUUID();
  pack.authorId = randomUUID();
  problemId = pack.problemId;
  await db.withClient((c) =>
    c.query(
      "INSERT INTO users(id,identity_provider,identity_issuer,identity_subject) VALUES($1,'test','test://availability',$2)",
      [pack.authorId, pack.authorId],
    ),
  );
  const validated = validatePack(JSON.stringify(pack), 'publication');
  if (!validated.ok) throw Error('fixture_invalid');
  releaseId = (
    await createTransactionRunner(db).run((s) =>
      createCatalogueInstaller(db).install(s, validated.pack, new Date()),
    )
  ).releaseId;
}, 30000);
afterAll(async () => {
  await db?.close();
  await lease?.dispose();
}, 30000);
it('returns immutable availability status or null for an absent release', async () => {
  const i = createCatalogueInstaller(db);
  const r = createTransactionRunner(db);
  await r.run(async (scope) => {
    await i.lockProblem(scope, problemId);
    const eligible = await i.lockAvailability(scope, releaseId);
    expect(eligible).toEqual({ status: 'eligible' });
    expect(Object.isFrozen(eligible)).toBe(true);
    await i.setAvailability(
      scope,
      releaseId,
      'withdrawn',
      'content_quality',
      new Date(),
    );
    expect(await i.lockAvailability(scope, releaseId)).toEqual({
      status: 'withdrawn',
    });
    expect(await i.lockAvailability(scope, randomUUID())).toBeNull();
  });
});
it('holds the availability row lock until its transaction ends', async () => {
  const i = createCatalogueInstaller(db);
  await createTransactionRunner(db).run(async (scope) => {
    await i.lockProblem(scope, problemId);
    await i.lockAvailability(scope, releaseId);
    const code = await db.withClient(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(
          'SELECT status FROM catalogue_release_availability WHERE release_id=$1 FOR UPDATE NOWAIT',
          [releaseId],
        );
        return null;
      } catch (error) {
        return (error as { code: string }).code;
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(code).toBe('55P03');
  });
  // Once the owner commits, the other connection can acquire the same lock.
  expect(
    (
      await db.withClient((c) =>
        c.query(
          'SELECT status FROM catalogue_release_availability WHERE release_id=$1 FOR UPDATE NOWAIT',
          [releaseId],
        ),
      )
    ).rowCount,
  ).toBe(1);
});
