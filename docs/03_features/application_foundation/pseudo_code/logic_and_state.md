# Application Foundation — Logic and State

**Date:** 2026-10-17  
**Status:** Reconciled planning baseline; implementation and runtime checks remain unexecuted.  
**Authority:** Canonical algorithms for this feature.  
**Inputs:** [Requirements](../requirements/feature_req.md), [technical design](../specifications/technical/tech_design.md), [engineering design](../specifications/engineering/eng_design.md), existing [API contract](../../../../contracts/api/v1_openapi.yaml).

## Problem and reading guide

Application ko har developer ke machine par repeatably start hona chahiye,
unsafe settings par traffic accept nahi karna chahiye, aur dependency failure
ko safely report karna chahiye. Yeh foundation us behavior ka pseudocode hai.
Interview rules, candidate code execution aur AI conversation apni features mein
implement honge. Neeche ke examples planned algorithms hain, executable code ya
passed runtime tests nahi.

Pehle connected flow padho, phir individual functions. Pseudocode intentionally
language-independent hai; TypeScript/Next.js implementation ko isi behavior ke
against verify karna hoga. Detailed budgets, settings aur packaging decisions
technical design mein defined hain; yeh document unka alternative design nahi.

| Concept | Meaning aur connection |
|---|---|
| Process | Chal raha application program; iska lifecycle interview session se alag hai. |
| Configuration | Environment aur resources ki settings; use karne se pehle validate karte hain. |
| Liveness | Process request ka response de sakta hai ya nahi; database ko call nahi karta. |
| Readiness | Required initialization, database aur schema conditions traffic ke liye available hain ya nahi. |
| Request context | Ek request ka identifier aur timing; concurrent requests ka context mix nahi hona chahiye. |
| Migration | Ordered, versioned database change; separate explicit command se apply hota hai. |
| Deadline | Operation ko finish ya terminate karne ki maximum duration; sirf wait band karna cancellation nahi hai. |
| Draining | Nayi requests band, pehle se accepted work ko bounded time mein finish karna. |

## Connected development and runtime flow

```text
developer_workflow():
    install dependencies from the committed lockfile
    verify safe local configuration without printing values
    explicitly run migrate(authorized_development_target, packaged_head)
    build_package()                         # deployment secrets ki zaroorat nahi
    start(runtime_settings)                 # settings validate hone ke baad listen
    # External smoke client now calls the actual HTTP routes:
    expect GET /api/v1/health/live -> 200
    expect GET /api/v1/health/ready -> 200 when storage/history are compatible
    run required verification stages
    request shutdown and verify bounded cleanup

runtime_request_flow(request):
    bind a fresh request context
    dispatch to an implemented route
    # Liveness -> process observation only.
    # Readiness -> lifecycle + bounded database/schema observation.
    record safe completion metadata once, on response finish/close
    clear the request context after its owned work finishes

explicit_migration_flow():
    validate migration configuration and authorized target
    acquire the library-managed migration lock
    apply pending changes transactionally and record successful history
    close the dedicated client on success, failure or deadline
    # This flow is never called from startup or a health request.
```

Yeh connections hain, ek giant runtime function nahi. Developer commands,
application process aur external smoke client ki responsibilities alag hain.
Migration ke baad application start karna deployment/development workflow ka
decision hai; application khud schema change nahi karti. Build ko migration
command se independently bhi run kar sakte hain, bina database access ke.

## Build-time behavior (US1, US4; FR-001/003/004/011)

Build ka kaam runnable package banana hai. Runtime secrets validate karna aur
database se connect karna startup ki responsibility hai.

```text
build_package():
    verify locked dependency versions and build configuration
    derive expected ordered migration names from local migration files
    package that manifest with the application
    compile Next application and the custom Node entrypoint
    include the initial liveness route before startup verification
    exclude local secret files and credential-bearing build values
    # Do not open database connections or call external providers.
    # Importing a route/config module must not validate deployment secrets.
    return immutable runnable package
```

## Ownership and invariants

This state describes process lifecycle only. It neither creates nor modifies an interview stage or lifecycle status. Session state remains in the existing [session contract](../../interview_session/specifications/technical/session_state_machine.md).

- Validate required settings before accepting connections (FR-003/004).
- Never execute migrations as a side effect of startup or a probe (FR-009).
- Never read or log request/response bodies to produce telemetry (FR-006).
- Required storage/schema failure prevents readiness, never changes candidate data or scoring (FR-007/008).
- Test cleanup may only operate on the explicitly allocated test resource (FR-010).
- Every acquired resource has failure-path and normal shutdown cleanup (FR-013).

## Process lifecycle

```text
NEW -> VALIDATING -> INITIALIZING -> SERVING -> DRAINING -> STOPPED
              |             |
              +--> FAILED <--+
```

Readiness is a separate observation: SERVING plus healthy required storage/schema yields ready; a transient outage yields unavailable without changing process lifecycle. Recovery restores readiness after the next successful probe. DRAINING cannot become ready again; a new process is required. FAILED exits nonzero without starting listeners.

## Startup and shutdown (US1, US2; FR-003/004/013)

Missing setting aur temporarily unavailable database different failures hain.
Invalid settings par listener open nahi hoga. Valid settings ke saath database
down ho toh process liveness serve kar sakta hai; readiness unavailable hogi.

Implementation order: T005 first specifies the failing liveness test; T006 adds
the canonical Node liveness Route Handler and its dependency-free health function
with the bootstrap. This route exists before Next preparation and the US1
production-process/registry checks. T014/T015 extend the same health module with
readiness and broader compatibility coverage; they do not introduce the first
runnable App Router route. Full health acceptance remains a later gate.

```text
start(raw_settings):
    lifecycle = VALIDATING
    settings = parse_and_validate_without_logging_values(raw_settings)
    if environment is unknown or required active setting invalid:
        emit_safe_startup_failure(setting_names_and_stable_codes_only)
        lifecycle = FAILED
        exit_nonzero
    if environment is production and identity_adapter is test:
        fail_without_serving("unsafe_identity_adapter")
    lifecycle = INITIALIZING
    initialize_allowlisted_logger()
    install process-global runtime registry and AsyncLocalStorage
    # Node entrypoint and Next Node Route Handlers use the same registry.
    # Do not validate secrets or connect on route/config module import.
    try within startup_deadline:
        acquire bounded storage pool lazily
        prepare Next via public API; compose using module public interfaces
        # The minimal liveness Route Handler already exists in this build.
        register only implemented routes; do not mount domain placeholders
    on error:
        close anything already acquired within remaining startup budget
        emit_safe_startup_failure(stable_code_only)
        lifecycle = FAILED
        exit_nonzero
    listen only after successful settings validation and Next preparation
    lifecycle = SERVING

shutdown():
    lifecycle = DRAINING
    reject new readiness eligibility synchronously
    call HTTP server.close() to stop new admission before draining accepted work
    drain accepted work within shutdown_deadline
    close Next and storage pool within remaining shutdown budget
    on deadline: destroy tracked sockets/clients and exit nonzero
    clear request contexts
    lifecycle = STOPPED
```

The storage pool must not make application construction depend on a successful storage connection. A recoverable storage outage therefore allows the process to serve liveness and unavailable readiness. Invalid settings still prevent startup. Defaults from technical design: startup 60 s production/120 s development, shutdown 30 s, readiness 2000 ms, pool connect/acquire and statement 500 ms each. A hard startup deadline also terminates stuck preparation/cleanup; no background preparation may later bind a socket after failure.

## Health observations (initial liveness in US1; full health in US2; FR-007/008)

Liveness ka sawal hai “process respond kar raha hai?” Readiness ka sawal hai
“required conditions abhi available hain?” Database down hone par dono ka same
answer dena zaroori nahi. Health reads observation hain, repair operations nahi.

```text
liveness():
    if a functioning process handles the request:
        return 200, HealthStatus(status="ok", timestamp=utc_now())
    # No database, provider, schema migration, or candidate data access.

readiness():
    if lifecycle != SERVING:
        return 503, safe_health("unavailable", application="unavailable")
    try within readiness_deadline:
        acquire connection within pool_deadline
        perform minimal storage query within query_deadline
        read ordered migration ledger names without changing them
        if ledger missing or names differ from packaged expected history:
            return 503, safe_health("unavailable", schema="unavailable")
        return 200, safe_health("ok", database="ok", schema="ok")
    on storage failure or timeout:
        cancel actual query or destroy unhealthy client, always release ownership
        # Promise.race alone does not cancel SQL or a pending acquisition.
        never retry within the probe
        return 503, safe_health("unavailable", database="unavailable")
```

`safe_health` includes UTC timestamp and fixed check names/status enums only; never hosts, credentials, SQL, raw error text or actual revision values. Optional providers are not called. Paths are `/api/v1/health/live` and `/api/v1/health/ready`; mark Node Route Handlers dynamic and responses `Cache-Control: no-store`. Status values follow root OpenAPI; probes never set cookies or mutate business state. Unknown, missing, older, newer or reordered history is unavailable; do not accept only the last row as proof of compatibility.

## Route-to-function connection (US1, US2; FR-007/008/014)

Route Handler address aur HTTP response ko connect karta hai; health decision
upar ke functions ki responsibility hai. `request.method` aur `request.path`
framework-parsed routing values hain; raw URL/query ko logs mein copy nahi karte.

```text
dispatch(request):
    if request.method == GET and request.path == /api/v1/health/live:
        result = liveness()
        return uncached_json(result.http_status, result.health_body)
    if request.method == GET and request.path == /api/v1/health/ready:
        result = readiness()
        return uncached_json(result.http_status, result.health_body)
    delegate unmatched requests or unsupported methods to framework handling
    # No placeholder interview, model, voice or submission success endpoints.
    # Health responses require no login and expose no internal diagnostics.
```

## Correlation and telemetry (US2; FR-005/006)

Request A aur Request B saath chal sakti hain. Har request ka context alag rahega,
lekin us request ke asynchronous work mein same identifier available hoga.
Completion event mein fixed allowed metadata likhenge, poori request nahi.

```text
handle_request(request):
    context = create_fresh_server_request_identifier()
    bind_context_for_this_async_request_only(context)
    start_monotonic_timer()
    try:
        response = dispatch_without_observing_body_for_logging(request)
        return response
    on unexpected error:
        record_failure(stable_error_code, context.request_id)
        use existing safe API error shape where applicable
        never include exception text or request payload
    on response finish/close (once only):
        record_completion(fixed_event, method, route_template_or_unmatched,
                          safe_status, elapsed_ms, context.request_id)
    finally after owned request work finishes:
        reset_context_using_its_original_token()
```

External correlation metadata is untrusted; M0 ignores supplied request IDs and generates a fresh UUID. Completion captures its own context for finish/close callbacks; request context uses AsyncLocalStorage.run/exit semantics (not a shared mutable global). Later job producers map the internal request identifier into the existing event `correlationId` field through explicit adapters. No queue/job is produced by this feature. Request identifiers never become metric labels. New public tracing/header contracts require normal contract impact review. Framework/driver diagnostic paths must not bypass the safe logger; process tests capture stdout and stderr.

## Explicit migration (US3; FR-009)

Migration ledger applied changes ka record hai. Exclusive lock do runners ko
same database par saath migration karne se rokta hai. Failed change ko successful
history mein stamp nahi karna; transaction rollback aur safe recovery use karte hain.

```text
migrate(target_environment, requested_head):
    validate settings and authorized target without printing secrets
    open dedicated migration connection
    let verified migration library acquire its database-scoped advisory lock
    # Keep locking enabled; do not add a second independent wrapper lock.
    if lock not acquired: exit_nonzero("migration_busy")
    try:
        verify one ordered migration chain and known current history
        apply pending versioned migrations in documented transactions
        record revision only after its migration succeeds
        verify actual revision == requested_head
    on error:
        rollback current transaction where supported
        report sanitized failure; never stamp a failed revision as applied
        require documented forward fix or approved restore if DDL is not transactional
        exit_nonzero
    finally:
        release lock by closing the dedicated connection
```

Use the library's fail-fast lock acquisition, explicit `singleTransaction: true`, `checkOrder: true` and sanitized logger. Default limits: dedicated-client connection 2 s, statement 30 s, whole command 60 s. Whole-command timeout must close/destroy the actual dedicated client/process, releasing its session lock. Never retry a destructive migration automatically. Baseline establishes `public.pgmigrations` plus a no-domain SQL baseline; a second upgrade is a successful no-op. Migration failure must not start replicas, restore data automatically, stamp success or remove another environment's schema.

## Isolated test allocation and cleanup (US3; FR-010)

Test ko apna database milega. Cleanup ke waqt sirf naam ka prefix check karna
enough nahi; target server, environment aur exact allocation ownership bhi
verify hogi, taaki test kisi real environment ko delete na kar sake.

```text
allocate_test_database(test_config, run_id, worker_id):
    require explicit test environment and dedicated test-admin configuration
    require safe test server/role guard and exact approved database-name prefix
    require lowercase letters/digits/underscore and name length <= 63 bytes
    refuse any configured development/staging/production target
    allocate unique run/worker database owned by test role
    record exact allocated identity in this fixture
    migrate it to head before exercising behavior

cleanup_test_database(allocated_identity):
    require test environment, same guarded server and owned allocated identity
    refuse any name not allocated by this fixture
    close fixture connections
    drop only that database within teardown deadline
    report failed cleanup explicitly without falling back to broad deletion
```

Use real PostgreSQL for migration/transaction tests. Unit tests may use fakes. Do not claim storage behavior from an in-memory substitute. Test migration-failure fixtures and temporary tables belong only in isolated tests, never permanent domain schemas. Test setup/teardown each has a 30 s deadline; failure is reported, never converted to broad cleanup.

## Verification aggregation (US4; FR-011/012/015)

Automated check tab useful hai jab expected defects ko reject bhi kare. Sirf
green output dekhna enough nahi: required stage unavailable ya skipped hai toh
usko passed nahi bolenge. Runtime proof aur document consistency alag evidence hain.

```text
for each required verification stage:
    run the documented command with finite limits
    capture exit status and sanitized evidence
    classify as passed, failed, skipped, or unavailable
    only exit_success counts as passed
if any required stage != passed:
    do not claim acceptance or Kanban completion
after important-change review and actual acceptance evidence:
    run convergence and reconcile any new gaps
    update canonical Kanban and matching CSV only for completed cards
```

Planning document validation is separate from these runtime checks. Reviewer-owned checklist marks never establish implementation completion.

## Expected failure examples

These are planned assertions for implementation verification, not observed runs.

| Situation | Expected observation | Why |
|---|---|---|
| Required runtime setting missing | Safe startup failure; no listener | Unknown configuration ke saath traffic accept nahi karna. |
| Database unavailable after valid startup | Liveness 200; readiness 503 | Process aur required dependency ki condition alag hai. |
| Database reachable, migration history incompatible | Readiness 503; no schema mutation | Reachable storage automatically compatible storage nahi hai. |
| Optional model provider unavailable | Foundation readiness unaffected | M0 health mein unused external provider required nahi hai. |
| Two requests overlap | Separate request identifiers/contexts | Ek request ke logs doosri request se mix nahi hone chahiye. |
| Two migration commands overlap | One lock owner; other exits safely | Competing schema changes prevent karne hain. |
| Cleanup targets a database not allocated by the fixture | Refuse cleanup | Destructive operation ke liye verified ownership chahiye. |
| Normal shutdown | Stop admission, drain, close resources, exit | Accepted work aur resource ownership ko bounded cleanup chahiye. |
| Shutdown deadline expires | Force-close remaining resources; nonzero exit | Infinite waiting ko successful shutdown nahi bol sakte. |
| A required verification stage cannot run | Report unavailable; acceptance incomplete | Missing evidence ko passing evidence nahi maana jaata. |
