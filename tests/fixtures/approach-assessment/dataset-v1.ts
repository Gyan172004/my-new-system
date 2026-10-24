import { createHash } from 'node:crypto';

// Reviewed synthetic evaluation dataset. Every case is author-constructed and
// self-contained (no real candidate transcripts, no provider output). This
// dataset measures classifier MECHANICS against known labels, never real-provider
// qualification: see tests/contract/approach-assessment/evaluation.test.ts.
export const datasetVersion = 'reviewed-synthetic-v1';
export const authorId = '00000000-0000-4000-8000-0000000000a1';
export const reviewerId = '00000000-0000-4000-8000-0000000000a2';
export const profile = {
  id: 'dataset-v1-profile',
  tau: 0.75,
  delta: 0.1,
  minEvidenceRefs: 1,
  scoreComparison: 'ieee754-exact',
} as const;

const reference = (id: string, name: string) => ({
  id,
  name,
  summary: `PRIVATE_SUMMARY_${id}`,
  preconditions: [] as string[],
  matchingFeatures: [] as string[],
});
const evidenceTurn = (caseId: string) => ({
  id: `turn-${caseId}`,
  sessionId: `fixture:${caseId}`,
  version: 1,
  speaker: 'candidate' as const,
  stage: 'initial_approach',
  modality: 'text' as const,
  text: `PRIVATE_TRANSCRIPT_${caseId}`,
});
const match = (referenceId: string, confidence: number, turnId: string) => ({
  referenceId,
  confidence,
  evidenceRefs: [{ turnId, span: null }],
});
const finding = (turnId: string) => ({
  kind: 'plausible' as const,
  claim: 'PRIVATE_CLAIM',
  evidenceRefs: [{ turnId, span: null }],
});

export interface DatasetCase {
  readonly id: string;
  readonly expectedOutcome: 'matched' | 'ambiguous' | 'abstained' | 'novel';
  readonly expectedReferenceId: string | null;
  readonly fixture: Readonly<Record<string, unknown>>;
  readonly proposal: Readonly<Record<string, unknown>>;
}

function makeCase(
  id: string,
  refs: ReturnType<typeof reference>[],
  proposal: Readonly<Record<string, unknown>>,
  expectedOutcome: DatasetCase['expectedOutcome'],
  expectedReferenceId: string | null,
): DatasetCase {
  const turn = evidenceTurn(id);
  const context = {
    sessionId: turn.sessionId,
    sourceVersion: 1,
    reservedCandidateTurnId: null,
    referenceIds: refs.map((r) => r.id),
    evidence: [turn],
  };
  const input = { text: turn.text, references: refs, evidence: [turn] };
  const fixture = {
    id,
    source: 'synthetic',
    datasetVersion,
    authorId,
    reviewerId,
    reviewRef: `review:${id}`,
    context,
    input,
    contentHash: createHash('sha256')
      .update(JSON.stringify({ input, context }))
      .digest('hex'),
  };
  return { id, expectedOutcome, expectedReferenceId, fixture, proposal };
}

const base = (overrides: Readonly<Record<string, unknown>>) => ({
  schemaVersion: 1,
  operation: 'approach_assessment',
  summary: 'PRIVATE_SUMMARY',
  interpretation: 'understood',
  matches: [] as unknown[],
  findings: [] as unknown[],
  missingEvidence: [] as unknown[],
  candidateComplexity: { time: null, space: null },
  ...overrides,
});

const map = reference('map', 'Hash map lookup');
const sort = reference('sort', 'Sort and scan');

export const cases: readonly DatasetCase[] = [
  makeCase(
    'matched-correct-1',
    [map],
    base({ matches: [match('map', 0.9, 'turn-matched-correct-1')] }),
    'matched',
    'map',
  ),
  makeCase(
    'matched-correct-2',
    [sort, map],
    base({
      matches: [
        match('sort', 0.95, 'turn-matched-correct-2'),
        match('map', 0.6, 'turn-matched-correct-2'),
      ],
    }),
    'matched',
    'sort',
  ),
  makeCase(
    'matched-wrong-1',
    [map, sort],
    base({ matches: [match('map', 0.9, 'turn-matched-wrong-1')] }),
    'matched',
    'sort',
  ),
  makeCase(
    'matched-wrong-2',
    [map, sort],
    base({ matches: [match('sort', 0.88, 'turn-matched-wrong-2')] }),
    'matched',
    'map',
  ),
  makeCase(
    'ambiguous-tied',
    [sort, map],
    base({
      matches: [
        match('sort', 0.8, 'turn-ambiguous-tied'),
        match('map', 0.8, 'turn-ambiguous-tied'),
      ],
    }),
    'ambiguous',
    null,
  ),
  makeCase(
    'ambiguous-margin',
    [sort, map],
    base({
      matches: [
        match('sort', 0.9, 'turn-ambiguous-margin'),
        match('map', 0.85, 'turn-ambiguous-margin'),
      ],
    }),
    'ambiguous',
    null,
  ),
  makeCase(
    'ambiguous-interpretation',
    [map],
    base({ interpretation: 'incomplete' }),
    'ambiguous',
    null,
  ),
  makeCase(
    'abstained-low-confidence',
    [map],
    base({ matches: [match('map', 0.5, 'turn-abstained-low-confidence')] }),
    'abstained',
    null,
  ),
  makeCase(
    'abstained-no-evidence',
    [map],
    base({ interpretation: 'uninterpretable' }),
    'abstained',
    null,
  ),
  makeCase(
    'novel',
    [map],
    base({ findings: [finding('turn-novel')] }),
    'novel',
    null,
  ),
];
