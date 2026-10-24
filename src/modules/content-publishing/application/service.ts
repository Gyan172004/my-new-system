import { z } from 'zod';
import type { AuthenticationInput } from '../../identity-profile/public';
import { createCatalogueInstaller } from '../../problem-catalogue/public';
import {
  abortTransaction,
  createTransactionRunner,
  type TransactionDatabase,
} from '../../../server/transaction';
import type { ContentStaffConfiguration } from '../../../server/content-staff';
import {
  createOperatorVerifier,
  fail,
  permits,
  type PublishingIdentity,
} from './operators';
import { reviewEvidence, validatedSource, checklistSchema } from './review';
import { createReviewRepository } from '../persistence/reviews';
import { createPublicationRepository } from '../persistence/publications';
import { publicationEvent } from './publish';
import { withdrawalReasonSchema } from './withdraw';
export function createPublishingService(
  db: TransactionDatabase,
  dependencies: Readonly<{
    identity: PublishingIdentity;
    staff: ContentStaffConfiguration;
  }>,
) {
  const verify = createOperatorVerifier(
      dependencies.identity,
      dependencies.staff,
    ),
    tx = createTransactionRunner(db),
    reviews = createReviewRepository(db),
    publications = createPublicationRepository(db),
    catalogue = createCatalogueInstaller(db);
  const identifier = (s: string) =>
    typeof s === 'string' &&
    s.trim() !== '' &&
    Buffer.byteLength(s) <= 256 &&
    ![...s].some((char) => char.charCodeAt(0) < 32);
  return Object.freeze({
    async review(
      auth: AuthenticationInput,
      raw: Uint8Array | string,
      input: unknown,
    ) {
      const actor = await verify(auth, 'review_content');
      const evidence = reviewEvidence(input);
      const validated = validatedSource(
        raw,
        evidence.decision === 'approved' ? 'publication' : 'draft',
      );
      const p = validated.pack;
      if (!p.authorId) fail('author_not_active');
      const author = await dependencies.identity.lookupActiveUser(
        p.authorId!,
        undefined,
        auth.signal,
      );
      if (!author) fail('author_not_active');
      if (author!.userId.toLowerCase() === actor.userId.toLowerCase())
        fail('self_review_forbidden');
      return tx.run(
        (scope) =>
          reviews.insert(scope, {
            problemId: p.problemId,
            version: p.version,
            checksum: validated.checksum,
            authorId: author!.userId,
            reviewerId: actor.userId,
            decision: evidence.decision,
            checklist: evidence.checklist,
            permissionRevision: actor.snapshot.revision,
            permissionDigest: actor.snapshot.digest,
          }),
        auth.signal,
      );
    },
    async publish(
      auth: AuthenticationInput,
      raw: Uint8Array | string,
      reviewId: string,
    ) {
      const actor = await verify(auth, 'publish_content');
      if (!z.uuid().safeParse(reviewId).success) fail('review_mismatch');
      reviewId = reviewId.toLowerCase();
      const validated = validatedSource(raw, 'publication'),
        p = validated.pack;
      return tx.run(async (scope) => {
        const review = await reviews.read(scope, reviewId);
        if (
          !review ||
          review.problemId !== p.problemId ||
          review.version !== p.version ||
          review.checksum !== validated.checksum ||
          review.authorId !== p.authorId!.toLowerCase() ||
          review.decision !== 'approved' ||
          review.authorId === review.reviewerId ||
          !checklistSchema.safeParse(review.checklist).success ||
          Object.entries(review.checklist).some(
            ([k, v]) => k !== 'evidenceRef' && v !== true,
          )
        )
          abortTransaction('review_mismatch');
        await catalogue.lockProblem(scope, p.problemId, p.slug);
        const existing = await catalogue.findRelease(
          scope,
          p.problemId,
          p.version,
        );
        if (existing) {
          if (existing.checksum !== validated.checksum)
            abortTransaction('published_version_conflict');
          const receipt = await publications.read(scope, existing.releaseId);
          if (!receipt || receipt.reviewId !== reviewId)
            abortTransaction('review_mismatch');
          return receipt;
        }
        if (!permits(actor.snapshot, review.reviewerId, 'review_content'))
          abortTransaction('reviewer_not_authorized');
        const now = new Date();
        const release = await catalogue.install(scope, p, now);
        const event = publicationEvent(
          p.problemId,
          p.version,
          validated.checksum,
          now.toISOString(),
        );
        const receipt = await publications.insert(scope, {
          releaseId: release.releaseId,
          reviewId,
          publisherId: actor.userId,
          publishedAt: now.toISOString(),
          permissionRevision: actor.snapshot.revision,
          permissionDigest: actor.snapshot.digest,
          event,
        });
        await publications.audit(
          scope,
          'published',
          release.releaseId,
          actor.userId,
          'review_approved',
          actor.snapshot.revision,
          actor.snapshot.digest,
        );
        await catalogue.selectCurrent(scope, p.problemId, release.releaseId);
        return receipt;
      }, auth.signal);
    },
    async withdraw(
      auth: AuthenticationInput,
      problemId: string,
      version: string,
      reasonCode: string,
    ) {
      const actor = await verify(auth, 'withdraw_content');
      if (
        !identifier(problemId) ||
        !identifier(version) ||
        !withdrawalReasonSchema.safeParse(reasonCode).success
      )
        fail('invalid_withdrawal');
      return tx.run(async (scope) => {
        const problem = await catalogue.lockProblem(scope, problemId);
        if (!problem) abortTransaction('release_not_found');
        const release = await catalogue.findRelease(scope, problemId, version);
        if (!release) abortTransaction('release_not_found');
        const availability = await catalogue.lockAvailability(
          scope,
          release.releaseId,
        );
        if (!availability) abortTransaction('release_not_found');
        if (availability.status === 'withdrawn')
          return Object.freeze({
            releaseId: release.releaseId,
            status: 'withdrawn' as const,
          });
        await catalogue.setAvailability(
          scope,
          release.releaseId,
          'withdrawn',
          reasonCode,
          new Date(),
        );
        if (problem.current_release_id === release.releaseId)
          await catalogue.selectCurrent(scope, problemId, null);
        await publications.audit(
          scope,
          'withdrawn',
          release.releaseId,
          actor.userId,
          reasonCode,
          actor.snapshot.revision,
          actor.snapshot.digest,
        );
        return Object.freeze({
          releaseId: release.releaseId,
          status: 'withdrawn' as const,
        });
      }, auth.signal);
    },
  });
}
