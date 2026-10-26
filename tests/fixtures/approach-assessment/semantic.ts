export const evidence = [
  {
    id: 'turn-1',
    sessionId: 'synthetic',
    version: 2,
    speaker: 'candidate',
    stage: 'initial_approach',
    modality: 'text',
    text: '😀 I use a map',
  },
] as const;
export const context = {
  sessionId: 'synthetic',
  sourceVersion: 2,
  reservedCandidateTurnId: null,
  referenceIds: ['map', 'sort'],
  evidence,
};
export const citation = {
  turnId: 'turn-1',
  span: { start: 2, end: 13, excerpt: 'I use a map' },
};
export const proposal = {
  schemaVersion: 1,
  operation: 'approach_assessment',
  summary: 'PRIVATE_SUMMARY',
  interpretation: 'understood',
  matches: [{ referenceId: 'map', confidence: 0.8, evidenceRefs: [citation] }],
  findings: [
    { kind: 'plausible', claim: 'PRIVATE_CLAIM', evidenceRefs: [citation] },
  ],
  missingEvidence: [],
  candidateComplexity: { time: null, space: null },
};
export const profile = {
  id: 'synthetic-v1',
  tau: 0.75,
  delta: 0.125,
  minEvidenceRefs: 1,
  scoreComparison: 'ieee754-exact',
} as const;
