import { createHash } from 'node:crypto';
import { z } from 'zod';
export const contentPermissionSchema = z.enum([
  'review_content',
  'publish_content',
  'withdraw_content',
]);
export type ContentPermission = z.infer<typeof contentPermissionSchema>;
const grantsSchema = z
  .array(
    z.strictObject({
      userId: z.uuid(),
      permissions: z.array(contentPermissionSchema).min(1).max(3),
    }),
  )
  .max(1000);
export function parseStaffConfiguration(
  raw: Readonly<Record<string, string | undefined>>,
) {
  const fail = (): never => {
    throw Error('invalid_content_staff_configuration');
  };
  const source = raw.CONTENT_STAFF_GRANTS_JSON ?? '[]';
  if (Buffer.byteLength(source) > 262144) fail();
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    fail();
  }
  const checked = grantsSchema.safeParse(parsed);
  if (!checked.success) fail();
  const seen = new Set<string>();
  const grants = checked
    .data!.map((g) => {
      const userId = g.userId.toLowerCase();
      if (
        seen.has(userId) ||
        new Set(g.permissions).size !== g.permissions.length
      )
        fail();
      seen.add(userId);
      return Object.freeze({
        userId,
        permissions: Object.freeze([...g.permissions].sort()),
      });
    })
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const revision = grants.length
    ? raw.CONTENT_STAFF_CONFIG_REVISION
    : 'disabled-v1';
  if (
    !revision ||
    revision.trim() !== revision ||
    Buffer.byteLength(revision) > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(revision)
  )
    fail();
  return Object.freeze({
    revision: revision!,
    digest: createHash('sha256').update(JSON.stringify(grants)).digest('hex'),
    grants: Object.freeze(grants),
  });
}
export type ContentStaffConfiguration = ReturnType<
  typeof parseStaffConfiguration
>;
