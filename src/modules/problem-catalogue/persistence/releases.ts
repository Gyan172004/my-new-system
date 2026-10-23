import { randomUUID } from 'node:crypto';
import {
  checksumPack,
  type ProblemPack,
} from '../../content-publishing/public';
import {
  abortTransaction,
  repositoryClient,
  type TransactionDatabase,
  type TransactionScope,
} from '../../../server/transaction';
import { createTestSuiteRepository } from './test-suites';
export interface ReleaseIdentity {
  readonly releaseId: string;
  readonly problemId: string;
  readonly version: string;
  readonly checksum: string;
  readonly publishedAt: string;
}
const identity = (r: {
  id: string;
  problem_id: string;
  version: string;
  content_checksum: string;
  published_at: Date;
}): ReleaseIdentity =>
  Object.freeze({
    releaseId: r.id,
    problemId: r.problem_id,
    version: r.version,
    checksum: r.content_checksum,
    publishedAt: r.published_at.toISOString(),
  });
export function createReleaseRepository(db: TransactionDatabase) {
  const suites = createTestSuiteRepository(db);
  const lockProblem = async (
    scope: TransactionScope,
    problemId: string,
    slug?: string,
  ) => {
    const c = repositoryClient(scope, db);
    if (slug !== undefined)
      await c.query(
        'INSERT INTO catalogue_problems(id,slug) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [problemId, slug],
      );
    const result = await c.query<{
      id: string;
      slug: string;
      current_release_id: string | null;
    }>(
      'SELECT id,slug,current_release_id FROM catalogue_problems WHERE id=$1 FOR UPDATE',
      [problemId],
    );
    const row = result.rows[0];
    if (slug !== undefined && (!row || row.slug !== slug))
      abortTransaction('slug_conflict', 'slug');
    return row ? Object.freeze({ ...row }) : null;
  };
  return Object.freeze({
    async install(
      scope: TransactionScope,
      pack: ProblemPack,
      publishedAt: Date,
    ) {
      const c = repositoryClient(scope, db);
      const releaseId = randomUUID();
      await lockProblem(scope, pack.problemId, pack.slug);
      await c.query(
        `INSERT INTO catalogue_releases(id,problem_id,version,schema_version,author_id,authored_author_id,candidate,interview,provenance,suite_manifest,content_checksum,published_at)
    VALUES($1,$2,$3,$4,$5,$12,$6,$7,$8,$9,$10,$11)`,
        [
          releaseId,
          pack.problemId,
          pack.version,
          pack.schemaVersion,
          pack.authorId,
          pack.candidate,
          pack.interview,
          pack.provenance,
          pack.evaluation.manifest,
          checksumPack(pack),
          publishedAt,
          pack.authorId,
        ],
      );
      await suites.install(scope, releaseId, pack.evaluation.cases);
      await c.query('UPDATE catalogue_releases SET sealed=true WHERE id=$1', [
        releaseId,
      ]);
      await c.query(
        "INSERT INTO catalogue_release_availability(release_id,status,changed_at) VALUES($1,'eligible',$2)",
        [releaseId, publishedAt],
      );
      return Object.freeze({
        releaseId,
        problemId: pack.problemId,
        version: pack.version,
        checksum: checksumPack(pack),
        publishedAt: publishedAt.toISOString(),
      });
    },
    lockProblem,
    async findRelease(
      scope: TransactionScope,
      problemId: string,
      version: string,
    ) {
      const result = await repositoryClient(scope, db).query(
        'SELECT id,problem_id,version,content_checksum,published_at FROM catalogue_releases WHERE problem_id=$1 AND version=$2 AND sealed',
        [problemId, version],
      );
      return result.rows[0] ? identity(result.rows[0]) : null;
    },
    async selectCurrent(
      scope: TransactionScope,
      problemId: string,
      releaseId: string | null,
    ) {
      await repositoryClient(scope, db).query(
        'UPDATE catalogue_problems SET current_release_id=$2 WHERE id=$1',
        [problemId, releaseId],
      );
    },
    // Callers acquire the owning problem lock before this availability lock.
    async lockAvailability(scope: TransactionScope, releaseId: string) {
      const result = await repositoryClient(scope, db).query<{
        status: 'eligible' | 'withdrawn';
      }>(
        'SELECT status FROM catalogue_release_availability WHERE release_id=$1 FOR UPDATE',
        [releaseId],
      );
      const row = result.rows[0];
      return row ? Object.freeze({ status: row.status }) : null;
    },
    async setAvailability(
      scope: TransactionScope,
      releaseId: string,
      status: 'eligible' | 'withdrawn',
      reasonCode: string | null,
      changedAt: Date,
    ) {
      await repositoryClient(scope, db).query(
        'UPDATE catalogue_release_availability SET status=$2,reason_code=$3,changed_at=$4 WHERE release_id=$1',
        [releaseId, status, reasonCode, changedAt],
      );
    },
    async readPack(
      scope: TransactionScope,
      releaseId: string,
    ): Promise<ProblemPack | null> {
      const result = await repositoryClient(scope, db).query(
        'SELECT r.*,p.slug FROM catalogue_releases r JOIN catalogue_problems p ON p.id=r.problem_id WHERE r.id=$1 AND r.sealed',
        [releaseId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        problemId: row.problem_id,
        slug: row.slug,
        version: row.version,
        schemaVersion: row.schema_version,
        authorId: row.authored_author_id,
        candidate: row.candidate,
        interview: row.interview,
        provenance: row.provenance,
        evaluation: {
          manifest: row.suite_manifest,
          cases: await suites.read(scope, releaseId),
        },
      };
    },
  });
}
