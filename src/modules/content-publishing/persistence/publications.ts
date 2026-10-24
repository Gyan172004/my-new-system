import { randomUUID } from 'node:crypto';
import {
  repositoryClient,
  type TransactionDatabase,
  type TransactionScope,
} from '../../../server/transaction';
import type {
  PublicationEvent,
  PublicationReceipt,
} from '../application/types';
function freezeEvent(event: PublicationEvent) {
  return Object.freeze({ ...event, payload: Object.freeze(event.payload) });
}
export function createPublicationRepository(db: TransactionDatabase) {
  return Object.freeze({
    async read(
      scope: TransactionScope,
      id: string,
    ): Promise<PublicationReceipt | null> {
      const r = (
        await repositoryClient(scope, db).query(
          'SELECT * FROM content_publications WHERE release_id=$1',
          [id],
        )
      ).rows[0];
      return r
        ? Object.freeze({
            releaseId: r.release_id,
            reviewId: r.review_id,
            publisherId: r.publisher_id,
            publishedAt: r.published_at.toISOString(),
            permissionRevision: r.permission_revision,
            permissionDigest: r.permission_digest,
            event: freezeEvent(r.event),
          })
        : null;
    },
    async insert(scope: TransactionScope, r: PublicationReceipt) {
      await repositoryClient(scope, db).query(
        'INSERT INTO content_publications(release_id,review_id,publisher_id,published_at,permission_revision,permission_digest,event) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          r.releaseId,
          r.reviewId,
          r.publisherId,
          r.publishedAt,
          r.permissionRevision,
          r.permissionDigest,
          r.event,
        ],
      );
      return Object.freeze({ ...r, event: freezeEvent(r.event) });
    },
    async audit(
      scope: TransactionScope,
      action: 'published' | 'withdrawn',
      releaseId: string,
      actorId: string,
      reason: string,
      revision: string,
      digest: string,
    ) {
      await repositoryClient(scope, db).query(
        'INSERT INTO content_publication_audit(id,action,actor_id,release_id,reason_code,permission_revision,permission_digest,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          randomUUID(),
          action,
          actorId,
          releaseId,
          reason,
          revision,
          digest,
          new Date(),
        ],
      );
    },
  });
}
