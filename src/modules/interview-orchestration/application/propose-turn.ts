// proposeTurn: the glue that wires prompt assembly (Group 03) -> the Model
// Gateway's interview_turn operation -> the policy layer (Group 04) into the
// { proposal | fallback } result (tech_design.md §2, logic_and_state.md §2).
// This is the only module in this feature that calls the gateway or performs
// I/O; it takes an already-constructed `gateway` as a parameter and never
// constructs or configures one itself (runtime composition is out of scope
// here).

import {
  buildAllowlistedContext,
  type CandidateVisibleTurn,
  type InterviewStage,
} from './allowlisted-context';
import { STAGE_PROMPT } from './stage-prompt';
import {
  applyPolicy,
  type PolicyFailedStep,
  type TurnProposal,
} from './policy';
import type {
  GatewayErrorCode,
  GatewayMetadata,
  ModelGateway,
} from '../../model-gateway/public';

/** Alias matching tech_design.md §2's `GatewayCallMetadata` naming. */
export type GatewayCallMetadata = GatewayMetadata;

/**
 * tech_design.md §2's `FallbackReason` enum. A gateway failure coded
 * `output_limit` is reported under `gateway_invalid_output`, per that
 * section's explicit note.
 */
export type FallbackReason =
  | 'gateway_timeout'
  | 'gateway_invalid_output'
  | 'gateway_refused'
  | 'policy_rejected'
  | 'gateway_unavailable';

/**
 * Codes the Model Gateway's own error table explicitly leaves to "the
 * documented recovery path" of the caller (gateway tech design §4) — these,
 * and only these, earn exactly one bounded repair attempt (FR-008,
 * logic_and_state.md §2). Any other failure code goes straight to fallback
 * with no repair attempt.
 */
const REPAIRABLE_GATEWAY_CODES: ReadonlySet<GatewayErrorCode> = new Set([
  'invalid_output',
  'refused',
  'output_limit',
]);

function mapGatewayFailure(code: GatewayErrorCode): FallbackReason {
  switch (code) {
    case 'output_limit':
    case 'invalid_output':
      return 'gateway_invalid_output';
    case 'refused':
      return 'gateway_refused';
    case 'timeout':
      return 'gateway_timeout';
    default:
      return 'gateway_unavailable';
  }
}

/**
 * FR-010 allowlisted telemetry record. Deliberately identifiers/enums/
 * metadata ONLY: no `responseText`, no raw `candidateInput`, nothing from
 * the gateway's output payload beyond what `GatewayCallMetadata` already
 * exposes (operation/provider/model/prompt/schema versions, correlation
 * IDs). `failedStep` is present only when `outcome` is `'policy_rejected'`
 * — this is the Group 05 follow-up's resolution: `applyPolicy`'s rejected
 * `failedStep` previously had no path out of `proposeTurn`; this is that
 * path, as an additive telemetry side-channel rather than a
 * `ProposeTurnResult` shape change (tech_design.md §2's result type is
 * left untouched).
 */
export interface TelemetryRecord {
  readonly sessionId: string;
  readonly turnId: string;
  readonly currentStage: InterviewStage;
  readonly outcome: 'proposal' | FallbackReason;
  readonly failedStep?: PolicyFailedStep;
  readonly callMetadata: GatewayCallMetadata | null;
}

export interface ProposeTurnRequest {
  /** Existing request correlation, forwarded to the gateway. */
  readonly requestId: string;
  readonly sessionId: string;
  /** Identifies this candidate turn; scopes operationId below (FR-002/FR-008). */
  readonly turnId: string;
  readonly expectedSessionVersion: number;
  readonly currentStage: InterviewStage;
  readonly packVersion: string;
  readonly policyVersion: string;
  /** Next unexposed hint index per pack policy. */
  readonly allowedHintIndex: number;
  /** From the pinned pack. */
  readonly allowedReferenceApproachIds: readonly string[];
  /** Bounded window, already redacted; shape Group 03's buildAllowlistedContext expects. */
  readonly recentTurns: readonly CandidateVisibleTurn[];
  /** Raw candidate text; proposeTurn wraps it via buildAllowlistedContext internally. */
  readonly candidateInput: string;
  readonly pack: {
    readonly fields: Readonly<Record<string, string>>;
    readonly privateFields: readonly string[];
  };
  readonly signal: AbortSignal;
  /** Caller-constructed gateway instance; proposeTurn never constructs its own. */
  readonly gateway: ModelGateway;
  /**
   * Optional FR-010 telemetry side-channel (IO-05). When supplied, invoked
   * exactly once per `proposeTurn` call with a `TelemetryRecord` — additive
   * only: omitting it changes no existing behavior (Group 05's 9 contract
   * tests pass unchanged).
   */
  readonly onCallRecorded?: (record: TelemetryRecord) => void;
}

export type ProposeTurnResult =
  | {
      readonly kind: 'proposal';
      readonly proposal: TurnProposal;
      readonly callMetadata: GatewayCallMetadata;
    }
  | {
      readonly kind: 'fallback';
      readonly reason: FallbackReason;
      readonly callMetadata: GatewayCallMetadata | null;
    };

/**
 * Implements logic_and_state.md §2 exactly: build context, render the
 * stage's prompt, call the gateway (with at most one bounded repair attempt
 * on a repairable failure code), then apply the policy layer to a
 * successful gateway result.
 */
export async function proposeTurn(
  request: ProposeTurnRequest,
): Promise<ProposeTurnResult> {
  const context = buildAllowlistedContext({
    currentStage: request.currentStage,
    recentTurns: request.recentTurns,
    packFields: request.pack.fields,
    candidateInput: request.candidateInput,
  });

  const prompt = STAGE_PROMPT[context.stage](context);

  async function dispatch(attempt: number) {
    // operationId differs per attempt: each repair attempt is its own
    // logical gateway call (FR-008), never a hidden retry of the same call,
    // and is never derived from sessionId alone (tech_design.md §2).
    const operationId = `interview_turn:${request.turnId}:${attempt}`;
    return request.gateway.invoke({
      operation: 'interview_turn',
      input: prompt.render(),
      context: {
        requestId: request.requestId,
        operationId,
        sessionId: request.sessionId,
        expectedSessionVersion: request.expectedSessionVersion,
        packVersion: request.packVersion,
        policyVersion: request.policyVersion,
      },
      signal: request.signal,
    });
  }

  let attempt = 1;
  // Sequential by design: the repair attempt must only happen after the
  // first attempt's result is known.
  let result = await dispatch(attempt);

  while (
    !result.ok &&
    REPAIRABLE_GATEWAY_CODES.has(result.code) &&
    attempt === 1
  ) {
    attempt += 1;
    // Discard the prior failed result entirely; no field merging across attempts.
    result = await dispatch(attempt);
  }

  if (!result.ok) {
    const reason = mapGatewayFailure(result.code);
    request.onCallRecorded?.({
      sessionId: request.sessionId,
      turnId: request.turnId,
      currentStage: request.currentStage,
      outcome: reason,
      callMetadata: result.metadata,
    });
    return {
      kind: 'fallback',
      reason,
      callMetadata: result.metadata,
    };
  }

  // Gateway success already guarantees schema-valid data; this layer never
  // re-validates it (logic_and_state.md §2).
  const decision = applyPolicy(
    result.data,
    { stage: context.stage },
    {
      allowedHintIndex: request.allowedHintIndex,
      allowedReferenceApproachIds: request.allowedReferenceApproachIds,
      pack: { privateFields: request.pack.privateFields },
    },
  );

  if (decision.kind === 'rejected') {
    request.onCallRecorded?.({
      sessionId: request.sessionId,
      turnId: request.turnId,
      currentStage: request.currentStage,
      outcome: 'policy_rejected',
      failedStep: decision.failedStep,
      callMetadata: result.metadata,
    });
    return {
      kind: 'fallback',
      reason: 'policy_rejected',
      callMetadata: result.metadata,
    };
  }

  request.onCallRecorded?.({
    sessionId: request.sessionId,
    turnId: request.turnId,
    currentStage: request.currentStage,
    outcome: 'proposal',
    callMetadata: result.metadata,
  });

  return {
    kind: 'proposal',
    proposal: decision.proposal,
    callMetadata: result.metadata,
  };
}
