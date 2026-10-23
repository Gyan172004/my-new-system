import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  publicationFixture,
  approvedChecklist,
  auth as baseAuth,
} from '../../helpers/catalogue-publication';
import { createPublishingService } from '../../../src/modules/content-publishing/application/service';
import { parseStaffConfiguration } from '../../../src/server/content-staff';
const auth = { ...baseAuth };
beforeEach(() => {
  auth.sourceAddress = 'publication-test-' + randomUUID();
});
let f: Awaited<ReturnType<typeof publicationFixture>>;
beforeAll(async () => {
  f = await publicationFixture();
}, 30000);
afterAll(async () => {
  await f?.close();
}, 30000);
it('records independent immutable evidence and atomically publishes one canonical receipt', async () => {
  const review = (await f.service.review(auth, f.raw(), {
    decision: 'approved',
    checklist: approvedChecklist,
  })) as { reviewId: string };
  expect(review?.reviewId).toMatch(/^[a-f0-9-]{36}$/);
  const receipt = (await f.service.publish(auth, f.raw(), review.reviewId)) as {
    releaseId: string;
    event: { eventType: string };
  };
  expect(receipt?.releaseId).toMatch(/^[a-f0-9-]{36}$/);
  expect(receipt.event.eventType).toBe('content.problem_pack.published');
  const rows = await f.db.withClient((c) =>
    c.query(
      'SELECT p.current_release_id,r.sealed,a.status FROM catalogue_problems p JOIN catalogue_releases r ON r.id=p.current_release_id JOIN catalogue_release_availability a ON a.release_id=r.id WHERE p.id=$1',
      [f.pack.problemId],
    ),
  );
  expect(rows.rows).toEqual([
    { current_release_id: receipt.releaseId, sealed: true, status: 'eligible' },
  ]);
  expect(await f.service.publish(auth, f.raw(), review.reviewId)).toEqual(
    receipt,
  );
});
it('denies unauthenticated and default-deny operators, self-review, absent and disabled authors', async () => {
  await expect(
    f.service.review({ ...auth, authorization: 'Bearer claimed' }, f.raw(), {
      decision: 'approved',
      checklist: approvedChecklist,
    }),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  const denied = createPublishingService(f.db, {
    identity: f.identity,
    staff: parseStaffConfiguration({}),
  });
  await expect(
    denied.review(auth, f.raw(), {
      decision: 'approved',
      checklist: approvedChecklist,
    }),
  ).rejects.toMatchObject({ code: 'content_forbidden' });
  const p = structuredClone(f.pack);
  p.authorId = f.reviewer.userId;
  await expect(
    f.service.review(auth, JSON.stringify(p), {
      decision: 'approved',
      checklist: approvedChecklist,
    }),
  ).rejects.toMatchObject({ code: 'self_review_forbidden' });
  p.authorId = randomUUID();
  await expect(
    f.service.review(auth, JSON.stringify(p), {
      decision: 'approved',
      checklist: approvedChecklist,
    }),
  ).rejects.toMatchObject({ code: 'author_not_active' });
});
it('records rejection for pending annotations but cannot publish rejection or incomplete approval', async () => {
  const p = structuredClone(f.pack);
  p.version = 'rejected';
  p.provenance.rightsReview.status = 'pending';
  p.provenance.rightsReview.evidence = null as never;
  const raw = JSON.stringify(p);
  const review = (await f.service.review(auth, raw, {
    decision: 'rejected',
    checklist: { ...approvedChecklist, rights: false },
  })) as { reviewId: string };
  expect(review?.reviewId).toBeDefined();
  await expect(
    f.service.publish(auth, raw, review.reviewId),
  ).rejects.toMatchObject({ code: 'pack_not_publishable' });
  await expect(
    f.service.review(auth, f.raw(), {
      decision: 'approved',
      checklist: { ...approvedChecklist, variants: false },
    }),
  ).rejects.toMatchObject({ code: 'invalid_review_evidence' });
});
it('rejects a stale approved checksum without creating a release', async () => {
  const p = structuredClone(f.pack);
  p.version = 'stale';
  const raw = JSON.stringify(p);
  const r = (await f.service.review(auth, raw, {
    decision: 'approved',
    checklist: approvedChecklist,
  })) as { reviewId: string };
  p.candidate.statement += ' Changed.';
  await expect(
    f.service.publish(auth, JSON.stringify(p), r?.reviewId),
  ).rejects.toMatchObject({ code: 'review_mismatch' });
  expect(
    (
      await f.db.withClient((c) =>
        c.query(
          'SELECT id FROM catalogue_releases WHERE problem_id=$1 AND version=$2',
          [p.problemId, p.version],
        ),
      )
    ).rowCount,
  ).toBe(0);
});
it('does not reselect or reenable a withdrawn historical release on exact retry after reviewer revocation', async () => {
  const p = structuredClone(f.pack);
  p.version = 'history';
  const raw = JSON.stringify(p);
  const r = (await f.service.review(auth, raw, {
    decision: 'approved',
    checklist: approvedChecklist,
  })) as { reviewId: string };
  const receipt = (await f.service.publish(auth, raw, r.reviewId)) as {
    releaseId: string;
  };
  await f.service.withdraw(auth, p.problemId, p.version, 'content_error');
  const current = createPublishingService(f.db, {
    identity: f.identity,
    staff: parseStaffConfiguration({
      CONTENT_STAFF_GRANTS_JSON: JSON.stringify([
        { userId: f.reviewer.userId, permissions: ['publish_content'] },
      ]),
      CONTENT_STAFF_CONFIG_REVISION: 'test-v2',
    }),
  });
  expect(await current.publish(auth, raw, r.reviewId)).toEqual(receipt);
  const row = (
    await f.db.withClient((c) =>
      c.query(
        'SELECT p.current_release_id,a.status FROM catalogue_problems p JOIN catalogue_release_availability a ON a.release_id=$2 WHERE p.id=$1',
        [p.problemId, receipt.releaseId],
      ),
    )
  ).rows[0];
  expect(row).toEqual({ current_release_id: null, status: 'withdrawn' });
  p.version = 'revoked-new';
  const newReview = (await f.service.review(auth, JSON.stringify(p), {
    decision: 'approved',
    checklist: approvedChecklist,
  })) as { reviewId: string };
  await expect(
    current.publish(auth, JSON.stringify(p), newReview.reviewId),
  ).rejects.toMatchObject({ code: 'reviewer_not_authorized' });
});
it('refuses disabled author proof and author UUID case cannot evade self-review', async () => {
  const p = structuredClone(f.pack);
  p.authorId = f.reviewer.userId.toUpperCase();
  await expect(
    f.service.review(auth, JSON.stringify(p), {
      decision: 'approved',
      checklist: approvedChecklist,
    }),
  ).rejects.toMatchObject({ code: 'self_review_forbidden' });
  await f.db.withClient((c) =>
    c.query("UPDATE users SET account_status='disabled' WHERE id=$1", [
      f.author.userId,
    ]),
  );
  try {
    await expect(
      f.service.review(auth, f.raw(), {
        decision: 'approved',
        checklist: approvedChecklist,
      }),
    ).rejects.toMatchObject({ code: 'author_not_active' });
  } finally {
    await f.db.withClient((c) =>
      c.query("UPDATE users SET account_status='active' WHERE id=$1", [
        f.author.userId,
      ]),
    );
  }
});
it.each([
  'INSERT INTO catalogue_releases',
  'INSERT INTO catalogue_test_cases',
  'INSERT INTO content_publications',
  'INSERT INTO content_publication_audit',
  'UPDATE catalogue_problems SET current_release_id',
])(
  'rolls back every visibility/evidence write after injected failure at %s',
  async (stage) => {
    const p = structuredClone(f.pack);
    p.problemId = 'rollback-' + randomUUID();
    p.slug = p.problemId;
    const raw = JSON.stringify(p);
    const r = await f.service.review(auth, raw, {
      decision: 'approved',
      checklist: approvedChecklist,
    });
    const proxy = {
      withClient<T>(
        work: (c: import('pg').PoolClient) => Promise<T>,
        signal?: AbortSignal,
      ) {
        return f.db.withClient(
          (c) =>
            work(
              new Proxy(c, {
                get(target, key, receiver) {
                  if (key === 'query')
                    return async (...args: unknown[]) => {
                      const result = await Reflect.apply(
                        target.query,
                        target,
                        args,
                      );
                      if (
                        typeof args[0] === 'string' &&
                        args[0].includes(stage)
                      )
                        throw Error('private-driver-content-canary');
                      return result;
                    };
                  return Reflect.get(target, key, receiver);
                },
              }),
            ),
          signal,
        );
      },
    };
    await expect(
      createPublishingService(proxy, {
        identity: f.identity,
        staff: f.staff,
      }).publish(auth, raw, r.reviewId),
    ).rejects.toThrow('database_unavailable');
    const row = (
      await f.db.withClient((c) =>
        c.query(
          'SELECT (SELECT count(*)::int FROM catalogue_problems WHERE id=$1) problems,(SELECT count(*)::int FROM catalogue_releases WHERE problem_id=$1) releases,(SELECT count(*)::int FROM content_publications p JOIN content_reviews r ON p.review_id=r.id WHERE r.problem_id=$1) publications',
          [p.problemId],
        ),
      )
    ).rows[0];
    expect(row).toEqual({ problems: 0, releases: 0, publications: 0 });
  },
);
it('cancellation destroys an in-flight writer and leaves no partially installed release', async () => {
  const p = structuredClone(f.pack);
  p.problemId = 'cancel-' + randomUUID();
  p.slug = p.problemId;
  const raw = JSON.stringify(p);
  const r = await f.service.review(auth, raw, {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  const controller = new AbortController();
  const proxy = {
    withClient<T>(
      work: (c: import('pg').PoolClient) => Promise<T>,
      signal?: AbortSignal,
    ) {
      return f.db.withClient(
        (c) =>
          work(
            new Proxy(c, {
              get(target, key, receiver) {
                if (key === 'query')
                  return async (...args: unknown[]) => {
                    const result = await Reflect.apply(
                      target.query,
                      target,
                      args,
                    );
                    if (
                      typeof args[0] === 'string' &&
                      args[0].startsWith('INSERT INTO catalogue_releases')
                    ) {
                      controller.abort();
                      await target.query('SELECT pg_sleep(1)');
                    }
                    return result;
                  };
                return Reflect.get(target, key, receiver);
              },
            }),
          ),
        signal,
      );
    },
  };
  await expect(
    createPublishingService(proxy, {
      identity: f.identity,
      staff: f.staff,
    }).publish({ ...auth, signal: controller.signal }, raw, r.reviewId),
  ).rejects.toThrow('database_unavailable');
  expect(
    (
      await f.db.withClient((c) =>
        c.query('SELECT id FROM catalogue_releases WHERE problem_id=$1', [
          p.problemId,
        ]),
      )
    ).rowCount,
  ).toBe(0);
});
it('requires current publisher permission on exact historical retry and denies rejected review publication', async () => {
  const p = structuredClone(f.pack);
  p.version = 'permissions';
  const raw = JSON.stringify(p);
  const review = await f.service.review(auth, raw, {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  await f.service.publish(auth, raw, review.reviewId);
  const denied = createPublishingService(f.db, {
    identity: f.identity,
    staff: parseStaffConfiguration({
      CONTENT_STAFF_GRANTS_JSON: JSON.stringify([
        { userId: f.reviewer.userId, permissions: ['review_content'] },
      ]),
      CONTENT_STAFF_CONFIG_REVISION: 'no-publisher',
    }),
  });
  await expect(
    denied.publish(auth, raw, review.reviewId),
  ).rejects.toMatchObject({ code: 'content_forbidden' });
  const reject = await f.service.review(auth, raw, {
    decision: 'rejected',
    checklist: { ...approvedChecklist, correctness: false },
  });
  await expect(
    f.service.publish(auth, raw, reject.reviewId),
  ).rejects.toMatchObject({ code: 'review_mismatch' });
});
it('normalizes a valid uppercase review UUID for the first publication and exact retry', async () => {
  const p = structuredClone(f.pack);
  p.version = 'uppercase-review';
  const raw = JSON.stringify(p);
  const review = await f.service.review(auth, raw, {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  const uppercaseId = review.reviewId.toUpperCase();
  const receipt = await f.service.publish(auth, raw, uppercaseId);
  expect(receipt.reviewId).toBe(review.reviewId);
  await expect(f.service.publish(auth, raw, uppercaseId)).resolves.toEqual(
    receipt,
  );
});
