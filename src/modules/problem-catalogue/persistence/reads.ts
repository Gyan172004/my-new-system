import {
  repositoryClient,
  abortTransaction,
  type TransactionDatabase,
  type TransactionScope,
} from '../../../server/transaction';
import type { CandidateRow, SummaryRow } from '../application/projections';
export const ELIGIBLE_SUMMARY_QUERY = `SELECT p.id AS "problemId",r.version,r.candidate->'title' AS title,r.candidate->'difficulty' AS difficulty,r.candidate->'topicTags' AS "topicTags" FROM catalogue_problems p JOIN catalogue_releases r ON r.id=p.current_release_id AND r.sealed JOIN catalogue_release_availability a ON a.release_id=r.id AND a.status='eligible' WHERE p.id>$1 ORDER BY p.id LIMIT $2`;
export function createCatalogueReadRepository(db: TransactionDatabase) {
  return Object.freeze({
    async list(after: string | null, limit: number, signal?: AbortSignal) {
      return db.withClient(
        async (c) =>
          (
            await c.query<SummaryRow>(ELIGIBLE_SUMMARY_QUERY, [
              after ?? '',
              limit,
            ])
          ).rows,
        signal,
      );
    },
    async current(problemId: string, signal?: AbortSignal) {
      return db.withClient(
        async (c) =>
          (
            await c.query<CandidateRow>(
              `SELECT p.id AS "problemId",r.version,r.candidate FROM catalogue_problems p JOIN catalogue_releases r ON r.id=p.current_release_id AND r.sealed JOIN catalogue_release_availability a ON a.release_id=r.id AND a.status='eligible' WHERE p.id=$1`,
              [problemId],
            )
          ).rows[0] ?? null,
        signal,
      );
    },
    async exact(problemId: string, version: string, signal?: AbortSignal) {
      return db.withClient(
        async (c) =>
          (
            await c.query<CandidateRow>(
              'SELECT problem_id AS "problemId",version,candidate FROM catalogue_releases WHERE problem_id=$1 AND version=$2 AND sealed',
              [problemId, version],
            )
          ).rows[0] ?? null,
        signal,
      );
    },
    async resolve(problemId: string, scope: TransactionScope) {
      const c = repositoryClient(scope, db);
      const problem = (
        await c.query<{ current_release_id: string | null }>(
          'SELECT current_release_id FROM catalogue_problems WHERE id=$1 FOR SHARE',
          [problemId],
        )
      ).rows[0];
      if (!problem?.current_release_id)
        abortTransaction('problem_unavailable', 'problemId');
      const availability = (
        await c.query<{ status: string }>(
          'SELECT status FROM catalogue_release_availability WHERE release_id=$1 FOR SHARE',
          [problem.current_release_id],
        )
      ).rows[0];
      if (availability?.status !== 'eligible')
        abortTransaction('problem_unavailable', 'problemId');
      const row = (
        await c.query<{
          releaseId: string;
          problemId: string;
          version: string;
          checksum: string;
          suiteVersion: string;
        }>(
          `SELECT id AS "releaseId",problem_id AS "problemId",version,content_checksum AS checksum,suite_manifest->>'version' AS "suiteVersion" FROM catalogue_releases WHERE id=$1 AND problem_id=$2 AND sealed`,
          [problem.current_release_id, problemId],
        )
      ).rows[0];
      if (!row) abortTransaction('problem_unavailable', 'problemId');
      return Object.freeze({ ...row });
    },
  });
}
