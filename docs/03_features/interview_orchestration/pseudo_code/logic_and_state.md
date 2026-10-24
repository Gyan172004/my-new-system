# Interview Orchestration and Conversation — Logic and State

**Status:** Proposed algorithms for K-018 planning (2026-10-24); implementation
acceptance remains separate. Limits and stage names come from the
[session state machine](../../interview_session/specifications/technical/session_state_machine.md)
and the [technical design](../specifications/technical/tech_design.md).

## 1. Build allowlisted context for the current stage

```text
buildAllowlistedContext(session, pack, candidateInput):
    stage = session.currentStage
    allowlist = STAGE_FIELD_ALLOWLIST[stage]
    # allowlist is a fixed, reviewed set per stage; never "all pack fields"
    visibleFields = project(pack, onto=allowlist.packFields)
    # visibleFields never includes a field marked private/hidden on the pack
    recentTurns = lastK(session.turns, K=STAGE_WINDOW[stage])
    recentTurns = redactAlreadyRedactedFields(recentTurns)
    candidate = wrapUntrusted(candidateInput)
    # wrapUntrusted delimits text and labels it data, not instruction
    return AllowlistedContext{ stage, visibleFields, recentTurns, candidate }
```

## 2. Propose a turn

```text
# Codes that the Model Gateway's own error table explicitly leaves to "the
# documented recovery path" of the caller (gateway tech design §4). Any other
# failure code (timeout, refused-provider-unavailable, cancelled, ...) goes
# straight to fallback below with no repair attempt.
REPAIRABLE_GATEWAY_CODES = { "invalid_output", "refused", "output_limit" }

proposeTurn(request):
    context = buildAllowlistedContext(request.session, request.pack, request.candidateInput)
    prompt = STAGE_PROMPT[context.stage].render(context)
    # prompt.version is recorded; prompt body is never logged

    attempt = 1
    result = none
    while attempt <= 2:
        # operationId differs per attempt: each repair attempt is its own
        # logical gateway call (FR-008), never a hidden retry of the same call.
        operationId = "interview_turn:" + request.turnId + ":" + attempt
        result = ModelGateway.invoke("interview_turn", {
            input: prompt.payload,
            context: {
                requestId: request.requestId,
                operationId: operationId,
                sessionId: request.sessionId,
                expectedSessionVersion: request.expectedSessionVersion,
                packVersion: request.packVersion,
                policyVersion: request.policyVersion,
            },
            signal: request.signal,
        })

        if result is success:
            break  # gateway already guarantees schema-valid data on success;
                   # this layer never re-validates it
        if result.code in REPAIRABLE_GATEWAY_CODES and attempt == 1:
            attempt += 1
            continue  # discard this failed result entirely; no field merging
        return { kind: "fallback", reason: mapGatewayFailure(result.code), callMetadata: result.metadata }

    decision = applyPolicy(result.data, context, request)
    if decision is rejected:
        recordRejection(request.sessionId, decision.failedStep)
        return { kind: "fallback", reason: "policy_rejected", callMetadata: result.metadata }

    return { kind: "proposal", proposal: decision.proposal, callMetadata: result.metadata }
```

## 3. Policy layer (enforcement order matters — earlier checks short-circuit)

```text
applyPolicy(validated, context, request):
    if not stageApplicable(validated, context.stage):
        return rejected("stage_applicability")

    if validated.matchedReferenceApproachId is set:
        if validated.matchedReferenceApproachId not in request.allowedReferenceApproachIds:
            return rejected("reference_id_containment")
    # else: the model abstained from matching a reference approach; this is a
    # normal outcome (policy §5), not a rejection — proceed with no forced match

    if impliedHintIndex(validated) > request.allowedHintIndex:
        return rejected("hint_ladder_containment")

    if containsPrivateFieldValue(validated.responseText, request.pack.privateFields):
        return rejected("content_exposure")

    proposal = TurnProposal{
        responseText: validated.responseText,
        suggestedTransitionSignal: validated.suggestedTransitionSignal ?? "none",
        matchedReferenceApproachId: validated.matchedReferenceApproachId,
    }
    return accepted(proposal)
```

`containsPrivateFieldValue` compares against the pinned pack's bounded private-
field value set (hidden test text, expected hidden output, reviewer notes) —
it is a containment check against known restricted values, not a heuristic
free-text classifier, matching the LLM interaction policy's instruction that
prompt wording is not the security boundary.

## 4. Caller integration — the only writer of `currentStage`

```text
handleCandidateTurn(command):
    # Implemented by the session module (K-014/K-016); shown here to make the
    # boundary explicit, matching the gateway pseudocode's own §4 placeholder.
    authenticate and authorize session ownership
    resolve idempotent replay before checking new-command version
    validate current stage/action against the state machine's transition table

    result = proposeTurn({ session, pack, candidateInput, turnId: command.turnId, ... })

    if result.kind == "fallback":
        nextStage = session.currentStage  # unchanged
        turnOutcome = result.reason        # recorded as gateway/policy outcome, not candidate evidence
    else:
        guard = TRANSITION_TABLE[session.currentStage]
        nextStage = guard.resolve(result.proposal.suggestedTransitionSignal, session.evidence)
        # guard.resolve applies the deterministic transition table (state machine §4);
        # suggestedTransitionSignal is one input, never a direct assignment
        turnOutcome = "accepted"

    recheck owner/status/expectedSessionVersion in guarded commit
    if stale: discard result; do not overwrite newer session
    atomically persist turn, new snapshot (if nextStage changed), event, idempotency result
```

## 5. Deferred: stage/intent classification (designed, not scheduled for Stage 5)

```text
classifyIntent(utterance, currentStage):
    # Disabled in the gateway registry until its own task group (IO-07) runs.
    result = ModelGateway.invoke("intent_classification", {
        input: { utterance: wrapUntrusted(utterance), stage: currentStage },
        context: { ... },
    })
    if result is failure or validated.confidence < STAGE_CLASSIFICATION_THRESHOLD[currentStage]:
        return { intent: "unknown" }
    return { intent: validated.intent, confidence: validated.confidence }
    # Output feeds proposeTurn's decision as an additional advisory signal only;
    # it is still subject to §3's containment/exposure checks before use.
```

## 6. State invariants

- Orchestration call state is transient per turn: `assembling -> dispatched ->
  validating -> policy-checking -> proposal|fallback`. No orchestration state is
  itself an interview stage.
- `currentStage` is written exactly once per accepted command, by the session
  module's guarded commit, never by this feature directly and never by copying
  a model-proposed field.
- A fallback result never advances `currentStage` and never counts as candidate
  evidence or a scored outcome.
- No private pack field value (hidden test, expected hidden output, reviewer
  note) is ever included in a `TurnProposal.responseText`; the content-exposure
  check runs on every accepted path, with no bypass for high-confidence output.
- A stale `proposeTurn` result (superseded by a newer committed session version)
  is discarded by the caller's guarded commit, mirroring the gateway's own
  stale-result rule.
