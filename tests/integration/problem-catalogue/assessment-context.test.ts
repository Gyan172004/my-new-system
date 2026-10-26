import { afterAll, beforeAll, expect, it } from 'vitest';
import { createAssessmentContextReader } from '../../../src/modules/problem-catalogue/public';
import { createHintRoutingService } from '../../../src/modules/content-publishing/public';
import {
  publicationFixture,
  approvedChecklist,
  auth,
} from '../../helpers/catalogue-publication';
import { parseStaffConfiguration } from '../../../src/server/content-staff';

let f: Awaited<ReturnType<typeof publicationFixture>>;
let pin: { problemId: string; packVersion: string; packChecksum: string };
beforeAll(async () => {
  f = await publicationFixture();
  const reviewed = await f.service.review(auth, f.raw(), {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  const published = await f.service.publish(auth, f.raw(), reviewed.reviewId);
  pin = {
    problemId: f.pack.problemId,
    packVersion: f.pack.version,
    packChecksum: published.event.payload.contentChecksum,
  };
}, 30000);
afterAll(async () => {
  await f?.close();
}, 30000);
function manifest(revision = 'routing-v1') {
  return {
    schemaVersion: 1,
    ...pin,
    revision,
    authorId: f.author.userId,
    provenance: 'synthetic independently reviewed fixture',
    defaultLadderId: f.pack.interview.hintLadders[0]!.id,
    approachLadders: f.pack.interview.hintLadders.map((l) => ({
      approachId: l.approachId,
      ladderId: l.id,
    })),
  };
}
const routing = () =>
  createHintRoutingService(f.db, { identity: f.identity, staff: f.staff });
it('projects only bounded matcher fields from an exact immutable pin', async () => {
  const reader = createAssessmentContextReader(f.db);
  const context = await reader.readPinnedAssessmentContext(pin);
  expect(context.references[0]).toEqual({
    id: f.pack.interview.approaches[0]!.id,
    name: f.pack.interview.approaches[0]!.name,
    summary: f.pack.interview.approaches[0]!.summary,
    preconditions: f.pack.interview.approaches[0]!.preconditions,
    matchingFeatures: f.pack.interview.approaches[0]!.matchingFeatures,
  });
  expect(JSON.stringify(context)).not.toContain('hintLadders');
  expect(JSON.stringify(context)).not.toContain('correctness');
  expect(JSON.stringify(context)).not.toContain('expectedOutput');
  expect(Object.isFrozen(context.references)).toBe(true);
  await expect(
    reader.readPinnedAssessmentContext({
      ...pin,
      packChecksum: 'b'.repeat(64),
    }),
  ).rejects.toThrow('pinned_content_unavailable');
  await expect(
    reader.readPinnedAssessmentContext({ ...pin, packVersion: 'missing' }),
  ).rejects.toThrow('pinned_content_unavailable');
  const ladder = await reader.readPinnedHintLadder(
    pin,
    f.pack.interview.hintLadders[0]!.id,
  );
  expect(ladder.hints.map((h) => h.ordinal)).toEqual(
    f.pack.interview.hintLadders[0]!.hints.map((h) => h.ordinal),
  );
  await expect(reader.readPinnedHintLadder(pin, 'unknown')).rejects.toThrow(
    'pinned_content_unavailable',
  );
});
it('requires independent reviewed exact routing and retains immutable revisions', async () => {
  const reader = createAssessmentContextReader(f.db);
  await expect(reader.readPinnedHintRouting(pin)).rejects.toThrow(
    'hint_routing_unavailable',
  );
  const raw = manifest();
  await expect(
    routing().review(
      { ...auth, authorization: 'Bearer test_alice' },
      raw,
      'evidence',
    ),
  ).rejects.toThrow('content_forbidden');
  await expect(
    routing().review(auth, { ...raw, authorId: f.reviewer.userId }, 'evidence'),
  ).rejects.toThrow('self_review_forbidden');
  const review = await routing().review(auth, raw, 'evidence-reviewed-v1');
  await expect(
    routing().install(auth, { ...raw, provenance: 'changed' }, review.reviewId),
  ).rejects.toThrow('routing_review_mismatch');
  const installed = await routing().install(auth, raw, review.reviewId);
  expect((await reader.readPinnedHintRouting(pin)).hash).toBe(installed.hash);
  const next = manifest('routing-v2');
  const review2 = await routing().review(auth, next, 'evidence-reviewed-v2');
  await routing().install(auth, next, review2.reviewId);
  expect((await reader.readPinnedHintRouting(pin)).revision).toBe('routing-v2');
  expect(
    (await reader.readPinnedHintRouting(pin, installed.hash)).revision,
  ).toBe('routing-v1');
  await routing().install(auth, raw, review.reviewId);
  expect((await reader.readPinnedHintRouting(pin)).revision).toBe('routing-v2');
  await expect(
    f.db.withClient((c) =>
      c.query(
        'UPDATE catalogue_hint_routing_revisions SET manifest=manifest WHERE hash=$1',
        [installed.hash],
      ),
    ),
  ).rejects.toThrow();
});
it('denies publish permission, inactive author and revoked reviewer grants without installing', async () => {
  const raw = manifest('permission-v1');
  await f.db.withClient((c) =>
    c.query("UPDATE users SET account_status='disabled' WHERE id=$1", [
      f.author.userId,
    ]),
  );
  try {
    await expect(routing().review(auth, raw, 'evidence')).rejects.toThrow(
      'author_not_active',
    );
  } finally {
    await f.db.withClient((c) =>
      c.query("UPDATE users SET account_status='active' WHERE id=$1", [
        f.author.userId,
      ]),
    );
  }
  const reviewed = await routing().review(auth, raw, 'evidence');
  await expect(
    routing().install(
      { ...auth, authorization: 'Bearer test_alice' },
      raw,
      reviewed.reviewId,
    ),
  ).rejects.toThrow('content_forbidden');
  const staff = parseStaffConfiguration({
    CONTENT_STAFF_GRANTS_JSON: JSON.stringify([
      { userId: f.reviewer.userId, permissions: ['publish_content'] },
    ]),
    CONTENT_STAFF_CONFIG_REVISION: 'revoked-review',
  });
  await expect(
    createHintRoutingService(f.db, { identity: f.identity, staff }).install(
      auth,
      raw,
      reviewed.reviewId,
    ),
  ).rejects.toThrow('reviewer_not_authorized');
  await f.db.withClient((c) =>
    c.query("UPDATE users SET account_status='disabled' WHERE id=$1", [
      f.reviewer.userId,
    ]),
  );
  try {
    await expect(
      routing().install(auth, raw, reviewed.reviewId),
    ).rejects.toThrow();
  } finally {
    await f.db.withClient((c) =>
      c.query("UPDATE users SET account_status='active' WHERE id=$1", [
        f.reviewer.userId,
      ]),
    );
  }
  expect(
    (
      await f.db.withClient((c) =>
        c.query(
          'SELECT count(*)::int n FROM catalogue_hint_routing_revisions WHERE revision=$1',
          [raw.revision],
        ),
      )
    ).rows[0].n,
  ).toBe(0);
});
it('concurrent identical install is one immutable revision and cannot overwrite a revision with different reviewed bytes', async () => {
  const raw = manifest('concurrent-v1');
  const reviewed = await routing().review(auth, raw, 'evidence');
  const outcomes = await Promise.all([
    routing().install(auth, raw, reviewed.reviewId),
    routing().install(auth, raw, reviewed.reviewId),
  ]);
  expect(outcomes[0]).toEqual(outcomes[1]);
  expect(
    (
      await f.db.withClient((c) =>
        c.query(
          'SELECT count(*)::int n FROM catalogue_hint_routing_revisions WHERE revision=$1',
          [raw.revision],
        ),
      )
    ).rows[0].n,
  ).toBe(1);
  const changed = { ...raw, provenance: 'different reviewed bytes' };
  const changedReview = await routing().review(auth, changed, 'evidence');
  await expect(
    routing().install(auth, changed, changedReview.reviewId),
  ).rejects.toThrow('hint_routing_unavailable');
  expect(
    (await createAssessmentContextReader(f.db).readPinnedHintRouting(pin)).hash,
  ).toBe(outcomes[0]!.hash);
});
