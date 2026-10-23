# Problem Catalogue and Immutable Problem Packs — Pseudocode

**Status:** Owner-approved algorithms; implementation authorized on 2026-10-23. These algorithms are not executable acceptance evidence.  
**Feature:** 3. **Kanban:** K-007–K-009. **Date:** 2026-10-22.
**Reconciled:** 2026-10-23; owner-accepted audit corrections and ADR-023.  
**Inputs:** [requirements](../requirements/feature_req.md),
[technical design](../specifications/technical/tech_design.md),
[engineering design](../specifications/engineering/eng_design.md).

## 1. Conventions and state

`fail(code, path)` returns a typed safe failure, never raw content or SQL.
Inside transactions, `abortDomain(code, path)` throws only a recognized
DomainAbort; the adapter rolls it back and preserves its safe code. Validators
using an errors collector append bounded failures instead of throwing.
`transaction` is a proposed adapter over the existing bounded database lifecycle;
there is no shared transaction primitive in the current code. Every SQL
operation is parameterized and cancellation-aware. `scope` means one opaque
transaction scope shared by public module services; it is not a public pool or
repository. Proposed limits are defined in the technical design.

```text
draft --validate--> validated --independent approval--> approved --publish--> published
  ^                     |                                |
  +---- edit/reject ----+---- edit invalidates approval --+

published --correction--> new draft with a NEW version
published --withdraw--> immutable content + availability = withdrawn
```

Draft/validated/approved are authoring states; the catalogue contains only fully
published releases. A failed operation never inserts a partly published release.
Withdrawal does not delete content or alter its checksum.

```text
// Proposed infrastructure: preserve domain outcomes across existing withClient.
function transaction(work, signal):
    outcome = await database.withClient(async client =>:
        scope = makeOpaqueScope(client, databaseIdentity, state = "active")
        try:
            await client.query("BEGIN")
            result = await work(scope)
            requireNotCancelled(signal)
            await client.query("COMMIT")
            return {kind: "committed", value: immutableResult(result)}
        catch error:
            // If rollback fails, propagate an infrastructure failure so withClient
            // destroys the connection. Never convert that into a domain outcome.
            await client.query("ROLLBACK")
            if isRecognizedDomainAbort(error):
                return {kind: "domain_failure", code: error.safeCode, path: error.safePath}
            throw error                             // withClient sanitizes + destroys
        finally:
            invalidateScope(scope)
    , signal)
    // This mapping is OUTSIDE withClient, which erases callback exceptions.
    if outcome.kind == "domain_failure":
        throw typedDomainFailure(outcome.code, outcome.path)
    return outcome.value
    // Cancellation/driver/unknown-commit outcomes stay safe infrastructure errors.

function owningRepositoryConnection(scope):
    require scope was issued by the trusted transaction adapter
    require scope.databaseIdentity == thisRepository.databaseIdentity
    require scope.state == "active"
    return privateUnwrap(scope)                     // never exported by module public API

function verifyOperator(credentialInput, signal):
    credential = readEphemeralCredentialFromStdin(credentialInput)
    try:
        caller = await identity.authenticate(makeBearerRequest(credential), signal)
        return {userId: caller.userId, permissionSnapshot: serverConfig.staffGrants}
    finally:
        discardCredentialReferences()              // do not log/write credentials

function requirePermission(operator, permission):
    require permission in ["review_content", "publish_content", "withdraw_content"]
    grants = operator.permissionSnapshot.grants.get(operator.userId, default = [])
    if permission not in grants:
        throw DomainAbort("permission_denied", "operator")
    // Absent ID/config has no grants. Snapshot is immutable and revisioned.
```

The operator command acquires one reviewed configuration snapshot per operation;
`requireCurrentPermission` reuses that snapshot, not untrusted input or mutable
role data. Configuration replacement/restart is required to change grants.
Record its non-secret revision/digest in review/publication/audit evidence.
Publication has no nested transaction; all repositories join the supplied scope.
Review insertion uses the same bounded infrastructure in its own short operation.

## 2. Read and validate one content bundle

```text
function validateBundle(source, signal):
    bytes = readAtMost(source, MAX_BUNDLE_BYTES + 1, signal)
    if byteLength(bytes) > MAX_BUNDLE_BYTES:
        return fail("pack_too_large", "bundle")
    requireValidUtf8(bytes)
    requireJsonNestingAtMost(bytes, MAX_DEPTH)
    requireNoDuplicateKeysAndValidUnicode(bytes)
    requireSafeIntegerTokens(bytes)                 // before native parsing can round
    pack = parseJson(bytes)                         // malformed JSON => typed failure
    errors = new BoundedErrors(maximum = 100)
    boundedSchemaPreflight(packSchema, pack, errors, stopAfter = 101)
    if errors.notEmpty: return invalid(errors)      // cap creation, not only serialization
    validateStrictSchema(pack, errors)              // required types, sizes, unknown keys
    if errors.notEmpty: return invalid(errors)
    requireSupported(pack.schemaVersion, errors)
    requireIdByteBounds(pack.problemId, pack.version, errors)
    requireNoC0OrDel(pack.problemId, pack.version, errors)
    rejectExactUrlDotSegments(pack.problemId, errors) // versions keep ordinary labels
    requireValidSlugAndDifficulty(pack, errors)
    requireUsableExamplesApproachesHintsAndTests(pack, errors)
    requireReasonForAllowedEmptySections(pack, errors) // human accepts it during review

    clarificationIds = uniqueIndex(pack.interview.clarifications, "id", errors)
    approachIds = uniqueIndex(pack.interview.approaches, "id", errors)
    mistakeIds = uniqueIndex(pack.interview.mistakes, "id", errors)
    ladderIds = uniqueIndex(pack.interview.hintLadders, "id", errors)
    sourceIds = uniqueIndex(pack.provenance.sources, "id", errors)
    rubricDimensionIds = uniqueIndex(pack.interview.rubric.dimensions, "id", errors)
    hintIds = uniqueIndex(allHints(pack), "id", errors)
    followupIds = uniqueIndex(pack.interview.followups, "id", errors)
    variantIds = uniqueIndex(pack.interview.variants, "id", errors)
    testIds = uniqueIndex(pack.evaluation.cases, "id", errors)
    for approach in pack.interview.approaches:
        requireStepsCorrectnessComplexityAndPreconditions(approach, errors)
    for mistake in pack.interview.mistakes:
        requireReasonAndCounterexampleOrExplanation(mistake, errors)
        requireAllReferences(mistake.approachIds, approachIds, errors)
        requireAllReferences(mistake.testCaseIds, testIds, errors)
    for ladder in pack.interview.hintLadders:
        requireKnownOptionalReference(ladder.approachId, approachIds, errors)
        expectedOrdinal = 1
        for hint in ladder.hints:                   // authored order is meaningful
            requireEqual(hint.ordinal, expectedOrdinal, errors)
            requireAllowedRule(hint.eligibilityRule, errors)
            requireBoolean(hint.paraphraseAllowed, errors)
            expectedOrdinal += 1
    for followup in pack.interview.followups:
        requireQuestionSkillAnswerPointsAndRubric(followup, errors)
        requireAllowedRule(followup.eligibilityRule, errors)
        requireAllReferences(followup.approachIds, approachIds, errors)
        requireAllReferences(followup.sourceReferences, sourceIds, errors)
    for variant in pack.interview.variants:
        requireChangedContractAndSkill(variant, errors)
        requireAllReferences(variant.approachIds, approachIds, errors)
        requireEqual(variant.executable, false, errors) // v1 variants are reasoning-only
        requireReasoningOnlyLabel(variant, errors)
    for case in pack.evaluation.cases:
        requireAllowedCategory(case.category, errors)
        requireOneOf(case.visibility, ["public", "hidden"], errors)
        requireBoundedJson(case.input, case.expectedOutput, errors)
        requireValidationEvidence(case, errors)
        requireAllReferences(case.validationEvidence.sourceReferences, sourceIds, errors)
    requireManifestListsEveryCaseExactlyOnce(pack.evaluation.manifest, testIds, errors)
    profile = requireKnownInputProfile(pack.evaluation.manifest.inputProfileId, errors)
    requireCompatibleCheckerDescriptor(profile, pack.evaluation.manifest.checkerId, errors)
    if errors.notEmpty: return invalid(errors)       // dependent profile must exist
    validateDataWithProfile(profile, pack.evaluation.cases, errors)
    requireExamplesMatchPublicCases(pack.candidate.examples, pack.evaluation.cases, errors)
    requireVersionedRubricAndSuite(pack, errors)
    requireProvenanceFields(pack.provenance, errors)
    candidate = projectDetail({problemId: pack.problemId, version: pack.version,
                               candidate: pack.candidate})
    requireSerializedBytesAtMost(candidate, MAX_CANDIDATE_BYTES, errors)
    if errors.notEmpty: return invalid(errors)

    checksum = sha256(canonicalJson(contentOnly(pack)))
    return valid(immutable(pack), checksum)

function boundedSchemaPreflight(schema, value, errors, stopAfter):
    if errors.truncated: return
    remember errors.count
    if schema is optional or nullable:
        visit its inner schema unless value is the permitted absent/null marker
        return
    if schema is strict object:
        reject an unknown property at its safe containing path
        visit each declared child using the declared property name
    else if schema is array or tuple:
        reject oversized arrays or wrong tuple lengths before visiting children
        visit children in order, stopping once the diagnostic budget is exhausted
    else:
        require schema is an explicitly supported scalar node
    if children failed: return                     // never bulk-parse invalid descendants
    validate this node's remaining rules with the same selected strict schema
    collect at most 100 safe paths; the next finding sets errors.truncated

function canonicalJson(value):
    if value is non-null object and not array:
        keys = sortKeysByEcmaUtf16CodeUnits(value)
        return encodeObject(keys.map(key => [key, canonicalJson(value[key])]))
    if value is array:
        return encodeArray(value.map(canonicalJson)) // never sort arrays
    require value is null, boolean, valid Unicode string or safe integer
    return encodeEcmaJsonScalar(value)

function requireSafeIntegerTokens(bytes):
    // Token-aware scan: numbers inside quoted strings are not numeric tokens.
    for token in scanJsonNumericTokens(bytes):
        require token matches -?(0|[1-9][0-9]*) and token != "-0"
        require token.length <= 17                  // bound exact range-check work
        integer = parseExactIntegerForRangeCheck(token)
        require -9007199254740991 <= integer <= 9007199254740991
    // Reject exponent/fraction/unsafe tokens, never round or silently coerce.

function validateDataWithProfile(profile, cases, errors):
    require profile.id == "two-sum-base-v1"           // closed registry in version 1
    for case in cases:
        previousErrorCount = errors.count
        requireExactKeys(case.input, ["nums", "target"], errors)
        requireIntegerArrayLength(case.input.nums, 2, 10000, errors)
        requireIntegerBounds(case.input.nums, -1000000000, 1000000000, errors)
        requireIntegerBounds(case.input.target, -1000000000, 1000000000, errors)
        requireDistinctInRangeIntegerPair(case.expectedOutput, case.input.nums, errors)
        if errors.count > previousErrorCount: continue
        // Bounded data reasoning, not execution of supplied/reference programs.
        seenFrequency = emptyMap()
        pairCount = 0
        for x in case.input.nums:
            pairCount += seenFrequency.get(case.input.target - x, default = 0)
            seenFrequency[x] = seenFrequency.get(x, default = 0) + 1
        requireEqual(pairCount, 1, errors)
        requireExpectedPairSumMatches(case, errors)
```

`contentOnly` includes identity/schema/author and every content/test/provenance
section. It excludes review records, generated IDs, publication time and the
checksum field. `encodeObject/encodeArray` assemble already encoded JSON values;
they do not double-encode them as strings. Reject U+0000/unpaired surrogates and
duplicate keys, including inside test data, before JSONB storage. Test Unicode
key order, unsafe integer tokens, negative zero and exponent/fraction rejection,
and the full content→JSONB→reconstruction checksum round trip.
No validation helper fetches a URL, loads a program, or calls a model.

## 3. Record independent review

```text
function recordReview(operatorCredentials, validatedBundle, decision, evidence):
    reviewer = verifyOperator(operatorCredentials)
    requirePermission(reviewer, "review_content")  // ADR-023 configuration snapshot
    author = await identity.lookupActiveUser(validatedBundle.pack.authorId, transaction = none, signal)
    if author is none:
        return fail("author_not_active", "authorId")
    if reviewer.userId == author.userId:
        return fail("self_review_forbidden", "reviewer")
    requireOneOf(decision, ["approved", "rejected"])
    requireCompleteReviewEvidence(evidence)
    // Evidence covers correctness, alternatives, complexity, tests, hint order,
    // follow-ups/variants and source rights. It is not generated by schema validation.
    digest = recomputeChecksum(validatedBundle.pack)
    return publishingRepository.insertImmutableReview(
        problemId = validatedBundle.pack.problemId,
        version = validatedBundle.pack.version,
        checksum = digest,
        authorId = author.userId,
        reviewerId = reviewer.userId,
        decision = decision,
        evidence = evidence,
        reviewedAt = trustedClock.now(),
        permissionConfigRevision = reviewer.permissionSnapshot.revision,
        permissionConfigDigest = reviewer.permissionSnapshot.digest)
```

`identity.lookupActiveUser` is the identity-owned server-only public seam,
exported through `src/modules/identity-profile/public.ts`. It validates the UUID,
reads the existing mapped user through identity's owning repository, and returns
only immutable `{userId}` proof for an active user. Unknown/disabled users return
none; a submitted UUID is never verification by itself. If an opaque transaction
is supplied, only that owning repository unwraps it and joins its connection;
otherwise the normal database lifecycle is used. It neither creates a user nor
returns identity-provider/profile details or authenticates the reviewer.

Staff authorization comes from verified identity and approved permission
binding, never the submitted review file. Review records do not mutate published
content. Rejection creates no eligible catalogue release.

## 4. Publish a reviewed version

```text
function publishBundle(operatorCredentials, source, reviewId, signal):
    publisher = verifyOperator(operatorCredentials)
    requirePermission(publisher, "publish_content")
    reviewId = normalizeValidatedUuid(reviewId)
    validated = validateBundle(source, signal)
    if validated.invalid: return validated.failure
    pack = validated.pack

    return transaction(scope, signal):
        requireCurrentPermission(scope, publisher, "publish_content")
        review = publishingRepository.readImmutableReview(scope, reviewId)
        requireReviewMatches(review, pack.problemId, pack.version,
                             pack.authorId, validated.checksum)
        requireEqual(review.decision, "approved")
        requireDifferent(review.authorId, review.reviewerId)
        requireRecordedReviewEvidenceValid(scope, review)
        requireFinalContentApprovalAnnotations(pack) // no pending content evidence

        // Public catalogue write port owns its own SQL.
        catalogue.lockProblem(scope, pack.problemId, pack.slug)
        // Atomically create if absent, then lock. Reject a slug bound to another
        // ID or a changed slug for this ID. Withdrawal omits slug and creates nothing.
        existing = catalogue.findRelease(scope, pack.problemId, pack.version)
        if existing exists:
            if existing.checksum != validated.checksum:
                abortDomain("published_version_conflict")
            receipt = publishingRepository.readPublication(scope, existing.id)
            requireCompletePublication(receipt)
            return receipt                          // do not reset pointer/availability

        requirePermissionForInternalId(publisher.permissionSnapshot,
                                       review.reviewerId, "review_content")
        // Current reviewer grant needed for a NEW publication. Exact retries
        // above preserve already-committed history without re-approving it.
        publishedAt = trustedClock.now()
        release = catalogue.installImmutableRelease(scope, pack,
                         validated.checksum, publishedAt)
        // Installs release, complete suite/cases and eligible availability.
        // Store the author UUID FK and its original spelling separately; exact
        // reconstruction uses authored text, ordered cases and all optional fields.
        event = makeCanonicalEnvelope(
            eventId = newUuid(),
            eventType = "content.problem_pack.published",
            schemaVersion = 1,
            occurredAt = publishedAt,
            producer = "content-publishing",
            correlationId = currentCorrelationIdOrNewTrustedId(),
            payload = {
                problemId: pack.problemId,
                problemPackVersion: pack.version,
                publishedAt: publishedAt,
                reviewStatus: "approved",
                contentChecksum: validated.checksum
            })
        requireMatchesCanonicalEventSchema(event)
        receipt = publishingRepository.insertPublication(scope, release.id,
                         review.id, publisher.userId, event,
                         publisher.permissionSnapshot.revision,
                         publisher.permissionSnapshot.digest)
        publishingRepository.appendAudit(scope, "published", release.id,
                                        publisher.userId, "review_approved",
                                        publisher.permissionSnapshot.revision,
                                        publisher.permissionSnapshot.digest)
        catalogue.selectCurrentRelease(scope, pack.problemId, release.id)
        return receipt
    // COMMIT occurs before success returns. Every failure rolls back all writes.
    // A lost commit response is resolved by retrying identical version/content.
```

Concurrent operations use the same problem lock and unique version constraint.
Do not hold the transaction during file reads, human review or external calls.
Persisting the event is not evidence that any queue consumer has received it.

```text
// Catalogue-owned installation helper, used only inside publishBundle:
function installImmutableRelease(scope, pack, checksum, publishedAt):
    release = repository.insertUnsealedRelease(scope,
        identity = pack.identityFields,
        authorId = pack.authorId,
        candidate = pack.candidate,
        interview = pack.interview,
        provenance = pack.provenance,
        suiteManifest = pack.evaluation.manifest,
        checksum = checksum,
        publishedAt = publishedAt)
    for ordinal, case in enumerate(pack.evaluation.cases):
        repository.insertCase(scope, release.id, ordinal, completeDefinition = case)
    requireEqual(reconstructChecksum(scope, release.id), checksum)
    repository.sealReleaseWithoutChangingContent(scope, release.id)
    repository.insertEligibleAvailability(scope, release.id)
    return release

database guard before inserting a release:
    require sealed == false                        // no direct finalized INSERT
database guard before inserting a test case:
    lock its parent release
    require parent exists and parent.sealed == false
database guard before updating a release:
    allow only sealed false → true with all content fields unchanged
database guard before updating/deleting a case or deleting a release:
    reject
database deferred guard at transaction commit:
    require every newly inserted release is sealed
database guard before selecting current release or recording publication:
    require referenced release is sealed and belongs to the declared problem
```

`identityFields` means the exact problem ID, stable slug, version and schema
version validated above. Ordered cases and all optional metadata survive the
storage mapping; reconstruction must not depend on the authoring file.

## 5. List eligible problems

```text
function listProblems(httpRequest, signal):
    caller = identity.authenticate(httpRequest, signal)
    // Existing admission maps denial to canonical 401/403/429/503.
    limit = parseIntegerInRange(httpRequest.query.limit, default = 20,
                                minimum = 1, maximum = 100)
    cursor = decodeBoundedCursor(httpRequest.query.cursor)
    // Invalid input => canonical 400 / BadRequest.
    page = catalogueRepository.readEligibleSummaries(
        afterProblemId = cursor?.lastProblemId,
        limit = limit + 1,
        order = "stable problem ID ascending", signal)
    // Query joins current release + eligible availability and selects only
    // candidate summary fields. No test/interview/provenance JSON is selected.
    hasMore = page.length > limit
    returned = page.take(limit)
    return {
        items: returned.map(projectSummary),
        nextCursor: hasMore ? encodeCursor(returned.last.problemId) : null
    }

function decodeBoundedCursor(encoded):
    if encoded absent: return null
    requireEncodedSizeAtMost(encoded, 1024)
    decoded = strictDecodeBase64UrlJson(encoded)
    requireExactKeys(decoded, ["formatVersion", "lastProblemId"])
    requireEqual(decoded.formatVersion, 1)
    requireIdByteBoundsAndNoControls(decoded.lastProblemId)
    return decoded
```

One statement gives a coherent view for the page. Cursor tampering changes only
the starting point; it cannot bypass published/eligibility filters.

## 6. Candidate detail and explicit projection

```text
function getProblem(httpRequest, problemId, signal):
    caller = identity.authenticate(httpRequest, signal)
    requireIdByteBoundsAndNoControls(problemId)
    release = catalogueRepository.readCurrentEligibleCandidate(problemId, signal)
    if release absent: return canonicalNotFound()
    requireStoredCandidateShapeAndBounds(release)
    detail = projectDetail(release)
    requireSerializedBytesAtMost(detail, MAX_CANDIDATE_BYTES)
    return detail

function projectSummary(release):
    return immutable({
        problemId: release.problemId,
        title: release.candidate.title,
        difficulty: release.candidate.difficulty,
        topicTags: copy(release.candidate.topicTags),
        latestPublishedVersion: release.version
    })

function projectCandidateContent(pack):
    return {
        statement: pack.candidate.statement,
        constraints: copy(pack.candidate.constraints),
        examples: pack.candidate.examples.map(example => {
            input: example.input,
            output: example.output,
            explanation: example.explanation if present
        })
    }

function projectDetail(release):
    summary = projectSummary(release)
    content = projectCandidateContent(release)
    return immutable({
        problemId: summary.problemId,
        title: summary.title,
        difficulty: summary.difficulty,
        topicTags: summary.topicTags,
        latestPublishedVersion: summary.latestPublishedVersion,
        statement: content.statement,
        constraints: content.constraints,
        examples: content.examples,
        problemPackVersion: release.version
    })
```

The HTTP detail is the current eligible release. Internal pinned views report
the pinned version and omit `latestPublishedVersion` unless explicitly resolved;
do not mislabel a historical version as the current catalogue version.
Never spread the stored object or return private field names and rely on UI
hiding. Stored-content corruption returns a safe unavailable error, not a
successful malformed body or fallback to a different version.

## 7. Resolve and retain a session pin

```text
function resolveForNewSession(problemId, scope):
    // Caller already authenticated; scope must be the session creation transaction.
    problem = catalogueRepository.lockProblemShared(scope, problemId)
    if problem absent or problem.currentReleaseId absent:
        return fail("problem_unavailable", "problemId")
    availability = catalogueRepository.lockAvailabilityShared(
                       scope, problem.currentReleaseId)
    if availability.status != "eligible":
        return fail("problem_unavailable", "problemId")
    release = catalogueRepository.readReleaseIdentity(scope, problem.currentReleaseId)
    requireEqual(release.problemId, problemId)
    return immutable({problemId, version: release.version,
                      releaseId: release.id, checksum: release.checksum,
                      suiteVersion: release.suiteVersion})

// Feature 3 / P-11: real internal pin creation, owned by interview-session.
function createPublishedSession(verifiedCaller, problemId, signal):
    requireValidatedCallerAndProblemId(verifiedCaller, problemId)
    return transaction(scope, signal):
        pin = catalogue.resolveForNewSession(problemId, scope)
        if pin is failure: abortDomain(pin.code, pin.path)
        // Existing owning repository joins scope; no second BEGIN/COMMIT.
        session = sessionRepository.insertSnapshotAndCreatedEvent(
                      scope, ownerId = verifiedCaller.userId,
                      problemId = pin.problemId, problemPackVersion = pin.version,
                      clientContext = empty)
        return session
    // Accept only problemId, never an arbitrary caller-selected version.
    // K-009 tests real snapshot/event rows and publication/withdrawal races.
    // K-013/K-014 later put idempotency and the HTTP command facade around this
    // same operation; they do not add an independently committed inner operation.

function readPinnedCandidateOwned(verifiedCaller, sessionId, signal):
    requireValidCallerAndSessionIdsOrReturnNone()
    session = sessionRepository.readOwned(verifiedCaller.userId, sessionId, signal)
    if session absent: return none             // no content query before ownership
    try:
        return catalogue.readPinnedCandidate(session.problemId,
                                              session.problemPackVersion, signal)
    on missingCorruptOrUnavailableContent:
        return fail("pinned_content_unavailable") // no current-version fallback

function readPinnedCandidate(problemId, version, signal):
    // Called by an owning service after session authorization.
    release = catalogueRepository.readExactPublishedCandidate(problemId, version, signal)
    if release absent: return fail("pinned_content_unavailable", "version")
    requireStoredCandidateShapeAndBounds(release)
    return immutable({problemId, problemPackVersion: version,
                      candidate: projectCandidateContent(release)})
    // Ignore current pointer and withdrawal for this historical read.
```

The candidate supplies `problemId`, not a chosen new-session version. Existing
session migration and ownership checks remain in their current owner. K-009
acceptance uses this actual internal service and real session/event rows, not a
fixture that manually wires disconnected reads/writes. K-014/K-016 retain HTTP,
command replay and complete journey acceptance. Preserve the old fixture-only
createPinned path for identity regressions without exposing it over HTTP.

## 8. Withdraw a release without changing history

```text
function withdrawRelease(operatorCredentials, problemId, version, reasonCode, signal):
    actor = verifyOperator(operatorCredentials)
    requirePermission(actor, "withdraw_content")
    requireAllowlistedReason(reasonCode)
    return transaction(scope, signal):
        requireCurrentPermission(scope, actor, "withdraw_content")
        catalogue.lockProblemExclusive(scope, problemId)
        release = catalogue.findRelease(scope, problemId, version)
        if release absent: abortDomain("release_not_found")
        availability = catalogue.lockAvailabilityExclusive(scope, release.id)
        if availability.status == "withdrawn": return alreadyWithdrawn(release.id)
        catalogue.markWithdrawn(scope, release.id, reasonCode)
        if catalogue.currentReleaseId(scope, problemId) == release.id:
            catalogue.clearCurrentRelease(scope, problemId)
        publishingRepository.appendAudit(scope, "withdrawn", release.id,
                                        actor.userId, reasonCode,
                                        actor.permissionSnapshot.revision,
                                        actor.permissionSnapshot.digest)
        return withdrawn(release.id)
```

No automatic old-version fallback. If a pin commits first, it remains valid;
if withdrawal commits first, a new pin cannot select the withdrawn version.
The common problem→availability lock order avoids reversing lock acquisition.

## 9. Later content consumers

```text
function laterAssessApproach(authorizedSession, candidateExplanation):
    pin = authorizedSession.immutablePin
    context = catalogue.readAssessmentProjection(pin)
    // Selected approach IDs/features, correctness/complexity guidance and
    // relevant mistakes only; no hidden tests or private review records.
    result = modelGateway.assess(context, candidateExplanation)
    return owningPolicy.validateEvidenceIdsAndAllowedResult(result)

function laterHandleHint(authorizedSession, acceptedHintAction):
    // Owning hints/session modules decide and persist; catalogue only reads.
    nextId = hintPolicy.nextEligibleHint(authorizedSession, acceptedHintAction)
    hint = catalogue.readApprovedHint(authorizedSession.immutablePin, nextId)
    session.commitOneHintExposureWithConcurrencyAndIdempotency(hint.id)
    return hint.paraphraseAllowed ? boundedWordingOrCanonicalFallback(hint) : hint.text

function laterResolveExecutionSuite(authorizedSubmission):
    reference = catalogue.readSuiteReference(authorizedSubmission.immutablePin)
    return trustedEvaluator.loadExactSuite(reference)
    // Coordinator sends only necessary test input to sandbox.
    // Expected outputs stay in trusted evaluation; hidden material never enters chat.
```

These sketches state integration boundaries, not Feature 3 implementation tasks.
Their owning features must define complete transaction/retry/provider behavior.

## 10. Failure rules

| Condition                                     | Required result                                               |
| --------------------------------------------- | ------------------------------------------------------------- |
| Invalid bundle/reference/size/schema          | Bounded validation errors; no release writes                  |
| Unknown reviewer or insufficient permission   | Deny; no publication/withdrawal                               |
| Same author/reviewer or stale approval        | Deny; require independent review of exact content             |
| Same version, different checksum              | Conflict; never overwrite                                     |
| Same version, same checksum                   | Original receipt; no pointer/availability reset               |
| Missing/private/unavailable candidate problem | Canonical 404 without private existence details               |
| Invalid query/cursor                          | Canonical 400 / BadRequest                                    |
| Storage/lock timeout or cancellation          | Roll back writes; safe retryable failure; release resources   |
| Lost commit response                          | Retry exact identity/content; recover original durable result |
| Missing/corrupt pinned content                | Recoverable unavailable; never switch versions                |
| Model/execution/voice unavailable             | Catalogue read remains independent of those providers         |

Safe telemetry records operation/outcome/duration and allowlisted IDs only.
Validation, review and publication are separate outcomes; none proves the others.
