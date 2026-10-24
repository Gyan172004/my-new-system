import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { allocateTestDatabase } from '../../helpers/test-database';
import { runMigrations } from '../../../scripts/migrate';
import { createDatabase } from '../../../src/server/database';
import { parseRuntimeConfig } from '../../../src/server/config';
import { createActiveUserLookup } from '../../../src/modules/identity-profile/application/active-user';
import {
  createTransactionRunner,
  repositoryClient,
} from '../../../src/server/transaction';
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
it('proves only active existing mappings without creating users or returning PII', async () => {
  const id = randomUUID();
  await db.withClient((c) =>
    c.query(
      "INSERT INTO users(id,identity_provider,identity_issuer,identity_subject) VALUES($1,'test','test://author','private-provider-subject')",
      [id],
    ),
  );
  const lookup = createActiveUserLookup(db);
  const proof = await lookup(id.toUpperCase());
  expect(proof).toEqual({ userId: id });
  expect(Object.isFrozen(proof)).toBe(true);
  expect(await lookup(randomUUID())).toBeNull();
  expect(await lookup('claimed-author')).toBeNull();
  await db.withClient((c) =>
    c.query("UPDATE users SET account_status='disabled' WHERE id=$1", [id]),
  );
  expect(await lookup(id)).toBeNull();
  expect(
    (await db.withClient((c) => c.query('SELECT count(*)::int n FROM users')))
      .rows[0].n,
  ).toBe(1);
});
it('joins an owning transaction and refuses a foreign database scope', async () => {
  const id = randomUUID();
  const lookup = createActiveUserLookup(db);
  await createTransactionRunner(db).run(async (s) => {
    await repositoryClient(s, db).query(
      "INSERT INTO users(id,identity_provider,identity_issuer,identity_subject) VALUES($1::uuid,'test','test://author',$1::text)",
      [id],
    );
    expect(await lookup(id, s)).toEqual({ userId: id });
  });
  const foreign = { withClient: db.withClient };
  await expect(
    createTransactionRunner(foreign).run((s) => lookup(id, s)),
  ).rejects.toThrow('database_unavailable');
});
