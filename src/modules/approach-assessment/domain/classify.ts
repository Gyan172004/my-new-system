import { z } from 'zod';
import type { VerifiedProposal } from './proposal';
export const classificationProfileSchema = z.strictObject({
  id: z.string().min(1).max(128),
  tau: z.number().min(0).max(1),
  delta: z.number().min(0).max(1),
  minEvidenceRefs: z.number().int().min(1).max(16),
  scoreComparison: z.literal('ieee754-exact'),
});
export type ClassificationProfile = z.infer<typeof classificationProfileSchema>;
export type AssessmentOutcome = 'matched' | 'ambiguous' | 'abstained' | 'novel';
export type AssessmentReason =
  | 'matched_reference'
  | 'clarification_needed'
  | 'insufficient_evidence'
  | 'unmatched_understood'
  | 'tied_matches'
  | 'low_confidence'
  | 'insufficient_margin'
  | 'no_positive_match'
  | 'unresolved_reasoning'
  | 'unqualified_policy';
export type ClassifiedAssessment = Readonly<{
  outcome: AssessmentOutcome;
  matchedReferenceId: string | null;
  reasonCode: AssessmentReason;
  proposal: VerifiedProposal | null;
}>;
export function classify(
  p: VerifiedProposal,
  rawProfile: unknown,
): ClassifiedAssessment {
  const parsed = classificationProfileSchema.safeParse(rawProfile);
  if (!parsed.success) throw Error('invalid_assessment_profile');
  const profile = parsed.data;
  const done = (
    outcome: AssessmentOutcome,
    reasonCode: AssessmentReason,
    matchedReferenceId: string | null = null,
  ): ClassifiedAssessment =>
    Object.freeze({ outcome, reasonCode, matchedReferenceId, proposal: p });
  let top: VerifiedProposal['matches'][number] | undefined, second: typeof top;
  for (const m of p.matches) {
    if (!top || m.confidence > top.confidence) {
      second = top;
      top = m;
    } else if (!second || m.confidence > second.confidence) second = m;
  }
  if (p.interpretation === 'incomplete' || p.interpretation === 'conflicting')
    return done('ambiguous', 'clarification_needed');
  const evidenceIds = new Set(
    [
      ...p.findings,
      ...p.matches,
      ...[p.candidateComplexity.time, p.candidateComplexity.space].filter(
        (v) => v !== null,
      ),
    ].flatMap((v) => v.evidenceRefs.map((r) => r.turnId)),
  );
  if (
    p.interpretation === 'uninterpretable' ||
    evidenceIds.size < profile.minEvidenceRefs
  )
    return done('abstained', 'insufficient_evidence');
  if (!top) return done('novel', 'unmatched_understood');
  const runner = second?.confidence ?? 0;
  if (second && top.confidence === runner)
    return done('ambiguous', 'tied_matches');
  if (top.confidence < profile.tau) return done('abstained', 'low_confidence');
  if (top.confidence - runner < profile.delta)
    return done('ambiguous', 'insufficient_margin');
  if (top.confidence <= runner) return done('abstained', 'no_positive_match');
  if (
    p.findings.some((f) => f.kind === 'contradiction') ||
    new Set(top.evidenceRefs.map((r) => r.turnId)).size <
      profile.minEvidenceRefs
  )
    return done('ambiguous', 'unresolved_reasoning');
  return done('matched', 'matched_reference', top.referenceId);
}
export function unqualifiedAssessment(): ClassifiedAssessment {
  return Object.freeze({
    outcome: 'abstained',
    matchedReferenceId: null,
    reasonCode: 'unqualified_policy',
    proposal: null,
  });
}
export function projectAssessment(
  result: ClassifiedAssessment,
): Readonly<{ text: string }> {
  const text =
    result.outcome === 'ambiguous'
      ? 'Please explain the key steps and assumptions of your approach.'
      : result.outcome === 'abstained'
        ? 'Please describe your reasoning and the steps you would take.'
        : 'Thank you for explaining your approach.';
  return Object.freeze({ text });
}
