import { z } from 'zod';

export const PACK_LIMITS = Object.freeze({
  bundle: 2 * 1024 * 1024,
  prose: 32768,
  data: 131072,
  cases: 1000,
  entries: 2000,
  depth: 32,
  id: 256,
  candidate: 262144,
  errors: 100,
});
const text = z
  .string()
  .min(1)
  .refine(
    (v) => v.trim().length > 0 && Buffer.byteLength(v) <= PACK_LIMITS.prose,
  );
const id = z
  .string()
  .min(1)
  .refine((v) => v.trim().length > 0 && Buffer.byteLength(v) <= PACK_LIMITS.id);
const list = <T extends z.ZodType>(item: T, minimum = 0) =>
  z.array(item).min(minimum).max(PACK_LIMITS.entries);
const texts = list(text);
const ids = list(id);
const review = z.enum(['pending', 'approved']);
const hintRule = z.strictObject({
  ruleId: z.literal('accepted_hint_request'),
  stages: z.tuple([z.literal('hints')]),
});
const followupRule = z.strictObject({
  ruleId: z.literal('approved_followup_selection'),
  stages: z.tuple([z.literal('variants_and_followups')]),
});
const example = z.strictObject({
  input: text,
  output: text,
  explanation: text.optional(),
});
const approach = z.strictObject({
  id,
  name: text,
  summary: text,
  steps: list(text, 1),
  preconditions: list(text, 1),
  correctness: text,
  complexity: z.strictObject({ time: text, extraSpace: text }),
  tradeoffs: texts,
  matchingFeatures: texts,
  requiredKnowledge: texts,
});
const hint = z.strictObject({
  id,
  ordinal: z.number().int().positive(),
  text,
  intendedConcept: text,
  eligibilityRule: hintRule,
  paraphraseAllowed: z.boolean(),
});
const caseSchema = z.strictObject({
  id,
  category: z.enum([
    'example',
    'normal',
    'edge-size',
    'edge-position',
    'edge-same-element',
    'edge-zero',
    'edge-negative',
    'edge-duplicates',
    'edge-numeric-boundary',
    'edge-sorting',
    'performance',
  ]),
  visibility: z.enum(['public', 'hidden']),
  input: z.strictObject({
    nums: z.array(z.number().int().min(-1e9).max(1e9)).min(2).max(10000),
    target: z.number().int().min(-1e9).max(1e9),
  }),
  expectedOutput: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]),
  rationale: text,
  validationEvidence: z.strictObject({
    dataCheck: text,
    checkedOn: text,
    sourceReferences: ids,
    humanReviewStatus: review,
  }),
});
export const packSchema = z.strictObject({
  problemId: id.refine(
    (value) =>
      value !== '.' &&
      value !== '..' &&
      ![...value].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ),
  ),
  slug: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: id.refine(
    (value) =>
      ![...value].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ),
  ),
  schemaVersion: z.literal(1),
  authorId: z.uuid().nullable(),
  candidate: z.strictObject({
    title: text,
    difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
    topicTags: list(text, 1),
    statement: text,
    constraints: list(text, 1),
    examples: list(example, 1),
  }),
  interview: z.strictObject({
    clarifications: list(
      z.strictObject({ id, question: text, answer: text }),
      1,
    ),
    invariants: list(text, 1),
    approaches: list(approach, 1),
    mistakes: list(
      z.strictObject({
        id,
        summary: text,
        whyIncorrect: text,
        approachIds: ids,
        testCaseIds: ids,
      }),
    ),
    hintLadders: list(
      z.strictObject({ id, approachId: id, hints: list(hint, 1) }),
      1,
    ),
    followups: list(
      z.strictObject({
        id,
        question: text,
        skill: text,
        expectedAnswerPoints: list(text, 1),
        evaluationGuidance: text,
        approachIds: ids,
        eligibilityRule: followupRule,
        sourceReferences: ids,
        authorshipNote: text,
        reviewStatus: review,
      }),
    ),
    variants: list(
      z.strictObject({
        id,
        changedContract: text,
        skill: text,
        approachIds: ids,
        complexityGuidance: text,
        executable: z.literal(false),
        reasoningOnlyReason: text,
        reviewStatus: review,
      }),
    ),
    rubric: z.strictObject({
      version: id,
      dimensions: list(
        z.strictObject({
          id,
          strong: list(text, 1),
          partial: list(text, 1),
          incorrect: list(text, 1),
        }),
        1,
      ),
      scoringPolicy: text,
    }),
    exposureRules: z.strictObject({
      candidateFields: list(
        z.enum([
          'title',
          'difficulty',
          'topicTags',
          'statement',
          'constraints',
          'examples',
        ]),
        6,
      )
        .max(6)
        .refine((v) => new Set(v).size === 6),
      hints: text,
      followups: text,
      assessment: text,
    }),
    emptySectionReasons: z
      .strictObject({
        mistakes: text.optional(),
        followups: text.optional(),
        variants: text.optional(),
      })
      .optional(),
  }),
  evaluation: z.strictObject({
    manifest: z.strictObject({
      suiteId: id,
      version: id,
      checkerId: z.literal('distinct-index-pair-unordered'),
      inputProfileId: z.literal('two-sum-base-v1'),
      inputShape: text,
      outputShape: text,
      comparisonRule: text,
      caseIds: ids,
      checkerImplementationStatus: text,
    }),
    cases: z.array(caseSchema).min(1).max(PACK_LIMITS.cases),
  }),
  provenance: z.strictObject({
    sources: list(
      z.strictObject({
        id,
        sourceType: text,
        name: text,
        receivedOn: text,
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
      1,
    ),
    externalReferences: list(
      z.strictObject({
        url: z.url().refine((v) => Buffer.byteLength(v) <= PACK_LIMITS.prose),
        relationship: text,
      }),
    ),
    transformationNotes: list(text, 1),
    rightsReview: z.strictObject({ status: review, evidence: text.nullable() }),
    sourceCoverageStatus: text,
  }),
});
export type MutableProblemPack = z.infer<typeof packSchema>;
export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
export type ProblemPack = DeepReadonly<MutableProblemPack>;
