import {
  repositoryClient,
  type TransactionDatabase,
  type TransactionScope,
} from '../../../server/transaction';
import type { HintRouting } from '../../content-publishing/public';
export function createHintRoutingRepository(db: TransactionDatabase) {
  return Object.freeze({
    async install(
      scope: TransactionScope,
      input: Readonly<{
        releaseId: string;
        hash: string;
        manifest: HintRouting;
        reviewId: string;
        publisherId: string;
        permissionRevision: string;
        permissionDigest: string;
      }>,
    ) {
      const c = repositoryClient(scope, db);
      await c.query(
        'SELECT id FROM catalogue_releases WHERE id=$1 FOR UPDATE',
        [input.releaseId],
      );
      const existing = (
        await c.query(
          'SELECT hash FROM catalogue_hint_routing_revisions WHERE hash=$1',
          [input.hash],
        )
      ).rows[0];
      if (existing) return; // exact retry never rewinds the current revision
      await c.query(
        'INSERT INTO catalogue_hint_routing_revisions(hash,release_id,revision,manifest,review_id,publisher_id,permission_revision,permission_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(hash) DO NOTHING',
        [
          input.hash,
          input.releaseId,
          input.manifest.revision,
          input.manifest,
          input.reviewId,
          input.publisherId,
          input.permissionRevision,
          input.permissionDigest,
        ],
      );
      await c.query(
        'INSERT INTO catalogue_hint_routing_current(release_id,hash) VALUES($1,$2) ON CONFLICT(release_id) DO UPDATE SET hash=EXCLUDED.hash',
        [input.releaseId, input.hash],
      );
    },
  });
}
