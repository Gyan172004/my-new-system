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

const evidenceRefSchema = z.strictObject({
  turnId: reference,
  span: z
    .strictObject({
      start: z.number().int().nonnegative(),
      end: z.number().int().positive(),
      excerpt: z.string().min(1).max(2048),
    })
    .nullable(),
});
const supportedClaimSchema = z.strictObject({
  claim: z.string().min(1).max(2048),
  evidenceRefs: z.array(evidenceRefSchema).min(1).max(16),
});
export const assessmentEvidenceSchema = z.strictObject({
  id: reference,
  sessionId: reference,
  version: z.number().int().nonnegative(),
  speaker: z.literal('candidate'),
  stage: z.enum([
    'initial_approach',
    'approach_clarification',
    'improve_approach',
  ]),
  modality: z.enum(['text', 'accepted_transcript']),
  text: z.string().min(1).max(8192),
});
export const approachAssessmentInputSchema = z.strictObject({
  text: z.string().min(1).max(8192),
  references: z
    .array(
      z.strictObject({
        id: reference,
        name: z.string().min(1).max(256),
        summary: z.string().min(1).max(4096),
        preconditions: z.array(z.string().max(2048)).max(32),
        matchingFeatures: z.array(z.string().max(2048)).max(32),
      }),
    )
    .min(1)
    .max(64),
  evidence: z.array(assessmentEvidenceSchema).min(1).max(32),
});
export const approachAssessmentOutputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operation: z.literal('approach_assessment'),
  summary: z.string().min(1).max(2048),
  interpretation: z.enum([
    'understood',
    'incomplete',
    'conflicting',
    'uninterpretable',
  ]),
  matches: z
    .array(
      z.strictObject({
        referenceId: reference,
        confidence: z.number().min(0).max(1),
        evidenceRefs: z.array(evidenceRefSchema).min(1).max(16),
      }),
    )
    .max(64),
  findings: z
    .array(
      supportedClaimSchema.extend({
        kind: z.enum(['plausible', 'gap', 'contradiction', 'unknown']),
      }),
    )
    .max(32),
  missingEvidence: z.array(z.string().min(1).max(512)).max(32),
  candidateComplexity: z.strictObject({
    time: supportedClaimSchema.nullable(),
    space: supportedClaimSchema.nullable(),
  }),
});
