import { randomUUID } from 'node:crypto';
import { allocateTestDatabase } from './test-database';
import { runMigrations } from '../../scripts/migrate';
import { createDatabase } from '../../src/server/database';
import { parseRuntimeConfig } from '../../src/server/config';
import { createRuntime } from '../../src/server/runtime';
import { runtimeIdentity } from '../../src/modules/identity-profile/public';
import { createPublishingService } from '../../src/modules/content-publishing/application/service';
import { parseStaffConfiguration } from '../../src/server/content-staff';
import { createApprovedPack } from '../fixtures/problem-catalogue';
export const approvedChecklist = {
  statement: true,
  approaches: true,
  correctness: true,
  complexity: true,
  hints: true,
  tests: true,
  rights: true,
  followups: true,
  variants: true,
  evidenceRef: 'synthetic-test-evidence',
};
export const auth = {
  authorization: 'Bearer test_bob',
  sourceAddress: '127.0.0.1',
};
export async function publicationFixture() {
  const lease = await allocateTestDatabase({ purpose: 'migration-under-test' });
  await runMigrations({
    environment: 'test',
    migrationDatabaseUrl: lease.connectionString,
  });
  const config = parseRuntimeConfig({
    APP_ENV: 'test',
    IDENTITY_ADAPTER: 'test',
    DATABASE_URL: lease.connectionString,
    DB_STATEMENT_TIMEOUT_MS: '2000',
    READINESS_TIMEOUT_MS: '5000',
  });
  const runtime = createRuntime(config);
  const identity = runtimeIdentity(runtime);
  const author = await identity.authenticate({
    ...auth,
    authorization: 'Bearer test_alice',
  });
  const reviewer = await identity.authenticate(auth);
  const db = createDatabase(config);
  const staff = parseStaffConfiguration({
    CONTENT_STAFF_GRANTS_JSON: JSON.stringify([
      {
        userId: reviewer.userId,
        permissions: ['review_content', 'publish_content', 'withdraw_content'],
      },
    ]),
    CONTENT_STAFF_CONFIG_REVISION: 'test-v1',
  });
  const service = createPublishingService(db, { identity, staff });
  const pack = createApprovedPack();
  pack.authorId = author.userId;
  pack.problemId = 'synthetic-' + randomUUID();
  pack.slug = pack.problemId;
  return {
    config,
    db,
    identity,
    author,
    reviewer,
    staff,
    service,
    pack,
    raw: () => JSON.stringify(pack),
    async close() {
      await db.close();
      await runtime.closeResources();
      await lease.dispose();
    },
  };
}
