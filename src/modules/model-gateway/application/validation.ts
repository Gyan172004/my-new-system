import { z } from 'zod';
export const probeInputSchema = z.strictObject({
  text: z
    .string()
    .min(1)
    .max(512)
    .refine((text) => Buffer.byteLength(text, 'utf8') <= 512),
});
export const probeOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  acknowledged: z.literal(true),
});
const reference = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
export const interviewTurnInputSchema = z.strictObject({
  text: z.string().min(1).max(8_192),
});
export const interviewTurnOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  responseText: z.string().min(1).max(4_000),
  suggestedTransitionSignal: z
    .enum(['ready_to_advance', 'needs_clarification', 'none'])
    .optional(),
  matchedReferenceApproachId: reference.optional(),
});
export const requestContextSchema = z.strictObject({
  requestId: reference,
  operationId: reference,
  sessionId: z.uuid().optional(),
  expectedSessionVersion: z.number().int().nonnegative().optional(),
  packVersion: reference.optional(),
  rubricVersion: reference.optional(),
  policyVersion: reference.optional(),
});
