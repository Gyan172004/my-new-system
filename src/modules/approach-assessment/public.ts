export { validateProposal, evidenceContextSchema } from './domain/proposal';
export type {
  EvidenceContext,
  AssessmentProposal,
  VerifiedProposal,
} from './domain/proposal';
export {
  classify,
  projectAssessment,
  unqualifiedAssessment,
  classificationProfileSchema,
} from './domain/classify';
export type {
  ClassificationProfile,
  ClassifiedAssessment,
  AssessmentOutcome,
  AssessmentReason,
} from './domain/classify';
export { createFixtureEvaluator } from './application/evaluate';
