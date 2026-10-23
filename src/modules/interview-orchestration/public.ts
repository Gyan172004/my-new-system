// Cross-module boundary for the interview orchestrator. Consumers import
// only from here, never from application/ or prompts/ directly.

export {
  buildAllowlistedContext,
  isPromptBearingStage,
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

export { applyPolicy } from './application/policy';
export type {
  ApplyPolicyContext,
  ApplyPolicyPack,
  ApplyPolicyRequest,
  PolicyDecision,
  PolicyFailedStep,
  TurnProposal,
  ValidatedInterviewTurnOutput,
} from './application/policy';

export { FALLBACK_TURN, selectFallback } from './application/fallback';
export type { FallbackTurn } from './application/fallback';

export { STAGE_PROMPT } from './application/stage-prompt';

export { proposeTurn } from './application/propose-turn';
export type {
  FallbackReason,
  GatewayCallMetadata,
  ProposeTurnRequest,
  ProposeTurnResult,
  TelemetryRecord,
} from './application/propose-turn';
