# Model Gateway — Logic and State

**Status:** Accepted algorithms for owner-authorized K-017 implementation;
runtime acceptance remains separate. Limits and error names come from the
[technical design](../specifications/technical/tech_design.md).

## 1. Configure once per runtime

```text
buildGateway(settings, registry):
    validate the environment/adapter matrix from technical design §3
    # test: disabled/fake only; staging/production: disabled/openai only
    if adapter is groq:
        require APP_ENV=development and trusted synthetic fixture harness
        enable only gateway_probe in Stage 4; never attach to public routes
    require a server-side key only for the selected real adapter
    reject public secret settings; fix provider origin and disable redirects
    reject enabled operations with missing schema/prompt/eval/budget/capability
    create/reuse gateway and bounded admission controller in runtime registry
    register shutdown abort; do not contact provider from health checks
```

ADR-024 is an accepted design decision, not a runtime approval flag. Synthetic
provenance comes from the trusted fixture harness, not a request boolean.

## 2. Invoke a text operation

```text
invoke(request):
    start monotonic total deadline; initialize metadata, ledger and outcome
    slot = none; reservation = none; attemptResources = none

    try:
        resolve enabled operation from trusted registry
        validate request/context IDs, input schema and allowed content fields
        reject disabled/invalid/cancelled requests with typed local failure
        if Groq: reject requests outside the trusted synthetic fixture harness
        acquire slot without waiting; otherwise reject as saturated
        assemble versioned prompt using validated, minimized context
        mark candidate content as untrusted data; expose no tools
        build provider request; enforce serialized request byte limit
        reserve conservative estimated cost across maximum attempts
        # Production rejects missing prices or an unsafe token upper bound.

        for attempt in 1..2:
            reject cancellation first, then expired total deadline
            check remaining output/cost budgets before dispatch
            attemptSignal = caller + shutdown + total + clipped attempt timeout
            initialize attempt resources and increment dispatched attempt count
            attemptFailure = none; candidateResult = none

            try:
                response = adapter.send(request, attemptSignal, hiddenRetries=0)
                read body incrementally within byte limit and attemptSignal
                record available usage; retain unknown markers on partial reads
                classify HTTP/error envelope using the shared error matrix
                reject refusal, incomplete/truncated completion and tool output
                parse complete JSON; validate exact operation output schema
                check operation-defined IDs/enums/references against input sets
                candidateResult = validated data
            catch failure:
                attemptFailure = map to safe code and internal-retry eligibility
                # Never retain provider message/body/headers in returned errors.
            finally:
                abort attempt, cancel reader, detach listeners and clear timer
                clear attemptResources before any retry wait/next dispatch

            reject caller/shutdown cancellation first, then total deadline expiry
            if candidateResult exists:
                outcome = success(candidateResult); break
            if attemptFailure is terminal or attempt == 2:
                outcome = failure(attemptFailure); break
            delay = max(local jitter, valid parsed Retry-After or zero)
            if delay exceeds 2 seconds or cannot fit remaining deadline:
                outcome = failure(attemptFailure); break
            sleep interruptibly under caller/shutdown/total cancellation
            # Same provider/model on next attempt; no exhausted-quota retry.

    catch failure:
        outcome = typed safe failure, prioritizing cancellation then deadline
        # Preparation/admission/backoff failures are covered too.
        # Unexpected local failures become nonretryable configuration_error.
    finally:
        clean up any remaining attempt resources and total timer/listeners
        release slot/reservation only if acquired; isolate cleanup failures
        finalize attempts, partial usage, final outcome and total duration
        emit exactly one allowlisted summary, including zero-attempt rejection
        # Telemetry failure cannot replace the outcome or expose raw errors.

    return finalized GatewayResult(outcome, metadata)
```

Validation, refusal, output limits, exhausted quota and configuration failures are
terminal for this call. Unknown 429 responses are not assumed transient. There is
no automatic JSON repair. Retries preserve logical operation identity but use a
new attempt identifier. Provider billing may count both attempts.

## 3. Usage and cost

```text
recordAttemptUsage(rawUsage):
    accept only finite nonnegative counts in recognized provider fields
    normalize reasoning/cached tokens without adding included subtotals twice
    absent/partial usage -> unknown/partial, not zero
    estimate from configured versioned rate card when possible
    actual provider charge remains unknown
    aggregate only known counts; preserve unknown attempt count
    if aggregate totals overflow: keep affected totals null, completeness partial
    preserve individual attempt completeness/counters independently
```

The cost reservation controls estimated dispatch spend; it cannot guarantee the
provider invoice or coordinate every application replica. Public consumers need
reviewed per-user/fleet controls before activation.

## 4. Caller integration rule (implemented in later features)

```text
handleCandidateAction(command):
    authenticate and authorize session ownership
    resolve idempotent replay before checking new-command version
    validate current stage/action and pin expected version/evidence
    call gateway outside a database transaction
    if failure: return existing recoverable API behavior; do not score candidate
    validate proposal against stage, evidence, hint and content-exposure policy
    recheck owner/status/version in guarded commit
    if stale: discard proposal; do not overwrite newer session
    atomically persist accepted turn, snapshot, event and idempotency result
```

This is a boundary requirement, not Stage 4 session implementation. No automatic
fallback to another provider. A later deterministic caller fallback must be
explicitly designed; it never turns an invalid provider response into valid data.

## 5. State invariants

- Gateway call state is transient: admitted -> attempting -> optional backoff ->
  succeeded/failed/cancelled. No gateway state is an interview stage.
- Every admitted call releases its slot on every terminal path.
- No success after cancellation, deadline expiry, refusal or incomplete output.
- No database/session writes, candidate execution, hint exposure or score changes.
- No retained raw prompt/response/audio copy; fixtures contain synthetic data only.
