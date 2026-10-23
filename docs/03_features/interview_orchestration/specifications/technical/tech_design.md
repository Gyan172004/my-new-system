# Interview Orchestration and Conversation — Technical Design

**Status:** Proposed design for K-018 (2026-10-24). Reconciles with the existing
cross-cutting [LLM interaction policy](llm_interaction_policy.md); that document
remains the policy contract, this one is this feature's implementation shape.

## 1. Boundary and implementation shape

Use the existing TypeScript/Next.js Node backend (ADR-021). Place the
orchestrator under `src/modules/interview-orchestration/`, with cross-module
access through `public.ts`. The orchestrator calls the Model Gateway's
`public.ts` only — never a provider adapter or raw HTTP directly — and calls
the session module's existing guarded-commit path (owned by K-014/K-016,
currently Backlog — see `eng_design.md` §1) to persist any accepted
transition. It owns no database table of its own in Stage 5: all durable
state remains the session snapshot/event store (ADR-004, ADR-005).

One narrow exception to "never touch gateway internals": the Model Gateway's
own Stage 4 implementation hardwires its operation dispatch to the single
literal `gateway_probe` (confirmed by reading `src/modules/model-gateway/
application/{types,operations,invoke}.ts`), deliberately deferring "enabling"
any second operation to the consuming feature (model_gateway requirements
§1). This feature's `IO-00` task (`eng_design.md` §1/§4) therefore generalizes
the gateway's operation-identity/schema-selection switch — and only that
switch, never its transport/adapter/retry/budget layers — before `interview_turn`
can be registered and dispatched at all.

```text
Candidate action -> session module (ownership/version/action-eligibility check)
                 -> orchestrator.proposeTurn(stageContext)
                      -> prompt assembly (allowlisted fields only)
                      -> Model Gateway public.ts: invoke("interview_turn", ...)
                      -> output validation against schema + pinned pack IDs
                      -> policy check against state machine + hint/content rules
                 -> orchestrator returns { accepted: TurnProposal } | { fallback: FallbackTurn }
                 -> session module computes next currentStage, commits atomically
```

No new HTTP route or event producer/consumer is introduced. The orchestrator is
a synchronous library call from the existing candidate-action handler, not a
new API surface.

## 2. Internal interface

```typescript
declare function proposeTurn(request: {
  requestId: string; // existing request correlation, forwarded to the gateway
  sessionId: string;
  turnId: string; // identifies this candidate turn; scopes operationId below
  expectedSessionVersion: number;
  currentStage: InterviewStage; // from the session state machine enum
  packVersion: string;
  policyVersion: string;
  allowedHintIndex: number; // next unexposed hint index per pack policy
  allowedReferenceApproachIds: readonly string[]; // from the pinned pack
  recentTurns: readonly CandidateVisibleTurn[]; // bounded window, already redacted
  candidateInput: UntrustedText; // delimited, labeled untrusted
  signal: AbortSignal;
}): Promise<
  | { kind: "proposal"; proposal: TurnProposal; callMetadata: GatewayCallMetadata }
  | { kind: "fallback"; reason: FallbackReason; callMetadata: GatewayCallMetadata | null }
>;
```

`TurnProposal` is a discriminated, fully validated structure containing the
interviewer's candidate-visible response text, an optional
`suggestedTransitionSignal` (`ready_to_advance | needs_clarification | none`),
and an optional `matchedReferenceApproachId` when the current stage permits
approach discussion. A model that cannot confidently match a reference
approach simply omits `matchedReferenceApproachId`; the orchestrator must
accept this as a normal proposal (abstention), never force the nearest
reference match (mirrors policy §5). `proposeTurn` never returns a raw
gateway payload; every field is validated before it leaves this function.
`FallbackReason` is one of `gateway_timeout | gateway_invalid_output |
gateway_refused | policy_rejected | gateway_unavailable`; a gateway failure
coded `output_limit` is reported under `gateway_invalid_output`.

Each gateway call's `operationId` is derived from `turnId` and the attempt
number (`"interview_turn:" + turnId + ":" + attempt`), so it is unique per
candidate turn and distinct between the original attempt and the FR-008
repair attempt — it must never be derived from `sessionId` alone, which would
collide across every turn in the same session.

Per the owner's 2026-10-24 decision, `interview_turn`'s registration against
the Model Gateway's operation declaration requirements (feature requirements
§2) reuses the gateway's own `gateway_probe` defaults (gateway tech design
§4): a 15-second total deadline, at most 6 seconds per attempt (clipped to
remaining total time), and a 1,024-token completion budget, including
reasoning tokens where the provider counts them. `IO-01` registers these
values; they are not placeholders pending further tuning.

The caller (session module) is the only writer of `currentStage`. It consults
`proposal.suggestedTransitionSignal` plus the state machine's transition table
(`session_state_machine.md` §4) to decide the actual next stage; it never
copies a model-proposed stage name.

## 3. Prompt assembly and templates

Per the owner's 2026-10-24 decision, prompt templates are plain, immutable,
versioned TypeScript modules under
`src/modules/interview-orchestration/prompts/`, one per stage family (e.g.
`intro.ts`, `initialApproach.ts`, `hints.ts`). No templating dependency is
introduced. Each module exports a pure function
`(context: AllowlistedContext) => { version: string; render(): PromptParts }`;
`version` is an immutable string recorded in gateway call metadata and never
logged with its body, consistent with the Model Gateway's own prompt-version
rule (gateway tech design §3).

`AllowlistedContext` is a stage-specific type listing exactly the fields that
stage's prompt may read (candidate-visible pack fields, bounded recent-turn
window, session-scoped evidence already collected). Building the context is a
pure projection from the session read model; it must not accept or forward a
whole session or Problem Pack record (mirrors the gateway's own input rule).

Candidate-origin fields are wrapped in an `UntrustedText` nominal type before
being interpolated; the renderer encloses them in a fixed delimiter and a
fixed instruction that content inside the delimiter is data, not instruction
(policy §7). The policy layer does not trust prompt wording as the security
boundary — see §4 below for the actual enforcement point.

## 4. Policy layer (actual enforcement, not prompt wording)

After the gateway returns a validated-schema result, the policy layer applies,
in order:

1. **Stage applicability** — reject if the operation's declared output fields
   are not applicable to `currentStage` (e.g., a hint-related field returned
   outside the `hints` stage).
2. **Reference-ID containment** — reject if `matchedReferenceApproachId` is not
   in `allowedReferenceApproachIds` for the pinned pack version.
3. **Hint-ladder containment** — reject if any hint content/index implied by
   the response exceeds `allowedHintIndex`.
4. **Content-exposure scan** — reject if the response contains a pack-marked
   private/hidden field value (hidden test text, expected hidden output,
   reviewer notes) by comparing against the pinned pack's private-field set,
   not by pattern-matching free text.
5. **Transition authority** — the response's `suggestedTransitionSignal` is
   read as one input to the state-machine transition decision; it can never
   substitute for the transition table's guard conditions.

A rejection at any step produces `{ kind: "fallback", reason: "policy_rejected" }`
with no partial acceptance. Rejections are recorded (FR-010) with the specific
step that failed, for regression-fixture traceability.

## 5. Deterministic fallback

Each stage declares exactly one canonical fallback turn (a static,
candidate-visible string plus an allowed `continue`/`request_clarification`
action), authored alongside its prompt module. Fallback selection does not
call the gateway again beyond the one bounded repair attempt (FR-008). Fallback
never advances `currentStage`; the session module treats a fallback result
identically to "no proposal available this turn" and leaves state unchanged
except for recording the attempt event.

## 6. Deferred: stage/intent classification contracts

`stage_classification` and `intent_classification` (model `gpt-6-luna`, per
ADR-012) are designed here so later work needs no new requirements/technical
review, but their implementation is a deferred task group (§4 of the
engineering design, task `IO-07`) per the owner's 2026-10-24 scoping decision.

- **Purpose:** a lightweight, lower-latency classification pass that can
  (advisory only) flag probable candidate intent (e.g., "requesting a hint",
  "asking to skip", "reporting confusion") to help the orchestrator choose
  between `continue` and a clarification branch, without replacing the
  deterministic transition table.
- **Input allowlist:** the single latest candidate utterance and the current
  `currentStage` name only — no recent-turn window, no pack content.
- **Output schema:** `{ schemaVersion: 1, intent: IntentLabel, confidence: number }`
  where `IntentLabel` is a closed enum reviewed per stage.
- **Policy role:** its output is merged into `proposeTurn`'s decision only as
  an additional advisory signal alongside `suggestedTransitionSignal`; it never
  gains direct write access to session state and is subject to the same
  reference/content containment rules as the main turn operation.
- **Activation:** disabled in the Model Gateway's operation registry until its
  own task group implements and evaluates it (consistent with Model Gateway
  requirements §1: "Register their operation names now; enable them only when
  their schemas, context rules and evaluations are defined").

## 7. Consumers, lifecycle, and contract impact

Stage 5 adds no OpenAPI route or event schema. It changes how the existing
candidate-action handler computes its `currentStage`/`actionType`/`result`
event fields, not their shape. Stage 6 (K-019) and the feedback feature (K-023)
call this feature's exported policy primitives (reference-ID containment,
hint-ladder containment) through `public.ts` rather than reimplementing them.

The orchestrator never holds a database transaction open across a gateway call
(mirrors the gateway's own consumer-integration rule, gateway pseudocode §4):
the session module performs its guarded version-checked commit only after
`proposeTurn` resolves.
