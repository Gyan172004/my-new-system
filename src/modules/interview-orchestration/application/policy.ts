// Policy layer: actual enforcement, not prompt wording (tech_design.md §4 /
// logic_and_state.md §3). Pure, synchronous functions over already-resolved,
// already-gateway-schema-validated data — no gateway call, no I/O, no
// `proposeTurn` wiring here (that is Group 05/IO-04).

import type { OperationOutput } from '../../model-gateway/public';
import type { InterviewStage } from './allowlisted-context';

/**
 * The Model Gateway's registered, already-schema-validated `interview_turn`
 * output shape (src/modules/model-gateway/application/validation.ts's
 * `interviewTurnOutputSchema`). This layer never re-validates it against the
 * JSON Schema — that already happened at the gateway (logic_and_state.md §2:
 * "this layer never re-validates it") — it applies semantic/policy
 * containment checks on top of it.
 */
export type ValidatedInterviewTurnOutput = OperationOutput['interview_turn'];

/** The five ordered policy steps, named for traceability (FR-010/tech_design.md §4). */
export type PolicyFailedStep =
  | 'stage_applicability'
  | 'reference_id_containment'
  | 'hint_ladder_containment'
  | 'content_exposure'
  | 'transition_authority';

/** tech_design.md §2's `TurnProposal` shape. */
export interface TurnProposal {
  readonly responseText: string;
  readonly suggestedTransitionSignal:
    'ready_to_advance' | 'needs_clarification' | 'none';
  readonly matchedReferenceApproachId?: string;
}

export type PolicyDecision =
  | { readonly kind: 'accepted'; readonly proposal: TurnProposal }
  | { readonly kind: 'rejected'; readonly failedStep: PolicyFailedStep };

/** The subset of `AllowlistedContext` this layer actually needs. */
export interface ApplyPolicyContext {
  readonly stage: InterviewStage;
}

export interface ApplyPolicyPack {
  /**
   * Private/hidden field VALUES (not keys) from the pinned pack — hidden
   * test text, expected hidden output, reviewer notes (tech_design.md §4
   * step 4).
   */
  readonly privateFields: readonly string[];
}

/** Caller-supplied containment bounds (tech_design.md §2's `proposeTurn` request fields). */
export interface ApplyPolicyRequest {
  readonly allowedReferenceApproachIds: readonly string[];
  readonly allowedHintIndex: number;
  readonly pack: ApplyPolicyPack;
}

/**
 * The approach-discussion stages: the only stages where a model may
 * legitimately report `matchedReferenceApproachId` at all. Picked per
 * `session_state_machine.md`'s stage descriptions — `initial_approach` and
 * `approach_clarification` are explicitly about discussing an approach, and
 * `improve_approach` revisits/refines one; every other prompt-bearing stage
 * (intro, hints, code, feedback, ...) has no notion of "the matched
 * reference approach" at all, so the field is only meaningful here.
 */
const REFERENCE_APPROACH_STAGES: ReadonlySet<InterviewStage> = new Set([
  'initial_approach',
  'approach_clarification',
  'improve_approach',
]);

/**
 * Hint-ladder containment (tech_design.md §4 step 3 / FR-005).
 *
 * The registered `interviewTurnOutputSchema` (model-gateway/application/
 * validation.ts) has no hint-index or hint-content field today: the only
 * fields are `responseText`, `suggestedTransitionSignal`, and
 * `matchedReferenceApproachId`. Full hint-ladder containment — rejecting a
 * response that reveals or implies a hint beyond `allowedHintIndex` —
 * requires a hint-specific response field that doesn't exist yet; that is
 * explicitly Stage 6/K-019's scope (tech_design.md's own boundary), and
 * inventing a free-text heuristic over `responseText` here would be exactly
 * the kind of pattern-matching enforcement `tech_design.md` §4 step 4
 * rejects for content-exposure — so we do not fake it.
 *
 * What this function does honestly: it is the single place that reads the
 * implied hint index from `validated` (today always 0, since nothing in the
 * current schema can imply a hint was shown) so `request.allowedHintIndex`
 * is genuinely threaded into and compared at this checkpoint, in the
 * correct position in the ordered pipeline, rather than being dead wiring.
 * When K-019 adds a real hint-index/content field, only this function needs
 * a real comparison added — no caller changes required.
 */
function impliedHintIndex(validated: ValidatedInterviewTurnOutput): number {
  // `validated` is intentionally unused today: no field in the current
  // schema can imply a hint index yet (see the doc comment above). Keeping
  // the parameter (rather than dropping it) preserves the real call
  // signature so K-019 can add a genuine comparison here without touching
  // any caller.
  void validated;
  return 0;
}

function hintLadderContainmentPasses(
  validated: ValidatedInterviewTurnOutput,
  request: Pick<ApplyPolicyRequest, 'allowedHintIndex'>,
): boolean {
  return impliedHintIndex(validated) <= request.allowedHintIndex;
}

/**
 * Exact substring containment against the pinned pack's private-field VALUE
 * set — never a heuristic/pattern-matching classifier over free text
 * (tech_design.md §4 step 4 / logic_and_state.md §3's
 * `containsPrivateFieldValue`).
 */
function containsPrivateFieldValue(
  responseText: string,
  privateFields: readonly string[],
): boolean {
  return privateFields.some(
    (value) => value.length > 0 && responseText.includes(value),
  );
}

/**
 * Applies the five ordered policy steps to an already-gateway-schema-valid
 * `interview_turn` output, short-circuiting on the first rejection
 * (logic_and_state.md §3). Pure and synchronous: no gateway call, no
 * session-module reach-in.
 */
export function applyPolicy(
  validated: ValidatedInterviewTurnOutput,
  context: ApplyPolicyContext,
  request: ApplyPolicyRequest,
): PolicyDecision {
  // 1. Stage applicability — reject fields only meaningful for a different
  // stage (tech_design.md §4 step 1). `matchedReferenceApproachId` is only
  // applicable inside the approach-discussion stages.
  if (
    validated.matchedReferenceApproachId !== undefined &&
    !REFERENCE_APPROACH_STAGES.has(context.stage)
  ) {
    return { kind: 'rejected', failedStep: 'stage_applicability' };
  }

  // 2. Reference-ID containment — reject an ID outside the pinned pack's
  // allowlist. An absent ID is abstention: a normal outcome, never forced or
  // penalized (tech_design.md §2, policy §5).
  if (
    validated.matchedReferenceApproachId !== undefined &&
    !request.allowedReferenceApproachIds.includes(
      validated.matchedReferenceApproachId,
    )
  ) {
    return { kind: 'rejected', failedStep: 'reference_id_containment' };
  }

  // 3. Hint-ladder containment (see impliedHintIndex's doc comment above).
  if (!hintLadderContainmentPasses(validated, request)) {
    return { kind: 'rejected', failedStep: 'hint_ladder_containment' };
  }

  // 4. Content-exposure scan.
  if (
    containsPrivateFieldValue(
      validated.responseText,
      request.pack.privateFields,
    )
  ) {
    return { kind: 'rejected', failedStep: 'content_exposure' };
  }

  // 5. Transition authority — no rejection happens here. This step is a
  // named pass-through for traceability consistency with tech_design.md §4's
  // 5-step enumeration: `suggestedTransitionSignal` is read by the CALLER
  // (the session module) as advisory input to the state machine's
  // transition table; it can never substitute for the table's guard
  // conditions, and this layer never writes `currentStage` itself
  // (logic_and_state.md §3/§4).

  return {
    kind: 'accepted',
    proposal: {
      responseText: validated.responseText,
      suggestedTransitionSignal: validated.suggestedTransitionSignal ?? 'none',
      ...(validated.matchedReferenceApproachId !== undefined
        ? { matchedReferenceApproachId: validated.matchedReferenceApproachId }
        : {}),
    },
  };
}
