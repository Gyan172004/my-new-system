# Identity and Candidate Access — Pseudocode

**Status:** Implementation authorized; language-neutral logic for the accepted scope.  
**Date:** 2026-10-20. **Task:** K-012.  
**Inputs:** [requirements](../requirements/feature_req.md), [technical specification](../specifications/technical/tech_design.md), [engineering specification](../specifications/engineering/eng_design.md).

## 1. Select the adapter at startup

```text
configureIdentity(config):
    if config.environment is staging or production:
        reject test adapter
        reject enabling private entry points unless adapter is Clerk

    if adapter is disabled:
        return adapter that denies all private access
    if adapter is test:
        require explicit development/test configuration
        return controlled test adapter with its own identity namespace
    if adapter is Clerk:
        validate trusted issuer, permitted parties and verification settings
        construct networkless official SDK adapter using the configured public PEM
        return adapter
    otherwise fail startup with safe setting names only
```

Health probes do not call this authentication path. They keep the foundation
contract and never become sign-in redirects.

## 2. Authenticate each private request

```text
authenticate(request):
    check pre-verification system/source admission budget
    if exhausted: return 429 with Retry-After
    if admission unavailable: return retryable 503
    extract exactly one supported Bearer credential
    if missing, malformed or over configured size limit:
        return 401

    verified = selectedAdapter.verify(credential)  # Bounded input; no request-time network.
    if verification proves token invalid or sign-in incomplete:
        return 401
    if verification cannot finish because a dependency is unavailable:
        return retryable service-unavailable failure

    check per-identity admission budget using verified namespace/subject
    if exhausted: return 429 with Retry-After
    if admission unavailable: return retryable 503

    # Signature/issuer/time/party/audience checks finish before storage access.
    # Test headers are ignored in Clerk mode; the browser cannot choose an adapter.
    user = resolveUser(verified.provider, verified.issuer, verified.subject)
    if storage failed:
        return retryable service-unavailable failure
    if user.accountStatus is not active:
        return 403

    return immutable server-created Caller(user.id)
```

Admission state has a fixed entry cap and expiring buckets; reject at capacity,
never evict a depleted bucket to grant fresh budget. Tests must bound expiry/
cleanup work and concurrent admission. Health probes bypass admission. Retry-After
is the rounded-up seconds until admission can be retried. No raw token is stored
in a limiter key or log.

Retain tokens only for transient verification. Do not log credentials, claims,
SDK exceptions or raw database errors. HTTP adapters map failures to the declared
response and safe `ApiError` with a request ID.

## 3. Resolve a stable internal user

```text
resolveUser(provider, issuer, verifiedSubject):
    row = select user by exact unique identity tuple
    if row exists:
        return row                 # Includes status; never reactivate here.

    insert new server-generated UUID, identity tuple, active status, timestamps
        on conflict (provider, issuer, subject): do nothing

    # Separate statement: READ COMMITTED sees the concurrent winner after insert.
    row = select user by exact unique identity tuple
    if row is absent:
        return safe storage failure   # No provisional ID or unbounded loop.
    return row
```

Use parameterized SQL and existing pool/statement deadlines. The database unique
constraint decides the winner, not an in-memory lock. A losing request returns
the winner's ID. Database errors do not trigger a new identity namespace.

## 4. Read, create and mutate owned resources

```text
readSession(caller, sessionId):
    session = repository.find(id = sessionId, ownerId = caller.userId)
    if absent: return 404
    return candidateSafeProjection(session)

createSession(caller, request):       # Implemented by the later session feature.
    validate existing CreateSessionRequest; reject unknown fields
    validate optional context; experience length must be <= 2000 characters
    normalize payload and scope command key by caller + create operation
    begin owning-module transaction
    atomically claim the command key using a unique constraint
        serialize concurrent requests for that key within the bounded DB deadline
    if a committed command already exists:
        if normalized payload differs: rollback; return 409
        verify caller ownership of the recorded result
        end read-only/replay transaction
        return original committed result without creating or repinning a session
    resolve eligible published pack version for this new command
    create session with ownerId = caller.userId and server-selected pack version
    append creation/pin event and store idempotent response
    commit session + event + command result together
    on any failure: roll back all three; never leave a partial session

mutateSession(caller, sessionId, command):
    begin owning-module transaction
    find session using sessionId AND caller.userId
    if absent: rollback; return 404
    authorize before looking up/replaying any idempotent response
    resolve existing owner/resource/operation-scoped idempotency result first
    if same payload:
        end replay transaction
        return committed result without checking its now-stale version
    if different payload: rollback; return 409
    apply session status, expected version and allowed-action checks
    update with owner + expected-version predicate
    append event and persist idempotent response atomically
    commit; return candidate-safe result

readChild(caller, sessionId, childId):
    find child joined to its actual session using:
        child.id = childId AND child.sessionId = sessionId
        AND session.ownerId = caller.userId
    if absent: return 404
    return candidate-safe projection
```

Before resource denial, admission bookkeeping, trusted-key retrieval and
verified user mapping are permitted authentication effects. Invalid tokens never
create mappings. Denied operations stop before loading private conversation/model
context, changing interview resources/events/replay records, enqueuing execution
or invoking model/transcription/speech providers. Later list APIs filter by owner in
the database before pagination. Reuse these rules for history, feedback and
submissions; their endpoints and state machines remain in their owning features.

## 5. Browser sign-in and sign-out

```text
# /sign-in embeds Clerk's prebuilt component, styled to the selected wireframe.
# Clerk-managed entry offers Google and email verification codes only.
# Invalid/expired codes never yield a completed identity or a user mapping.
onProtectedNavigation(destination):
    if signed out: navigate to /sign-in with a safe local return destination
    # The embedded component lets Clerk handle Google redirects and email codes.
    else: request protected data using a current Clerk Bearer token

onAuthenticationFailure():
    clear private view and client caches
    ask the candidate to sign in again; retain persisted progress on the server
    do not silently replay a mutation without its original idempotency semantics

onSignOutOrAccountSwitch():
    clear private view, cached responses and pending user-scoped requests
    complete Clerk sign-out/account transition
    fetch private work again only after authenticating the new account
```

Check that late responses from the previous account cannot repopulate its private
view. Local sign-out does not invalidate every copied token immediately; the
technical specification describes the expiry/revocation limitation.

## 6. State rules and invariants

| From                | Trigger                               | Result                                            |
| ------------------- | ------------------------------------- | ------------------------------------------------- |
| No mapping          | First valid provider identity         | One active mapping, or safe storage failure       |
| Active mapping      | Same verified identity                | Same internal ID                                  |
| Disabled mapping    | Valid token                           | Denied; status unchanged                          |
| Any request         | Invalid/expired token                 | Unauthenticated; no private work                  |
| Any private request | Admission exhausted                   | 429 and Retry-After; no downstream interview work |
| Any request         | Admission/verification/storage outage | Retryable 503; no fallback identity               |

Identity has no interview-stage transitions. Optional experience is untrusted
session context and never changes authorization or scoring weights. Follow the
existing [session state machine](../../interview_session/specifications/technical/session_state_machine.md),
[LLM policy](../../interview_orchestration/specifications/technical/llm_interaction_policy.md),
[execution contract](../../code_execution/specifications/technical/execution_contract.md)
and [voice contract](../../voice_interaction_transcription/specifications/technical/voice_interaction_contract.md).

## Runtime request boundary

```text
withCandidate(request, privateWork):
  read active request ID, abort signal and source address from custom-server scope
  require SERVING runtime and real socket source; ignore client identity/forwarded headers
  combine request and transport abort signals
  verify/admit/map using one runtime-owned identity service
  reject if cancelled; invoke privateWork(caller, combinedSignal)
  owning services pass combinedSignal to bounded database/provider work
  reject if cancelled; return private, no-store response varying by Authorization
  on failure: emit allowlisted denial code/status/request ID only
              return safe ApiError with same request ID and Retry-After when limited
```

Closing the runtime clears limiter state and stops storage work. Transport cancellation
invalidates detached request context. Existing PostgreSQL statement deadlines remain
the final bound on server-side SQL after a client socket is destroyed. No new public
interview API is introduced by this helper.

Convergence implementation notes: the browser middleware reads the single validated secret from the server environment rather than passing a dynamic-key option. Session input validation counts experience as Unicode code points, pack references as UTF-8 bytes, and retains the total 16 KiB bound; preferred language has no separate 256-character limit. See the owning session pseudocode for guards before persistence.
