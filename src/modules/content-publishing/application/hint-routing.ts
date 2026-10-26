import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  createAssessmentContextReader,
  createHintRoutingInstaller,
} from '../../problem-catalogue/public';
import {
  createActiveUserLookup,
  type AuthenticationInput,
} from '../../identity-profile/public';
import {
  abortTransaction,
  createTransactionRunner,
  repositoryClient,
  TransactionDomainFailure,
  type TransactionDatabase,
} from '../../../server/transaction';
import type { ContentStaffConfiguration } from '../../../server/content-staff';
import {
  createOperatorVerifier,
  fail,
  permits,
  PublishingFailure,
  type PublishingIdentity,
} from './operators';
import {
  parseHintRouting,
  validateHintRouting,
  hintRoutingHash,
} from '../domain/hint-routing';

export function createHintRoutingService(
  db: TransactionDatabase,
  dependencies: Readonly<{
    identity: PublishingIdentity;
    staff: ContentStaffConfiguration;
  }>,
) {
  const verify = createOperatorVerifier(
    dependencies.identity,
    dependencies.staff,
  );
  const tx = createTransactionRunner(db);
  const activeUser = createActiveUserLookup(db);
  const catalogue = createAssessmentContextReader(db);
  const installer = createHintRoutingInstaller(db);
  const safe = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof PublishingFailure ||
        error instanceof TransactionDomainFailure
      )
        throw error;
      throw new PublishingFailure('hint_routing_unavailable');
    }
  };
  return Object.freeze({
    async review(
      auth: AuthenticationInput,
      input: unknown,
      evidenceRef: string,
    ) {
      const actor = await verify(auth, 'review_content');
      const route = parseHintRouting(input);
      if (
        typeof evidenceRef !== 'string' ||
        !evidenceRef.trim() ||
        Buffer.byteLength(evidenceRef) > 32768
      )
        fail('invalid_review_evidence');
      if (route.authorId.toLowerCase() === actor.userId.toLowerCase())
        fail('self_review_forbidden');
      return safe(() =>
        tx.run(async (scope) => {
          if (!(await activeUser(actor.userId, scope, auth.signal)))
            abortTransaction('content_forbidden');
          const author = await activeUser(route.authorId, scope, auth.signal);
          if (!author) abortTransaction('author_not_active');
          const content = await catalogue.readRoutingCatalogue(
            {
              problemId: route.problemId,
              packVersion: route.packVersion,
              packChecksum: route.packChecksum,
            },
            scope,
          );
          validateHintRouting(route, content);
          const hash = hintRoutingHash(route);
          const reviewId = randomUUID();
          await repositoryClient(scope, db).query(
            'INSERT INTO content_hint_routing_reviews(id,release_id,routing_hash,manifest,author_id,reviewer_id,evidence_ref,permission_revision,permission_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [
              reviewId,
              content.releaseId,
              hash,
              route,
              author!.userId,
              actor.userId,
              evidenceRef,
              actor.snapshot.revision,
              actor.snapshot.digest,
            ],
          );
          return Object.freeze({ reviewId, hash });
        }, auth.signal),
      );
    },
    async install(auth: AuthenticationInput, input: unknown, reviewId: string) {
      const actor = await verify(auth, 'publish_content');
      const route = parseHintRouting(input);
      if (!z.uuid().safeParse(reviewId).success)
        fail('routing_review_mismatch');
      return safe(() =>
        tx.run(async (scope) => {
          if (!(await activeUser(actor.userId, scope, auth.signal)))
            abortTransaction('content_forbidden');
          const content = await catalogue.readRoutingCatalogue(
            {
              problemId: route.problemId,
              packVersion: route.packVersion,
              packChecksum: route.packChecksum,
            },
            scope,
          );
          validateHintRouting(route, content);
          const hash = hintRoutingHash(route);
          const review = (
            await repositoryClient(scope, db).query<{
              release_id: string;
              routing_hash: string;
              author_id: string;
              reviewer_id: string;
            }>(
              'SELECT release_id,routing_hash,author_id,reviewer_id FROM content_hint_routing_reviews WHERE id=$1',
              [reviewId.toLowerCase()],
            )
          ).rows[0];
          if (
            !review ||
            review.release_id !== content.releaseId ||
            review.routing_hash !== hash ||
            review.author_id !== route.authorId.toLowerCase() ||
            review.author_id === review.reviewer_id
          )
            abortTransaction('routing_review_mismatch');
          if (!(await activeUser(review!.author_id, scope, auth.signal)))
            abortTransaction('author_not_active');
          if (
            !permits(actor.snapshot, review!.reviewer_id, 'review_content') ||
            !(await activeUser(review!.reviewer_id, scope, auth.signal))
          )
            abortTransaction('reviewer_not_authorized');
          await installer.install(scope, {
            releaseId: content.releaseId,
            hash,
            manifest: route,
            reviewId: reviewId.toLowerCase(),
            publisherId: actor.userId,
            permissionRevision: actor.snapshot.revision,
            permissionDigest: actor.snapshot.digest,
          });
          return Object.freeze({
            hash,
            revision: route.revision,
            problemId: route.problemId,
            packVersion: route.packVersion,
            packChecksum: route.packChecksum,
          });
        }, auth.signal),
      );
    },
  });
}
