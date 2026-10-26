# Stage 6 — Approach Assessment and Hint Management: Logic and State

**Date:** 2026-10-24. **Status:** Design pseudocode, not executable implementation.
**Scope:** K-019, Stage 6 / W8. Read
[requirements](../requirements/feature_req.md),
[technical design](../specifications/technical/tech_design.md), and
[engineering design](../specifications/engineering/eng_design.md).

## 1. State, types and invariants

```text
Session:
  ownerId, problemId, pinnedPackVersion, pinnedChecksum
  status, currentStage, version
  selectedLadderId?, routingRevisionHash?  # locked at first committed exposure
  hintCount >= 0                 # committed ordinals within selected ladder
  latestAssessmentId?           # private; public DTO does not expose it

AssessmentOutcome = matched | ambiguous | abstained | novel
OperationStatus = in_flight | retryable | committed | rejected

InternalDecision:
  assessment? XOR exposure?      # a Stage 6 assessment or hint-exposure command
  candidateTurn?                # command-bound reserved ID; committed atomically
  interviewerTurn               # deterministic safe template or canonical hint
  proposedPolicyAction          # internal guard input, not a model/client stage
  sourceVersion, contextHash, profileHash, fencingToken

Invariant I1: authenticated active owner required for every read/replay/mutation
Invariant I2: pin and checksum unchanged for the session lifetime
Invariant I3: matchId != null iff outcome == matched
Invariant I4: accepted command changes version v -> v+1 exactly once
Invariant I5: one command event at v+1; atomic snapshot/turn/evidence/replay writes
Invariant I6: hintCount == number of committed exposures for pinned selected ladder; lock never changes
Invariant I7: exposure ordinals are exactly 1..hintCount, with no duplicate/gap
Invariant I8: invalid/stale/provider-failed work commits no assessment or hint
Invariant I9: candidate output contains no private reference or unreleased hint
Invariant I10: no database transaction spans a provider/network wait
```

Operation bookkeeping/reservations can change without changing session version;
they are not successful domain actions. Use K-013's canonical operation lifecycle,
hashing and replay semantics; pseudocode status names describe behavior, not a
separate schema. A committed replay is immutable for its retention lifetime.

## 2. Admit or replay a command

```text
function admit(principal, request):
  activeOwner = identity.requireActiveInternalUser(principal)
  parsed = existingActionValidator.parse(request)     # headers and body bounded
  require quotedDecimalETag(parsed.ifMatch)
  commandHash = canonicalCommandHash(parsed)          # owning K-013 algorithm

  in short transaction scope:
    session = sessions.lockOwnedRowForUpdate(parsed.sessionId, activeOwner.id, scope)
    # universal lock order: session row, then operation row; reclaim/cancel also follow it
    op = commands.findForKeyForUpdate(activeOwner.id, session.id, parsed.key, scope)

    if op exists:
      if op.commandHash != commandHash: fail 409
      if op.status == committed:
        return replay(op.safeResponse, op.resultETag)  # before version/stage check
      if op.status == rejected:
        return owningCommandPolicy.originalRejection(op)
      if op.leaseValid:
        return JOIN_EXISTING_OPERATION(op.id)         # bounded wait after tx
      # expired/retryable work always uses immutable original inputs
      require session.version == op.originalSourceVersion else fail 412
      require session.stage/pin == op.originalSourceStage/pin else fail 409
      require permittedLifecycleAndAction(session, op.originalAction) else fail 409
      require admissionBudgetAvailable(activeOwner, op.originalRequest) else fail 429
      op = commands.reclaimLeaseOnly(op, incrementFence=true, scope)
      # preserve op ID/hash/payload/version/pin/evidence ID/context/profile hashes
      return WORK(op.immutableOriginalInputs, op.newToken)

    require session.version == parsed.ifMatchVersion else fail 412
    require permittedLifecycleAndAction(session, parsed.actionType) else fail 409
    validateActionPayloadAgainstOwningPolicy(parsed)
    require admissionBudgetAvailable(activeOwner, parsed) else fail 429

    if parsed.actionType == request_hint:
      require session.status == active and session.currentStage == hints else 409
      require parsed.payload == {} else 422
    else:
      require owningOrchestrator.enablesAssessment(session, parsed) else 409

    op = commands.claimNew(
      key=parsed.key, hash=commandHash,
      originalRequest=parsed.normalizedLogicalPayload,
      sourceVersion=session.version, sourceStage=session.currentStage,
      pin=session.pin, owner=activeOwner,
      newFencingToken, boundedLeaseExpiry,
      reservedCandidateTurnId=if candidate input then allocateId() else null,
      scope)
    # uniqueness races re-read and apply the same replay/hash rules
    return WORK(op.immutableToken, boundedOwnedSessionContext(session))
```

Ownership lookup precedes idempotency retrieval/disclosure. Active in-flight
duplicates wait/join only within the request deadline; timeout returns retryable
`503` without another provider call. A late completion is never accepted merely
because its provider request started first. Reclaiming an operation uses a strictly
new fencing token. Same key with a different body conflicts even if If-Match is
fresh; transport trace IDs do not redefine the logical payload.

## 3. Prepare an assessment outside a transaction

```text
function prepareAssessment(work, submittedReasoning):
  profile = gatewayProfiles.requireFiniteBudgets(work.operation)
  pinContext = catalogue.readPinnedAssessmentContext(work.trustedPin)
  evidence = conversation.selectBoundedCandidateEvidence(
    work.sessionId, work.sourceVersion,
    pending={id: work.reservedCandidateTurnId, text: submittedReasoning})
  validateEvidenceInputs(evidence, profile.limits)
  # no hidden tests, expected outputs, hints, full reference steps or review notes
  context = selectAllowlistedContext(pinContext, evidence, profile)
  if required context exceeds profile bounds:
    return operationFailure(context_limit)             # no silent semantic crop

  require pinContext.references is nonempty else dependencyFailure
  if not profile.labelsQualified:
    result = abstained(reason=unqualified_policy, matchId=null)
    # deterministic fallback only; no semantic quality claim
  else:
    proposal = gateway.execute(
      operation=approach_assessment, versionedProfile=profile,
      input=context, totalDeadline=work.deadline)
    # retries/repair are bounded inside the total deadline by owning profile
    if proposal failed: return operationFailure(provider_or_schema_reason)
    validated = validateProposal(proposal, context, evidence, profile)
    if validated failed: return operationFailure(invalid_or_unsafe_output)
    result = classify(validated, profile)

  policyAction = owningOrchestrator.proposeFromValidatedAssessment(
    work.sourceStage, result, existingClarificationCount, reviewedPolicy)
  # no direct next-stage assignment from proposal or confidence
  safeText = renderSafeAssessmentTemplate(result.reasonCode, policyAction)
  return InternalDecision(
    assessment=result.withVersionsAndVerifiedEvidence(),
    candidateTurn=work.reservedCandidateTurn,
    interviewerTurn=newTurn(safeText), proposedPolicyAction=policyAction,
    sourceVersion=work.sourceVersion,
    contextHash=hash(context or bounded deterministic fallback inputs),
    profileHash=profile.hash, fencingToken=work.token)
```

Fallback assessment still records candidate input and versions when committed;
it must not invent a semantic summary/findings. Invalid Gateway responses fail
the operation rather than becoming a valid low-confidence result. Persist the
candidate turn only on successful finalization. Retryable failures leave submitted
input available for same-key retry according to the existing command mechanism,
subject to bounded storage and the session retention policy.

### Nonmutating evaluation before label enablement

```text
function evaluateReviewedFixture(authorizedEvaluator, fixture, candidateProfile):
  actor = contentPublishing.requireActiveReviewer(authorizedEvaluator.authentication)
  require reviewedFixtureProvenance(fixture) and syntheticOrReviewerAuthored(fixture)
  require noProductionTranscriptOrSessionInput(fixture)
  requireFiniteBudgets(candidateProfile)
  context, evidence = validateBoundedFixtureAndPinnedContext(fixture)
  require context.references is nonempty else dependencyFailure
  proposal = gateway.execute(approach_assessment, candidateProfile, context)
  validated = validateProposal(proposal, context, evidence, candidateProfile)
  result = classify(validated, candidateProfile)
  return restrictedEvaluationRecord(result, fixture/profile/model fingerprints)
  # labelsQualified is not an invocation gate here; NO session/turn/exposure/
  # event/operation/replay writes and NO qualification state update
```

## 4. Validate model evidence and classify

```text
function validateProposal(raw, context, evidence, profile):
  p = strictBoundedSchema.parse(raw)                    # includes max array sizes
  require p.operation/schemaVersion == expected
  referenceIds = buildSet(context.suppliedReferenceIds)
  evidenceById = buildMap(evidence)                     # selected candidates only
  boundaries = indexCodePointBoundariesOnce(evidence)   # no repeated turn scans
  seen = emptySet()

  for candidate in p.matches:
    require candidate.referenceId in referenceIds
    require candidate.referenceId not in seen
    require finite(candidate.confidence) and 0 <= candidate.confidence <= 1
    seen.add(candidate.referenceId)

  for ref in allEvidenceReferences(p):
    source = evidenceById[ref.turnId]
    require source exists and source.speaker === 'candidate'
    require source.sessionId == context.sessionId
    require source.version <= context.sourceVersion OR
            source.id == context.operationReservedCandidateTurnId
    require source.stage/modality permitted by reviewed operation
    if ref has span:
      require 0 <= ref.start < ref.end <= source.codePointLength
      require exactExcerptAt(boundaries[source.id], ref.span) == ref.excerpt

  require every substantive finding/complexity claim has verified evidence
  require privateOutputBoundsAndClassificationValid(p)
  # free text remains private; validation cannot prove semantic truth by itself
  return p with verified evidence membership

function classify(p, profile):
  top = null; second = null
  for match in p.matches:                              # O(M), never sort
    updateTopTwoPreservingTies(top, second, match)

  if p.interpretation in {incomplete, conflicting}:
    return ambiguous(matchId=null, reason=clarification_needed, findings=p)
  if p.interpretation == uninterpretable OR insufficientVerifiedEvidence(p):
    return abstained(matchId=null, reason=insufficient_evidence, findings=p)
  if top == null:
    return novel(matchId=null, reason=unmatched_understood, findings=p)

  runnerScore = second.confidence if second != null else 0
  if top.confidence == runnerScore AND second != null:
    return ambiguous(matchId=null, reason=tied_matches, findings=p)
  if top.confidence < profile.tau:
    return abstained(matchId=null, reason=low_confidence, findings=p)
  if top.confidence - runnerScore < profile.delta:
    return ambiguous(matchId=null, reason=insufficient_margin, findings=p)
  require top.confidence > runnerScore else:
    return abstained(matchId=null, reason=no_positive_match, findings=p)
  if unresolvedMaterialContradiction(p) OR insufficientMatchEvidence(top):
    return ambiguous(matchId=null, reason=unresolved_reasoning, findings=p)
  return matched(matchId=top.referenceId, findings=p)
```

Use the profile's reviewed score comparison rules at exact boundaries; no arbitrary
epsilon changes between tests and runtime. A source citation validates provenance,
not the truth of a claim; reviewed evaluation qualifies semantic quality. Missing
complexity remains null. Unqualified candidate commands bypass
classification as described in §3; missing required references fail closed. Ties never select a label through iteration order.

## 5. Prepare one hint without a model

```text
function prepareHint(work):
  require work.status == active and work.stage == hints else fail 409
  require (work.selectedLadderId is null) == (work.hintCount == 0)
  routing = catalogue.requireReviewedHintRouting(
    work.trustedPin, exactHash=work.routingRevisionHash if locked else current)
  ladderId = work.selectedLadderId ?? routing.select(
    work.latestCommittedAssessment?.matchedReferenceId)
  # unmatched / matched with no ladder => reviewed default; bad routing =>503
  # locked sessions load original immutable routing revision, never new current
  ladder = catalogue.readPinnedHintLadder(work.trustedPin, ladderId)
  require ladder.checksum == work.pinnedChecksum
  validateNonemptyReviewedContiguousLadder(ladder)      # cold-load O(B + D + H)
  c = work.hintCount
  require integer(c) and 0 <= c <= ladder.length else dependencyFailure
  if c == ladder.length: fail 409 hint_exhausted

  hint = ladder[c]                                     # zero-based array
  require hint.ordinal == c+1
  require hint.eligibilityRule == accepted_hint_request at stage hints
  # unsupported/corrupt rule is dependency failure, never silently skipped
  return InternalDecision(
    exposure={ladderId, routingHash: routing.hash,
              hintId: hint.id, ordinal: c+1, previousCount: c,
              pin: work.trustedPin, canonicalText: hint.text},
    interviewerTurn=newTurn(hint.text),
    proposedPolicyAction=stay_in_hints,
    sourceVersion=work.sourceVersion,
    contextHash=hash(work.trustedPin + ladderId + routing.hash + c),
    profileHash=reviewedHintPolicyHash, fencingToken=work.token)
  # paraphraseAllowed never authorizes a stronger hint; use canonical text
  # do not return/stream text here, including to speech adapters
```

An eligibility rejection exposes no later hint. A language request for all hints,
reference IDs or full solution never becomes direct catalogue access. The owning
orchestrator may offer the permitted `request_hint` action; it cannot treat ordinary
`candidate_response` text as several accepted hint actions. No implicit ladder
reset follows a different approach, stage exit, refresh or new client session.

## 6. Atomic finalization and safe return

```text
function finalize(work, decision, principal):
  in short transaction scope:
    owner = identity.recheckActiveInternalUser(principal, scope)
    session = sessions.lockOwnedRowForUpdate(work.sessionId, owner.id, scope)
    # all claim/reclaim/cancel/finalize paths use session->operation lock order
    op = commands.lockSameKeyAndHashForUpdate(work, scope)
    if op.status == committed: return replay(op.safeResponse, op.resultETag)
    require op.fencingToken == work.token else staleWorkerFailure
    require op.originalSourceVersion == work.sourceVersion
    require op.leaseExpiry > databaseClockNow() else retryableFailure
    require session.version == work.sourceVersion else fail 412
    require session.pin == work.pin and session.stage == work.sourceStage
    require permittedLifecycleAndAction(session, work.actionType) else fail 409
    require decision.sourceVersion/contextHash/profileHash match reserved inputs

    transition = owningOrchestrator.validateAndChooseTransition(session, decision)
    nextVersion = session.version + 1
    nextAssessmentRef = session.latestAssessmentId     # explicit preserve default
    nextAssessmentVersion = session.latestAssessmentVersion
    nextLadderId = session.selectedLadderId
    nextRoutingHash = session.routingRevisionHash
    if decision.exposure exists:
      require session.selectedLadderId is null OR
              session.selectedLadderId == decision.exposure.ladderId
      nextLadderId = decision.exposure.ladderId
      nextRoutingHash = session.routingRevisionHash ?? decision.exposure.routingHash
      require session.hintCount == decision.exposure.previousCount
      require decision.exposure.ordinal == session.hintCount + 1
      newCount = session.hintCount + 1
      eventType = interview.hint.exposed
    else:
      nextAssessmentRef = decision.assessment.id
      nextAssessmentVersion = nextVersion
      newCount = session.hintCount
      eventType = interview.approach_assessed

    changed = sessions.compareAndSwapOwnedSnapshot(
      expectedVersion=work.sourceVersion, nextVersion, transition,
      hintCount=newCount, selectedLadderId=nextLadderId, routingHash=nextRoutingHash,
      assessmentRef=nextAssessmentRef, assessmentVersion=nextAssessmentVersion,
      operationId=op.id, requiredFence=work.token,
      leasePredicate=leaseExpiry > databaseClockAtWrite(), scope)
    require changed == 1 else fail 412
    # snapshot CAS occurs before exposure uniqueness can race; locks held to commit
    if decision.exposure exists:
      hints.persistExposure(decision.exposure, op.id, nextVersion, scope)
    else:
      assessment.persist(decision.assessment, op.id, nextVersion, scope)
    conversation.persistReservedCandidateIfPresent(decision, scope)
    conversation.persistInterviewerTurn(decision.interviewerTurn, scope)
    sessions.appendOneCommandEvent(
      eventType, nextVersion, requiredCanonicalEnvelopeAndPayload,
      safeReferenceMetadata, scope)
    response = sessions.buildSafeCommittedProjection(scope)
    commands.persistSuccessAndReplay(op, response, quotedETag(nextVersion), scope)
    # optional transactional outbox only if a real async consumer requires it
  after successful commit:
    return response with quotedETag(nextVersion)
```

Context/profile hashes are bound to the operation in a fenced bookkeeping update
before finalization; no client/provider-supplied hash is trusted. Dependency reads
inside finalization are limited to local transaction-safe owning services, never
provider calls. Ownership, CAS, uniqueness or any write failure rolls back every
domain write. Do not send an interviewer turn to HTTP/TTS before commit. A zero-row
CAS is not success. Events may record transition metadata but do not create a
second event at the same unique session version.

## 7. Failure, lease recovery and resume

```text
function onPreparationFailure(work, failure):
  commands.markRetryableIfCurrentFence(work, safeReasonCode(failure))
  # no version/stage/cursor/candidate-error/evidence mutation
  return canonicalSafeError(failure)                    # usually recoverable 503

function reclaimExpiredOperation(owner, sameKey, sameHash):
  # run through admit with session->operation row locks; compare current version
  # to STORED original source version, never fresh incoming If-Match; no rebasing
  # increment fencing token before any new work; old work cannot commit
  return admit(owner, originalLogicalRequest)

function resumeOrRead(owner, sessionId):
  session = sessions.readOwnedCurrentSnapshot(owner, sessionId)
  # a resume mutation, if needed, uses existing command/idempotency policy
  return safeProjection(session, committedLatestTurnOnly)
  # no model re-evaluation, hint cursor reset or implicit hint release
```

| Injected boundary                                 | Expected invariant                                               |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| Provider timeout/invalid output before finalize   | I8: no successful assessment or hint                             |
| Ownership changes, stale version or expired fence | I1/I8: deny/discard; no newer state overwritten                  |
| Failure after assessment/exposure insert          | I5: transaction rollback includes cursor, turns and event        |
| Commit succeeds; response lost                    | I4/I7: same-key replay returns original result, not another hint |
| Two distinct requests race from version v         | I4: one v+1 winner; loser cannot append/consume                  |
| Same key/different payload                        | I4/I7: conflict before new work                                  |
| Alternate approach after hints                    | I6/I7: history/cursor preserved                                  |
| Speech requested during hint preparation          | I9: only a committed interviewer turn can be spoken              |

## 8. Complexity correspondence

The single-pass classifier is `O(M)` time/`O(1)` additional space over its validated
proposal. Evidence boundary indexing prevents per-span rescans; validation is
expected `O(E + J + R)` after reference maps. Cold content validation costs
`O(B + A + D + H)`; hint selection from the validated array is `O(1)` plus text copy.
Finalization uses a fixed count of indexed operations and bounded row payloads,
not constant elapsed database time. Full symbols, memory/storage bounds, provider
cost exclusions and measurement requirements are in engineering §4.
