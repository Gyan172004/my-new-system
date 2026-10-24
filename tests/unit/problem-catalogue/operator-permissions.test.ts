import { expect, it } from 'vitest';
import { parseStaffConfiguration } from '../../../src/server/content-staff';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it('defaults to an immutable empty deny-all configuration', () => {
  const c = parseStaffConfiguration({}) as {
    revision: string;
    digest: string;
    grants: unknown[];
  };
  expect(c.revision).toBe('disabled-v1');
  expect(c.grants).toEqual([]);
  expect(c.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.isFrozen(c)).toBe(true);
});
it.each([
  'null',
  '{}',
  '[{"userId":"claimed","permissions":["review_content"]}]',
  JSON.stringify([{ userId: id, permissions: ['admin'] }]),
  JSON.stringify([
    { userId: id, permissions: ['review_content', 'review_content'] },
  ]),
  JSON.stringify([
    { userId: id, permissions: ['review_content'] },
    { userId: id.toUpperCase(), permissions: ['publish_content'] },
  ]),
])('rejects malformed grants without leaking raw configuration', (raw) => {
  expect(() =>
    parseStaffConfiguration({
      CONTENT_STAFF_GRANTS_JSON: raw,
      CONTENT_STAFF_CONFIG_REVISION: 'v1',
    }),
  ).toThrow('invalid_content_staff_configuration');
});
it('requires revision and snapshots a canonical sorted grant digest', () => {
  const grants = JSON.stringify([
    {
      userId: id.toUpperCase(),
      permissions: ['withdraw_content', 'review_content'],
    },
  ]);
  expect(() =>
    parseStaffConfiguration({ CONTENT_STAFF_GRANTS_JSON: grants }),
  ).toThrow();
  const c = parseStaffConfiguration({
    CONTENT_STAFF_GRANTS_JSON: grants,
    CONTENT_STAFF_CONFIG_REVISION: 'v1',
  }) as { grants: readonly { userId: string }[]; digest: string };
  const d = parseStaffConfiguration({
    CONTENT_STAFF_GRANTS_JSON: JSON.stringify([
      { userId: id, permissions: ['review_content', 'withdraw_content'] },
    ]),
    CONTENT_STAFF_CONFIG_REVISION: 'v2',
  }) as { digest: string };
  expect(c.grants[0]?.userId).toBe(id);
  expect(c.digest).toBe(d.digest);
  expect(Object.isFrozen(c.grants[0])).toBe(true);
});
