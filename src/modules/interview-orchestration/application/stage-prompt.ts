// The per-stage prompt lookup table. Lives here (rather than directly in
// public.ts) so application/propose-turn.ts (Group 05/IO-04) can import it
// without creating a public.ts <-> application/ circular import: public.ts
// re-exports this constant unchanged for existing consumers.

import type {
  AllowlistedContext,
  PromptBearingStage,
  PromptModule,
} from './allowlisted-context';

import renderIntroPrompt from '../prompts/intro';
import renderExperienceContextPrompt from '../prompts/experienceContext';
import renderProblemReadAndClarifyPrompt from '../prompts/problemReadAndClarify';
import renderProblemRestatementPrompt from '../prompts/problemRestatement';
import renderSampleTracePrompt from '../prompts/sampleTrace';
import renderInitialApproachPrompt from '../prompts/initialApproach';
import renderApproachClarificationPrompt from '../prompts/approachClarification';
import renderHintsPrompt from '../prompts/hints';
import renderCodePrompt from '../prompts/code';
import renderTestAndDebugPrompt from '../prompts/testAndDebug';
import renderImproveApproachPrompt from '../prompts/improveApproach';
import renderVariantsAndFollowupsPrompt from '../prompts/variantsAndFollowups';
import renderComplexityAnalysisPrompt from '../prompts/complexityAnalysis';
import renderFeedbackPrompt from '../prompts/feedback';

/** Maps each of the 14 prompt-bearing stages to its prompt module's render function. */
export const STAGE_PROMPT: Readonly<
  Record<PromptBearingStage, (context: AllowlistedContext) => PromptModule>
> = Object.freeze({
  intro: renderIntroPrompt,
  experience_context: renderExperienceContextPrompt,
  problem_read_and_clarify: renderProblemReadAndClarifyPrompt,
  problem_restatement: renderProblemRestatementPrompt,
  sample_trace: renderSampleTracePrompt,
  initial_approach: renderInitialApproachPrompt,
  approach_clarification: renderApproachClarificationPrompt,
  hints: renderHintsPrompt,
  code: renderCodePrompt,
  test_and_debug: renderTestAndDebugPrompt,
  improve_approach: renderImproveApproachPrompt,
  variants_and_followups: renderVariantsAndFollowupsPrompt,
  complexity_analysis: renderComplexityAnalysisPrompt,
  feedback: renderFeedbackPrompt,
});
