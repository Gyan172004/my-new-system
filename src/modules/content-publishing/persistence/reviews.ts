import { randomUUID } from 'node:crypto';
import {
  repositoryClient,
  type TransactionDatabase,
  type TransactionScope,
} from '../../../server/transaction';
export interface ReviewRecord {
  readonly reviewId: string;
  readonly problemId: string;
  readonly version: string;
  readonly checksum: string;
  readonly authorId: string;
  readonly reviewerId: string;
  readonly decision: 'approved' | 'rejected';
  readonly checklist: Readonly<Record<string, boolean | string>>;
  readonly recordedAt: string;
  readonly permissionRevision: string;
  readonly permissionDigest: string;
}
export function createReviewRepository(db: TransactionDatabase) {
  return Object.freeze({
    async insert(
      scope: TransactionScope,
      r: Omit<ReviewRecord, 'reviewId' | 'recordedAt'>,
    ) {
      const record = Object.freeze({
        ...r,
        reviewId: randomUUID(),
        recordedAt: new Date().toISOString(),
      });
      await repositoryClient(scope, db).query(
        'INSERT INTO content_reviews(id,problem_id,version,content_checksum,author_id,reviewer_id,decision,checklist,recorded_at,permission_revision,permission_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          record.reviewId,
          r.problemId,
          r.version,
          r.checksum,
          r.authorId,
          r.reviewerId,
          r.decision,
          r.checklist,
          record.recordedAt,
          r.permissionRevision,
          r.permissionDigest,
        ],
      );
      return record;
    },
    async read(
      scope: TransactionScope,
      id: string,
    ): Promise<ReviewRecord | null> {
      const row = (
        await repositoryClient(scope, db).query(
          'SELECT * FROM content_reviews WHERE id=$1',
          [id],
        )
      ).rows[0];
      return row
        ? Object.freeze({
            reviewId: row.id,
            problemId: row.problem_id,
            version: row.version,
            checksum: row.content_checksum,
            authorId: row.author_id,
            reviewerId: row.reviewer_id,
            decision: row.decision,
            checklist: Object.freeze(row.checklist),
            recordedAt: row.recorded_at.toISOString(),
            permissionRevision: row.permission_revision,
            permissionDigest: row.permission_digest,
          })
        : null;
    },
  });
}
