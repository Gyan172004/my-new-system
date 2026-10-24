import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  publicationFixture,
  approvedChecklist,
  auth,
} from '../../helpers/catalogue-publication';
let f: Awaited<ReturnType<typeof publicationFixture>>;
beforeAll(async () => {
  f = await publicationFixture();
}, 30000);
afterAll(async () => {
  await f?.close();
}, 30000);
it('serializes same-version publishers to one immutable release, event and audit', async () => {
  const r = await f.service.review(auth, f.raw(), {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  const receipts = await Promise.all(
    Array.from({ length: 4 }, () =>
      f.service.publish(auth, f.raw(), r.reviewId),
    ),
  );
  expect(new Set(receipts.map((r) => r.releaseId)).size).toBe(1);
  const row = (
    await f.db.withClient((c) =>
      c.query(
        'SELECT (SELECT count(*)::int FROM content_publications) publications,(SELECT count(*)::int FROM catalogue_releases) releases,(SELECT count(*)::int FROM content_publication_audit) audits,(SELECT count(*)::int FROM session_events) session_events',
      ),
    )
  ).rows[0];
  expect(row).toEqual({
    publications: 1,
    releases: 1,
    audits: 1,
    session_events: 0,
  });
});
it('rejects conflicting content while preserving the first publication', async () => {
  const p = structuredClone(f.pack);
  p.candidate.statement += ' correction';
  const raw = JSON.stringify(p);
  const r = await f.service.review(auth, raw, {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  await expect(f.service.publish(auth, raw, r.reviewId)).rejects.toMatchObject({
    code: 'published_version_conflict',
  });
  expect(
    (
      await f.db.withClient((c) =>
        c.query('SELECT count(*)::int n FROM catalogue_releases'),
      )
    ).rows[0].n,
  ).toBe(1);
});
it('repeated withdrawal retains one audit and does not overwrite original reason', async () => {
  await f.service.withdraw(
    auth,
    f.pack.problemId,
    f.pack.version,
    'rights_issue',
  );
  await f.service.withdraw(
    auth,
    f.pack.problemId,
    f.pack.version,
    'content_error',
  );
  const rows = await f.db.withClient((c) =>
    c.query(
      "SELECT a.reason_code,(SELECT count(*)::int FROM content_publication_audit WHERE action='withdrawn') n FROM catalogue_release_availability a",
    ),
  );
  expect(rows.rows).toEqual([{ reason_code: 'rights_issue', n: 1 }]);
});
