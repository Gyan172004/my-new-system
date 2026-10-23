import { z } from 'zod';
import { validatePack } from '../domain/validate-pack';
import { fail } from './operators';
export const checklistSchema = z.strictObject({
  statement: z.boolean(),
  approaches: z.boolean(),
  correctness: z.boolean(),
  complexity: z.boolean(),
  hints: z.boolean(),
  tests: z.boolean(),
  rights: z.boolean(),
  followups: z.boolean(),
  variants: z.boolean(),
  evidenceRef: z
    .string()
    .trim()
    .min(1)
    .refine(
      (s) =>
        Buffer.byteLength(s) <= 256 &&
        ![...s].some((char) => char.charCodeAt(0) < 32),
    ),
});
export const reviewInputSchema = z.strictObject({
  decision: z.enum(['approved', 'rejected']),
  checklist: checklistSchema,
});
export function reviewEvidence(input: unknown) {
  const r = reviewInputSchema.safeParse(input);
  if (!r.success) fail('invalid_review_evidence');
  if (
    r.data!.decision === 'approved' &&
    Object.entries(r.data!.checklist).some(
      ([key, value]) => key !== 'evidenceRef' && value !== true,
    )
  )
    fail('invalid_review_evidence');
  return Object.freeze({
    ...r.data!,
    checklist: Object.freeze(r.data!.checklist),
  });
}
export function validatedSource(
  raw: Uint8Array | string,
  mode: 'draft' | 'publication',
) {
  const result = validatePack(raw, mode);
  if (!result.ok)
    fail(mode === 'publication' ? 'pack_not_publishable' : 'invalid_pack');
  return result as Extract<ReturnType<typeof validatePack>, { ok: true }>;
}
