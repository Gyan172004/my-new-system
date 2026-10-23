// Cross-module boundary for the interview orchestrator. Consumers import
// only from here, never from application/ or prompts/ directly.

export {
  buildAllowlistedContext,
  wrapUntrusted,
  renderUntrustedBlock,
  PROMPT_BEARING_STAGES,
  STAGE_FIELD_ALLOWLIST,
  RECENT_TURN_WINDOW,
  CANDIDATE_VISIBLE_FIELD_COUNT,
  UNTRUSTED_DELIMITER,
} from './application/allowlisted-context';
export type {
  AllowlistedContext,
  BuildAllowlistedContextArgs,
  CandidateVisibleTurn,
  InterviewStage,
  PromptBearingStage,
  PromptModule,
  PromptParts,
  UntrustedText,
} from './application/allowlisted-context';

import type {
  AllowlistedContext,
  PromptBearingStage,
  PromptModule,
} from './application/allowlisted-context';

import renderIntroPrompt from './prompts/intro';
import renderExperienceContextPrompt from './prompts/experienceContext';
import renderProblemReadAndClarifyPrompt from './prompts/problemReadAndClarify';
import renderProblemRestatementPrompt from './prompts/problemRestatement';
import renderSampleTracePrompt from './prompts/sampleTrace';
import renderInitialApproachPrompt from './prompts/initialApproach';
import renderApproachClarificationPrompt from './prompts/approachClarification';
import renderHintsPrompt from './prompts/hints';
import renderCodePrompt from './prompts/code';
import renderTestAndDebugPrompt from './prompts/testAndDebug';
import renderImproveApproachPrompt from './prompts/improveApproach';
import renderVariantsAndFollowupsPrompt from './prompts/variantsAndFollowups';
import renderComplexityAnalysisPrompt from './prompts/complexityAnalysis';
import renderFeedbackPrompt from './prompts/feedback';

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
