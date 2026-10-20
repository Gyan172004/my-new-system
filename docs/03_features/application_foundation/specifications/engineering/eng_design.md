# Application Foundation — Engineering Design

**Date:** 2026-10-17  
**Task breakdown refreshed:** 2026-10-18; existing T001–T034 and Kanban mappings retained; T035–T048 add group review/commit gates.

**Status:** Phases 1–6 locally verified; Phase 7 T031–T033 locally verified. Forty-seven of 48 tasks verified. Owner confirmed staging/production resources are not ready: T034 is deferred to deployment readiness; local T047 review and T048 commit are verified under ADR-022. K-006 awaits hosted CI; K-028 remains incomplete.
**Authority:** Canonical feature task decomposition, not an independent project tracker.  
**Inputs:** [Requirements](../../requirements/feature_req.md), [technical design](../technical/tech_design.md), [logic](../../pseudo_code/logic_and_state.md).

## Dependency readiness and task conventions

K-001 has no prerequisites. K-002 depends on K-001; current status belongs to Kanban. K-003/004/005/028 depend on K-002; K-006 on K-001 and K-002.
Within K-001, settings validation and a minimal test/tool harness establish its
workflow acceptance before the runtime skeleton starts. The Canonical Kanban
and CSV remain unchanged by this planning work. T IDs refine those cards; they
do not create project statuses.

Every production behavior change follows failing test → smallest implementation
→ focused passing tests → refactor. A test task must record the expected failure,
not merely add a file. Existing meaningful passing coverage may be identified
rather than manufactured into a failure. Failures require reproduction and root
cause evidence before a fix. Each task lists requirements, success criteria,
K mapping, dependencies and concrete future paths; commands follow below.
No application source/test/config/container files are created by this plan.
Code, test, tooling and runbook paths are relative to the project root;
`requirements/`, `specifications/` and `pseudo_code/` document paths are relative
to `docs/03_features/application_foundation/`.

Reviewer-owned checklist signoff is a prerequisite for starting implementation;
its items remain unchecked until the owner or designated reviewer evaluates them.
This is a preflight gate before T001, not permission deferred until T032.
The task T032 reconfirms that signoff and checks that accepted design and
implementation stayed aligned; it does not replace the preflight review.
Full K-028 evidence depends on the deployment workstream; T034 is a gated handoff,
not authorization for cloud provisioning or an alternative infrastructure plan.

## Group review and commit protocol

Every phase ends with two tasks: review its complete diff using the installed
skills applicable to that group, then commit the reviewed changes. Existing
T001–T034 IDs are stable; newly allocated T035–T048 are inserted at their execution
positions. Follow document order and dependencies, not numerical sorting.
Task markers below record implementation evidence; Kanban remains authoritative.
The original planning edits did not authorize implementation or an immediate commit.

For each review task, use `requesting-code-review`, assess feedback with
`receiving-code-review`, and use `verification-before-completion` for fresh
results. Review the entire group change from its starting commit through the
current tracked/untracked diff, including tests, configuration and docs. Verify
skill discovery/prerequisites; apply only relevant guidance that agrees with
canonical architecture. Unavailable guidance must be reported with a documented
review method; never claim an unavailable skill ran. Fix Critical/Important
findings, rerun affected checks and obtain review of material fixes before the
commit task. Record sanitized scope, skills actually used, findings/disposition
and exact commands/results in `docs/runbooks/foundation.md`; this is evidence,
not another status tracker. Phase 1 creates that runbook's review-evidence section;
T011 subsequently adds its operational content.

For each commit task, use `mastering-git-cli` and
`verification-before-completion`: inspect `git status --short` and the diff,
stage only explicit reviewed group paths (including new files), inspect
`git diff --cached` and `git diff --cached --check`, and rerun the group's
applicable checks after the last change. Required checks must pass; failed or
unavailable required checks block the commit, while optional/deferred checks
are reported honestly. Exclude unrelated work, secrets,
ignored working artifacts and generated caches. If staged content differs from
the reviewed scope, return to review. Use a reviewed message file with
`git commit --file <message-file>`; the placeholders below are text, never shell
commands. Inspect `git log -1 --format=fuller` and report the resulting SHA and
clean/remaining scoped changes in the handoff. Do not amend unrelated commits,
push, create issues or change Kanban status merely because a commit exists.
Record the resulting SHA in the handoff/Git history, rather than trying to embed
a commit's own SHA inside that same commit.

### Commit message template

The subject starts with the requested US/task metadata. `ID` identifies the
commit task, `K` lists affected canonical cards separated by `|`, and `GROUP`
is the two-digit phase number. Use `US=shared` for Phases 1, 2 and 7, which have
no owning user story. `type` is `feat`, `fix`, `test`, `build`, `ci`, `docs` or
`refactor` according to the actual change. The example IDs below belong to US1;
replace them with the current group's exact task IDs.

```text
<US=US1, ID=T040, K=K-002|K-028, GROUP=03> feat(foundation): <concrete result>

Feature: application_foundation
Tasks: T007, T008, T009, T010, T011, T039, T040
Why: <problem this group solves>
Changes:
- <specific behavior/files changed and relevant design rationale>
Review: T039; <reviewer, skills actually applied, findings and disposition>
Validation:
- <exact command> — <observed result>
Limitations: <failed/skipped/unavailable checks and remaining gates, or none>
```

A commit records a reviewed increment. It does not establish M0 completion or
waive the owner/designated-reviewer preflight, convergence, Kanban acceptance or
external deployment gates. Under ADR-022, local T047/T048 follow T033 without
waiting for deferred T034. Their evidence/message must retain T034/K-028 and
hosted K-006 as incomplete. T034's later evidence receives its own relevant
skill-based review, fresh verification and scoped commit before acceptance.

## Testable vertical slices and task decomposition

### Phase 1 — Setup and K-001 workflow prerequisites

Goal: establish locked tooling, tested settings validation and documented commands.
Independent evidence: `npm ci`, `npm run config:check`, `npm run format:check`,
`npm run lint`, `npm run typecheck` and `npm run test:unit` run from the documented
clean setup; invalid configuration reports safe key names only. These are future
implementation commands, not checks executed by this task-generation run.

- [x] T001 Record repository facts and pin compatible secure Node/npm/Next/React/TypeScript/tool versions in docs/development.md, .nvmrc, .npmrc, package.json and package-lock.json; wire minimal format/lint/type/unit commands and Vitest configuration. Validate locked installation without providers. **Map:** K-001; FR-001, FR-011; SC-001. **Depends on:** none.
- [x] T002 Write tests/unit/config.test.ts before the parser, quoting technical-design constraints in fixtures: APP_ENV is "mandatory and exactly `development|staging|production|test`", port "1–65535", pool size "1–10", IDENTITY_ADAPTER is "`disabled|clerk|test`, default `disabled` in M0", and configuration is "immutable after startup". Test finite positive budgets, missing runtime DATABASE_URL, build without secrets, missing unused-provider keys, test identity rejected in staging/production and rejection of unimplemented Clerk mode without fallback. Observe expected failing cases with npm run test:unit. **Map:** K-001; FR-003, FR-004, FR-012; SC-002. **Depends on:** T001.
- [x] T003 Implement src/server/config.ts and config/development.example.json, config/staging.example.json, config/production.example.json using safe non-secret names/references; never embed credential-bearing URLs, export NEXT_PUBLIC secrets or log raw validation errors. Run config tests green and refactor. **Map:** K-001, K-028; FR-003, FR-004, FR-006; SC-002. **Depends on:** T002.
- [x] T004 Complete docs/development.md and package.json workflow command discovery; validate config, format/lint/type and initial unit commands from a clean environment. K-001 must meet its acceptance before K-002 work; unavailable clean-checkout evidence is reported, never inferred from this plan. **Map:** K-001; FR-001, FR-015; SC-001. **Depends on:** T003.
- [x] T035 Review all Phase 1 changes (T001–T004) under the group review protocol using `mastering-typescript` and `vitest`. Inspect docs/development.md, package.json, package-lock.json, src/server/config.ts and tests/unit/config.test.ts and every other changed group path; record findings and fresh validation in docs/runbooks/foundation.md, resolve blocking findings and re-review material fixes. **Map:** K-001, K-028; FR-001, FR-003, FR-004, FR-006, FR-011, FR-015; SC-001, SC-002. **Depends on:** T004.
- [x] T036 Commit only the reviewed Phase 1 changes, including docs/runbooks/foundation.md evidence, under the group commit protocol using mastering-git-cli and verification-before-completion. Start the message with `<US=shared, ID=T036, K=K-001|K-028, GROUP=01>`; include the template's Why, Changes, Review, Validation and Limitations fields, inspect staged scope and report the resulting SHA. **Map:** K-001, K-028; FR-015; SC-007. **Depends on:** T035.

### Phase 2 — Foundational application composition

Goal: make the validated application runnable before story-specific extensions.
Independent evidence: lifecycle and minimal liveness tests pass; failed validation
opens no listener, and bounded shutdown closes acquired resources.

T005/T006 establish the first real App Router route before Next preparation and
US1 startup/registry tests. This minimal liveness path makes K-002 runnable; it
does not complete K-004 or remove its K-002 dependency. US2 extends the same
health module with readiness and full compatibility evidence.

- [x] T005 Write tests/unit/lifecycle.test.ts with an injected HTTP/Next adapter: config failure opens no listener, initialization failure cleans resources, startup has a finite deadline, drain prevents readiness and repeated stop is safe. Add tests/unit/health-live.test.ts for the initial canonical GET /api/v1/health/live Node Route Handler: unauthenticated 200/ok, UTC timestamp, no-store, runtime-registry access and no dependency calls. Observe failures before bootstrap/liveness implementation. **Map:** K-002; FR-002, FR-003, FR-007, FR-012, FR-013, FR-014; SC-001, SC-002, SC-003. **Depends on:** T004, T036.
- [x] T006 Implement src/server/bootstrap.ts, src/server/runtime.ts, scripts/build-server.mjs, scripts/build-migration-manifest.ts and next.config.ts; add src/server/health.ts with the dependency-free liveness function and src/app/api/v1/health/live/route.ts as the first real uncached Node Route Handler before Next preparation/build. Compile the custom Node server with external framework packages, explicitly invoke config before listen, install the shared process registry, lazy resource factories and bounded signal cleanup. Keep route imports/build secret-free and standalone output disabled; run lifecycle and health-live tests green. Full readiness and K-004 acceptance remain T014–T024. **Map:** K-002; FR-002, FR-003, FR-007, FR-013, FR-014; SC-001, SC-003. **Depends on:** T005.
- [x] T037 Review all Phase 2 changes (T005–T006) under the group review protocol using `mastering-typescript`, `vercel-react-best-practices` for Node Route Handler boundaries, and `vitest`. Inspect src/server/bootstrap.ts, src/server/runtime.ts, src/app/api/v1/health/live/route.ts and tests/unit/lifecycle.test.ts and every other changed group path; record findings and fresh validation in docs/runbooks/foundation.md, resolve blocking findings and re-review material fixes. **Map:** K-002; FR-002, FR-003, FR-007, FR-013, FR-014; SC-001, SC-002, SC-003. **Depends on:** T006.
- [x] T038 Commit only the reviewed Phase 2 changes, including docs/runbooks/foundation.md evidence, under the group commit protocol using mastering-git-cli and verification-before-completion. Start the message with `<US=shared, ID=T038, K=K-002, GROUP=02>`; include the template's Why, Changes, Review, Validation and Limitations fields, inspect staged scope and report the resulting SHA. **Map:** K-002; FR-015; SC-007. **Depends on:** T037.

### Phase 3 — US1: reproducible and bounded service

Priority: P1. Goal: a developer can start and change the service reproducibly.
Prerequisite: Phases 1–2 and their acceptance evidence.

Independent proof: production build starts with validated settings, rejects unsafe configuration, and rejects forbidden imports. MVP scope is the reproducible operational skeleton; candidate experience is deferred.

- [x] T007 [US1] Write tests/architecture/boundaries.test.ts, tests/architecture/client-imports.test.ts and tests/architecture/fixtures/ for forbidden private repository imports, domain-to-provider calls, client-to-server leaks and API/domain candidate-code execution primitives; first observe fixtures rejected/allowlisted cases accepted. **Map:** K-002; FR-002, FR-012, FR-014; SC-006. **Depends on:** T006, T038.
- [x] T008 [US1] Implement .dependency-cruiser.cjs and src/modules/README.md ownership/public.ts rules aligned with HLD; map all domain boundaries without generating business logic or product endpoints. Run npm run test:architecture including negative fixtures, then refactor. **Map:** K-002; FR-002, FR-014; SC-006. **Depends on:** T007.
- [x] T009 [US1] Write separate production cases in tests/process/startup.test.ts and development cases in tests/process/hmr.test.ts, sharing tests/helpers/process.ts. Production cases build/start the custom server, reject invalid config before port binding, omit DB/provider build credentials, verify the actual liveness route shares the bootstrap registry, and capture secret-free stdout/stderr. Dev HMR cases run npm run dev on an allocated port in an owned disposable work copy; mutate a Next-watched health module (never the custom entrypoint) so the existing liveness response carries a changed valid UTC timestamp fixture, await that observable reload acknowledgement, and repeat twice. Before the HMR baseline, test-owned instrumentation acquires an injected fake resource through the actual shared registry and asserts exactly one factory acquisition. Request that resource again after each reload and assert identical handle identity, acquisition count still exactly one, stable process identity and a single listener; no live DB or production test endpoints/log fields are needed. Bound each reload wait to 30 s and each development startup to 120 s; in finally restore/remove only owned fixture files, stop child processes within the 30 s shutdown budget and release the port. Observe expected failures before runtime fixes; never mutate the real checkout. **Map:** K-002, K-028; FR-003, FR-004, FR-012, FR-013; SC-001, SC-002. **Depends on:** T008.
- [x] T010 [US1] Complete src/server/bootstrap.ts and src/server/runtime.ts against observed production startup and development HMR failures, using a process-global Symbol registry and bounded startup/drain. Run npm run build plus tests/process/startup.test.ts and tests/process/hmr.test.ts; prove the real route shares the registry and reloads do not reacquire injected resources or duplicate listeners. Keep lazy DB/provider factories free of import-time work; no test-only production endpoints or diagnostic fields. **Map:** K-002, K-028; FR-002, FR-003, FR-013; SC-001, SC-002. **Depends on:** T009.
- [x] T011 [US1] Document environment/resource/credential separation, TLS verification, Secrets Manager injection references, runtime versus execution task-role ownership, rotation/restart and redacted evidence requirements in docs/runbooks/foundation.md; extend tests/unit/config.test.ts for TLS and adapter guard failures. Implement only tested local guards; leave actual cloud evidence to T034. **Map:** K-028; FR-004, FR-006, FR-015; SC-002, SC-007. **Depends on:** T010.
- [x] T039 [US1] Review all Phase 3 changes (T007–T011) under the group review protocol using `mastering-typescript`, `vercel-react-best-practices` for server/client boundaries, and `vitest`. Inspect src/server/runtime.ts, .dependency-cruiser.cjs, tests/architecture/, tests/process/startup.test.ts, tests/process/hmr.test.ts and docs/runbooks/foundation.md and every other changed group path; record findings and fresh validation in docs/runbooks/foundation.md, resolve blocking findings and re-review material fixes. **Map:** K-002, K-028; FR-002, FR-003, FR-004, FR-006, FR-012, FR-013, FR-014, FR-015; SC-001, SC-002, SC-006, SC-007. **Depends on:** T011.
- [x] T040 [US1] Commit only the reviewed Phase 3 changes, including docs/runbooks/foundation.md evidence, under the group commit protocol using mastering-git-cli and verification-before-completion. Start the message with `<US=US1, ID=T040, K=K-002|K-028, GROUP=03>`; include the template's Why, Changes, Review, Validation and Limitations fields, inspect staged scope and report the resulting SHA. **Map:** K-002, K-028; FR-015; SC-007. **Depends on:** T039.

### Phase 4 — US2: observable health and safe failures

Priority: P1. Goal: an operator can distinguish liveness from readiness and trace
failures without exposing candidate or secret data. Requires the shared runtime
from US1; the pool/deadline adapter gets real-storage evidence in T016, while migrated-schema readiness evidence follows US3.

Independent proof: injected healthy/failing dependencies produce canonical health output, and concurrent telemetry canaries stay private. Actual-storage readiness acceptance is integrated after US3.

- [x] T012 [US2] Write tests/unit/request-context.test.ts, tests/unit/logger.test.ts and tests/unit/http.test.ts for the RequestContext constraints "Server UUID `requestId`, monotonic start" and "Async request scope, always cleared": fresh server IDs, ignored malicious input IDs, concurrent isolation, context reset after throw/cancel, unmatched-route constant and absence of planted tokens/body/query/error secrets. Observe failures before telemetry code. **Map:** K-003; FR-005, FR-006, FR-012; SC-004. **Depends on:** T010, T040.
- [x] T013 [US2] Implement src/server/request-context.ts, src/server/logger.ts and src/server/http.ts with AsyncLocalStorage via runtime registry, Pino allowlisted bounded events, no request serializer/raw URL/error text, and context cleanup in finally. Wire bootstrap completion handling without reading bodies; run focused tests green. **Map:** K-003; FR-005, FR-006; SC-004. **Depends on:** T012.
- [x] T014 [US2] Extend coverage in tests/unit/health.test.ts and tests/contract/health.test.ts against root contracts/api/v1_openapi.yaml: retain tests/unit/health-live.test.ts regressions; quote HealthStatus constraints `required: [status, timestamp]`, `enum: [ok, degraded, unavailable]`, timestamp `format: date-time`, and optional checks values `enum: [ok, degraded, unavailable, skipped]`. Verify effective /api/v1 paths, no auth, no-store cache policy, mandatory failure, optional outage, exact ordered schema mismatch and timeout; foundation emits only its documented ok/unavailable outcomes. Observe newly missing readiness/orchestration cases fail before implementation; do not recreate the already passing liveness slice. **Map:** K-004; FR-007, FR-008, FR-012, FR-014; SC-003. **Depends on:** T013.
- [x] T015 [US2] Extend src/server/health.ts with readiness orchestration and add src/app/api/v1/health/ready/route.ts as an uncached Node adapter, preserving the existing liveness route. Run unit/contract cases green. Before T016, write tests/unit/test-services.test.ts for Compose separation/loopback bindings and finite health checks, observe missing configuration fail, then introduce compose.yaml with separate local development db and dedicated test-db PostgreSQL services, distinct volumes/roles/loopback ports and a reviewed pinned PostgreSQL 17 image digest. Document exact commands and non-secret configuration names in docs/runbooks/foundation.md, including docker compose up -d db test-db and a 30 s test-service health deadline. Verify Compose configuration and dedicated test-service availability without provisioning cloud resources. Liveness remains dependency-free; readiness uses an injected bounded DB/schema adapter. **Map:** K-004, K-005; FR-001, FR-007, FR-008, FR-010, FR-014; SC-003. **Depends on:** T014.
- [x] T016 [US2] Using T015's dedicated test-db service, first write tests/unit/test-database-guards.test.ts for APP_ENV=test, exact approved host/port, dedicated test-admin role, lowercase foundation_test_ names of at most 63 bytes, unique run/worker ownership, refusal of non-test targets and 30 s allocation/cleanup limits. Observe guard failures, then implement the initial shared tests/helpers/test-database.ts fixture and run guard tests green. Allocate an owned empty test database without migrations: no production migration runner or schema baseline is available until T022. Write real pool/deadline cases in tests/integration/database.test.ts and observe missing-adapter failures before implementing src/server/database.ts and src/server/schema-version.ts: lazy pool, 500 ms connect/acquire and statement bounds, 2000 ms readiness deadline, manifest/ledger comparison, actual cancellation or destroyed client and finally release. Exercise SQL deadlines with test-only fixture queries; absent ledger reports unavailable without running migrations or creating production metadata. T019/T020 extend this same fixture; do not create a parallel helper. Run focused guard and real-driver cases green. **Map:** K-004, K-005; FR-008, FR-009, FR-010, FR-012, FR-013; SC-003, SC-005. **Depends on:** T015.
- [x] T017 [US2] Add tests/process/privacy.test.ts capturing both stdout/stderr from the production build with parallel requests, query/header/body canaries, raw dependency exceptions, cancellations and absent provider credentials; demonstrate leak/control failures if present before corrections. Use tests/helpers/process.ts synthetic fault fixtures, never new production test endpoints. **Map:** K-003, K-004; FR-005, FR-006, FR-012; SC-004. **Depends on:** T016.
- [x] T018 [US2] Apply evidence-based telemetry/error fixes in src/server/http.ts, src/server/logger.ts, src/server/database.ts and next.config.ts; suppress framework URL/payload diagnostics and handle idle pool errors safely. Run focused unit/contract/privacy checks green; report any framework leakage as a blocker. **Map:** K-003, K-004; FR-005, FR-006, FR-007; SC-003, SC-004. **Depends on:** T017.
- [x] T041 [US2] Review all Phase 4 changes (T012–T018) under the group review protocol using `mastering-typescript`, `vercel-react-best-practices` for uncached health handlers, `vitest`, `docker-compose-patterns` for early test-service setup, and `supabase-postgres-best-practices` for any database SQL. Inspect src/server/http.ts, src/server/logger.ts, src/server/database.ts, src/app/api/v1/health/ and tests/process/privacy.test.ts and every other changed group path; record findings and fresh validation in docs/runbooks/foundation.md, resolve blocking findings and re-review material fixes. **Map:** K-003, K-004, K-005; FR-005, FR-006, FR-007, FR-008, FR-009, FR-012, FR-013, FR-014; SC-003, SC-004. **Depends on:** T018.
- [x] T042 [US2] Commit only the reviewed Phase 4 changes, including docs/runbooks/foundation.md evidence, under the group commit protocol using mastering-git-cli and verification-before-completion. Start the message with `<US=US2, ID=T042, K=K-003|K-004|K-005, GROUP=04>`; include the template's Why, Changes, Review, Validation and Limitations fields, inspect staged scope and report the resulting SHA. **Map:** K-003, K-004, K-005; FR-015; SC-007. **Depends on:** T041.

### Phase 5 — US3: explicit migrations and isolated storage

Priority: P1. Goal: evolve storage repeatably without touching another environment.
Requires US2's database/schema adapter. Migration commands and fixture cleanup
remain explicit tooling, never startup or probe side effects.

Independent proof: empty/repeated/failed/concurrent migration and two concurrent test runs succeed or fail safely against real PostgreSQL without touching non-test resources.

- [x] T019 [US3] Extend tests/unit/test-database-guards.test.ts and tests/integration/test-isolation.test.ts against the shared tests/helpers/test-database.ts introduced in T016. Cover APP_ENV=test, exact approved host/port and dedicated role, allocated ownership, lowercase foundation_test_ names at most 63 bytes, concurrent run/worker independence, allocation failure, connection cleanup and refusal to drop unowned or non-test databases. Observe newly unsupported isolation cases fail before extending the fixture; retain T016 passing regressions. **Map:** K-005; FR-010, FR-012; SC-005. **Depends on:** T018, T042.
- [x] T020 [US3] Consolidate and extend the existing tests/helpers/test-database.ts fixture from T016, and expose it through scripts/test-database.ts; do not replace it with a second implementation. Reuse dedicated test-admin configuration, unique owned databases, safe identifier quoting, secret-free output and 30 s setup/teardown deadlines; pass all T019 cases and existing database tests. Use explicit fixture purposes: pool/deadline, isolation, migration-under-test and no-ledger readiness allocate empty storage; only scenarios requesting prepared-schema readiness invoke an injected actual T022 migration initializer. Migration-under-test cases invoke the runner themselves so the fixture cannot pre-consume first-apply behavior; T021 can observe the missing runner fail before T022 implements it. Never hand-create or edit the production migration ledger to unblock early tests. **Map:** K-005; FR-010; SC-005. **Depends on:** T019.
- [x] T021 [US3] Write tests/integration/migrations.test.ts with real PostgreSQL: empty apply, repeated no-op, transactional failure, immutable ordered history, fail-fast concurrent migration, timeout lock release and recovery; test-only failing revisions stay in temporary fixture directories. Observe failures before the migration runner/baseline. **Map:** K-005; FR-009, FR-010, FR-012; SC-005. **Depends on:** T020.
- [x] T022 [US3] Implement scripts/migrate.ts and migrations/1781654400000_foundation.sql with legacy Up/Down Migration sections and no domain tables; use stable verified node-pg-migrate, explicit singleTransaction/checkOrder, lock enabled, dedicated MIGRATION_DATABASE_URL, safe logging, 2 s connect/30 s statement/60 s command limits and actual client/process termination on timeout. Build expected revision manifest; run migration tests green. **Map:** K-005; FR-009; SC-005. **Depends on:** T021.
- [x] T023 [US3] Complete tests/integration/readiness.test.ts for no ledger, missing/older/newer/unknown history, pool exhaustion/real query timeout, restored DB and optional provider outages using isolated fixtures; run existing pure health tests alongside real-driver tests. Identify any difference from the promised status/deadline behavior. **Map:** K-004, K-005; FR-007, FR-008, FR-009, FR-010; SC-003, SC-005. **Depends on:** T022.
- [x] T024 [US3] Resolve only observed driver/schema/migration integration failures in src/server/database.ts, src/server/schema-version.ts and scripts/migrate.ts, then run all storage/probe/isolation cases concurrently and refactor. Verify no leaked active queries, locks, connections or foreign databases altered. **Map:** K-004, K-005; FR-008, FR-009, FR-010, FR-013; SC-003, SC-005. **Depends on:** T023.
- [x] T043 [US3] Review all Phase 5 changes (T019–T024) under the group review protocol using `supabase-postgres-best-practices`, `mastering-typescript` and `vitest`; retain pg and explicit SQL, without adopting ORM/platform examples. Inspect src/server/database.ts, src/server/schema-version.ts, scripts/migrate.ts, migrations/1781654400000_foundation.sql and tests/integration/ and every other changed group path; record findings and fresh validation in docs/runbooks/foundation.md, resolve blocking findings and re-review material fixes. **Map:** K-004, K-005; FR-007, FR-008, FR-009, FR-010, FR-012, FR-013; SC-003, SC-005. **Depends on:** T024.
- [x] T044 [US3] Commit only the reviewed Phase 5 changes, including docs/runbooks/foundation.md evidence, under the group commit protocol using mastering-git-cli and verification-before-completion. Start the message with `<US=US3, ID=T044, K=K-004|K-005, GROUP=05>`; include the template's Why, Changes, Review, Validation and Limitations fields, inspect staged scope and report the resulting SHA. **Map:** K-004, K-005; FR-015; SC-007. **Depends on:** T043.

### Phase 6 — US4: regression gates and executable smoke journey

Priority: P1. Goal: reject regressions with observed automated evidence.
Requires US1–US3 so process/container checks exercise the actual integrated service.

Independent proof: required pipeline stages run, planted regressions fail, a built process/container completes the health/outage/shutdown journey, and unavailable stages are reported honestly.

- [x] T025 [US4] Write tests/ci/negative-controls.test.ts for required commands and nonzero stage propagation; define deliberate unit/lint/boundary failures in isolated temporary copies. Observe missing command/fail-open failures before the CI pipeline implementation. **Map:** K-006; FR-011, FR-012; SC-006. **Depends on:** T024, T044.
- [x] T026 [US4] Implement .github/workflows/ci.yml and package.json scripts for npm ci, format/lint/type, unit, real-DB integration, canonical contract, architecture, build, process tests, npm audit and Gitleaks. Pin workflow actions by reviewed commit and scanners by version/digest, use nonproduction DB service, no paid-provider secrets; scanners/network/service failures must fail required stages. **Map:** K-006; FR-011; SC-006. **Depends on:** T025.
- [x] T027 [US4] Add Dockerfile and .dockerignore and extend the compose.yaml introduced in T015 for ordinary Next output/custom entrypoint, non-root runtime and exec-form signal delivery. Preserve the separate existing db and test-db services, owned data volumes, role/port isolation and reviewed image pins; do not recreate test storage under a different helper or relax guards. Include production dependencies, compiled bootstrap and revision manifest; exclude .env/credentials/docs notes. Build without runtime secrets; add pinned Trivy image/filesystem scanning stages and inspect image layers/config for canaries. **Map:** K-002, K-006; FR-001, FR-004, FR-011; SC-001, SC-006. **Depends on:** T026.
- [x] T028 [US4] Implement tests/process/foundation.test.ts and tests/process/shutdown.test.ts plus scripts/verify-foundation.ts: clean install/build/migrate/start, uncached live/ready, DB outage/recovery, no-auth health, SIGTERM readiness/drain/closed resources, forced-deadline failure, cleanup. Use real process/socket observations; capture expected red tests before any needed runtime corrections. **Map:** K-004, K-006; FR-007, FR-008, FR-012, FR-013; SC-001, SC-003. **Depends on:** T027.
- [x] T029 [US4] Fix only reproduced process/build/container integration failures in src/server/bootstrap.ts, src/server/runtime.ts, src/server/http.ts and Dockerfile; run production process and container smoke checks green, then refactor. Keep cloud deployment and candidate UI out of this slice. **Map:** K-002, K-004, K-006; FR-003, FR-006, FR-008, FR-013; SC-001, SC-002, SC-003, SC-004. **Depends on:** T028.
- [x] T030 [US4] Implement scripts/verify-ci-negative-controls.ts; run npm run verify:ci-failures in disposable work copies and prove deliberate unit/lint/boundary mutations each cause nonzero pipeline-stage outcome. Remove only owned temporary fixtures; do not corrupt the real source or report local simulation as a hosted CI run. **Map:** K-006; FR-011, FR-012; SC-006. **Depends on:** T029.
- [x] T045 [US4] Review all Phase 6 changes (T025–T030) under the group review protocol using `docker-build-strategies`, `docker-compose-patterns`, `mastering-github-cli` for workflow guidance, `mastering-typescript` and `vitest`. Inspect Dockerfile, compose.yaml, .github/workflows/ci.yml, scripts/verify-ci-negative-controls.ts and tests/process/ and every other changed group path; record findings and fresh validation in docs/runbooks/foundation.md, resolve blocking findings and re-review material fixes. **Map:** K-002, K-004, K-006; FR-001, FR-003, FR-004, FR-006, FR-007, FR-008, FR-011, FR-012, FR-013; SC-001, SC-002, SC-003, SC-004, SC-006. **Depends on:** T030.
- [x] T046 [US4] Commit only the reviewed Phase 6 changes, including docs/runbooks/foundation.md evidence, under the group commit protocol using mastering-git-cli and verification-before-completion. Start the message with `<US=US4, ID=T046, K=K-002|K-004|K-006, GROUP=06>`; include the template's Why, Changes, Review, Validation and Limitations fields, inspect staged scope and report the resulting SHA. **Map:** K-002, K-004, K-006; FR-015; SC-007. **Depends on:** T045.

### Phase 7 — Review, reconciliation and operational handoff

Goal: reconcile observed results and review feedback before completion claims.
Independent evidence: important-change review and convergence are recorded,
each completed Kanban card has its own passing evidence, and external deployment
gates remain open until verified. T034 is an externally gated handoff.

- [x] T031 Finalize docs/development.md and docs/runbooks/foundation.md with exact implemented commands, sanitized evidence, migration fail/forward-fix/approved-restore procedure, build/start/stop and required secret-role references. Preserve explicit unexecuted/cloud gates; do not claim backup/restore or K-028 complete from local tests. **Map:** K-001, K-005, K-028; FR-001, FR-004, FR-009, FR-015; SC-001, SC-007. **Depends on:** T030, T046.
- [x] T032 Reconfirm the owner/designated reviewer pre-implementation signoff on requirements/feature_req.md CHK001–CHK024; obtain important-change code review against specifications/technical/tech_design.md, specifications/engineering/eng_design.md and pseudo_code/logic_and_state.md. Renew requirements review for material accepted changes; never treat this late review as a substitute for the pre-T001 gate. Discover available review skills before use; assess feedback technically and reconcile accepted changes before claiming acceptance. **Map:** K-001, K-002, K-003, K-004, K-005, K-006, K-028; FR-002, FR-006, FR-014, FR-015; SC-007. **Depends on:** T031.
- [x] T033 Execute required commands and capture exact observed results in docs/runbooks/foundation.md; run $speckit-converge and reconcile real gaps with this engineering design. Update project_management/kanban_board.md and project_management/kanban_tasks.csv only for cards whose own acceptance actually passes; leave incomplete environment evidence open. **Map:** K-001, K-002, K-003, K-004, K-005, K-006, K-028; FR-011, FR-012, FR-015; SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007. **Depends on:** T032.
- [ ] T034 [Deferred to deployment readiness; independent of local T047/T048] Collect redacted staging/production resource separation, Secrets Manager injection/rotation and least-privilege task-role evidence into docs/runbooks/foundation.md when the deployment workstream is ready. Read-only verify supplied resource references; do not provision infrastructure from this foundation task. Record unresolved gates in the existing K-028 card/CSV; it cannot become Done before evidence passes. Review the later evidence with requesting-code-review and relevant aws-iam/aws-secrets-manager/aws-containers guidance, verify exact redacted results, and commit only reviewed evidence under the structured group protocol before acceptance. **Map:** K-028; FR-004, FR-015; SC-007. **Depends on:** T033 plus deployment-team environment/region/network decisions and authorized existing-resource access.
- [x] T047 Review the local Phase 7 changes (T031–T033 and the ADR-022 deferral amendment) under the group review protocol using `mastering-typescript`, `vitest` and relevant earlier-group skills; use `aws-iam`, `aws-secrets-manager` and `aws-containers` only for the authorized read-only external evidence. Inspect docs/development.md, docs/runbooks/foundation.md, project_management/kanban_board.md and project_management/kanban_tasks.csv and every other changed group path; record findings and fresh validation in docs/runbooks/foundation.md, resolve blocking findings and re-review material fixes. **Map:** K-001, K-002, K-003, K-004, K-005, K-006, K-028; FR-002, FR-004, FR-006, FR-011, FR-012, FR-014, FR-015; SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007. **Depends on:** T033. Deferred T034 evidence is excluded from local acceptance and remains a release gate.
- [x] T048 Commit only the reviewed local Phase 7 changes, including docs/runbooks/foundation.md evidence, under the group commit protocol using mastering-git-cli and verification-before-completion. Start the message with `<US=shared, ID=T048, K=K-001|K-002|K-003|K-004|K-005|K-006|K-028, GROUP=07>`; include the template's Why, Changes, Review, Validation and Limitations fields, inspect staged scope and report the resulting SHA. **Map:** K-001, K-002, K-003, K-004, K-005, K-006, K-028; FR-015; SC-007. **Depends on:** T047.

## Dependency graph, parallel opportunities and delivery strategy

| Task group | IDs | Count | Independent acceptance focus |
|---|---|---|---|
| Setup | T001–T004, T035–T036 | 6 | Locked tooling/settings, review and scoped commit |
| Foundation | T005–T006, T037–T038 | 4 | Bounded process/minimal liveness, review and scoped commit |
| US1 (P1) | T007–T011, T039–T040 | 7 | Production-build start, configuration rejection, module-boundary failures and local environment guards |
| US2 (P1) | T012–T018, T041–T042 | 9 | Canonical live/ready outcomes, concurrent request isolation and no telemetry canary leakage; real-storage readiness awaits US3 |
| US3 (P1) | T019–T024, T043–T044 | 8 | Real PostgreSQL migration repeatability/failure/locking, exact schema compatibility and owned concurrent test databases |
| US4 (P1) | T025–T030, T045–T046 | 8 | All required stages execute, planted regressions fail, built process/container health and shutdown journey passes |
| Review/handoff | T031–T034, T047–T048 | 6 | Observed evidence, code review, convergence and externally gated environment verification |
| Total | T001–T048 | 48 | Task generation does not establish implementation completion |

The delivery sequence is deliberately serial for a solo developer. Phase 1
makes K-001 verifiable before K-002. US1 precedes US2; US2 proves orchestration with fakes and pool/deadline behavior with its guarded
test DB before US3 supplies the real migration path; US4 then integrates the
production process/container. T034 additionally waits for external deployment
inputs, independently of the local review/commit pair after T033 (ADR-022). T012 retains T010
as its runtime prerequisite and now additionally requires the US1 commit T040.
Each next phase starts only after the preceding phase review/commit pair passes.
No whole task is marked `[P]`: task execution follows one active task at a time, and shared runtime
changes and test-first acceptance pairs remain sequential.

```mermaid
flowchart TD
    A[Preflight review] --> B[Setup T001–T004 then review T035 and commit T036]
    B --> C[Foundation T005–T006 then review T037 and commit T038]
    C --> D[US1 T007–T011 then review T039 and commit T040]
    D --> E[US2 T012–T018 then review T041 and commit T042]
    E --> F[US3 T019–T024 then review T043 and commit T044]
    F --> G[US4 T025–T030 then review T045 and commit T046]
    G --> H[Review and convergence T031–T033]
    H --> I[T034 / K-028 external evidence]
    J[Deployment decisions and authorized access] --> I
    H --> L[Local review T047 and commit T048]
    I --> M[Review and commit real evidence before release]
```

This diagram is the recommended story order; each task's `Depends on` field
defines its hard task dependencies. All stories are P1, so dependencies determine
their order. US2 has unit/contract and real pool/deadline evidence before US3;
full migrated-schema readiness acceptance requires US3. Reaching US1 alone is an operational MVP, not M0 completion.

After prerequisites stabilize, independent test authorship can be split without
claiming production tasks are independent: US1 boundary fixtures and startup
fixtures, US2 telemetry cases and health-schema cases, US3 migration fixtures and
unsafe-cleanup fixtures, US4 scanner configuration and disposable negative-control
fixtures. Each pair targets separate test/config paths; run integration and
shared-source mutations sequentially. These are optional examples, not agent
spawning or concurrent implementation authorization.

| Story | Possible separate-file work after the relevant prerequisites | Coordination limit |
|---|---|---|
| US1 | `tests/architecture/boundaries.test.ts` fixtures and `tests/process/startup.test.ts` fixtures after T038 | Execute T007–T010 acceptance in order; both depend on runtime wiring |
| US2 | `tests/unit/logger.test.ts` canaries and `tests/contract/health.test.ts` schema fixtures after T040 | Keep logger/bootstrap changes and T012–T018 red/green evidence sequential |
| US3 | `tests/integration/migrations.test.ts` fixtures and `tests/integration/test-isolation.test.ts` unsafe-target fixtures after T042 | Real database tests require guarded allocations; migration verification waits for T022 |
| US4 | Scanner settings in `.github/workflows/ci.yml` and disposable fixtures for `scripts/verify-ci-negative-controls.ts` after T044 | Aggregate acceptance waits for actual commands/container; shared workflow edits are coordinated |

These are planning examples of separable fixture preparation, not `[P]` execution
tasks, sub-agent instructions or claims that an incomplete predecessor can be skipped.

Deliver the smallest developer/operator slice first: configuration validation,
custom server lifecycle, minimal canonical liveness route and empty modular
boundaries (US1), including review/commit pairs T035–T040. Extend health with
readiness and safe logging (US2), then real migration/test-storage workflow (US3),
then CI and executable smoke evidence (US4). No product route is claimed by the skeleton. Future feature
implementation begins only after its documented hard prerequisites pass.

## Planned commands and validation journey

**These commands are implementation deliverables.** At initial planning
(2026-10-17), package.json and the application did not exist. Phases 1–6 have
subsequently implemented the names below; `npm run` discovers the current scripts.
Use the development guide/runbook for exact observed results and open gates. Follow commands
from the project root, with the pinned Node/npm versions, container runtime,
explicit safe development settings and dedicated PostgreSQL test service.
Never paste credentials into commands, docs or evidence.

| Command | Required behavior/evidence |
|---|---|
| `npm ci` | Locked dependency installation; reject package/lock drift |
| `npm run config:check` | Validate runtime settings without values in output; no listening socket or DB query |
| `npm run format:check` | Prettier check, nonzero on formatting drift |
| `npm run lint` | ESLint directly; Next build is not a substitute |
| `npm run typecheck` | Strict TypeScript check |
| `npm run test:unit` | Config, lifecycle, HTTP, health, logger and concurrent context fixtures |
| `npm run test:architecture` | Dependency rules and negative fixtures, client/server secret boundary |
| `npm run db:migrate` | Dedicated explicit migration runner, locking and deadlines, real PostgreSQL |
| `npm run test:integration` | Guarded test DB allocation, pool/query failure, migration, isolation and real readiness |
| `npm run test:contract` | Health producer responses against root OpenAPI paths/schema/enums/auth exceptions |
| `npm run build` | Manifest generation + `next build` + custom entrypoint compilation; no DB/provider runtime credentials required |
| `npm run dev` | Custom server in development mode, bounded startup and no duplicate HMR resources |
| `npm start` | Built custom server, NODE_ENV=production, runtime APP_ENV settings, no automatic migrations |
| `npm run test:process` | Production subprocess startup/privacy/drain/health plus separate development HMR, with owned-copy mutation and bounded cleanup |
| `npm run verify:foundation` | Orchestrate local install/build/migrate/start/probe/outage/recovery/stop with owned cleanup |
| `npm run verify:ci-failures` | Isolated deliberate test/lint/boundary failures each detected with nonzero stage exit |
| `npm audit --audit-level=high` | Required dependency security gate; scanner/service unavailability fails stage |
| `npm run scan:secrets` | Pinned Gitleaks filesystem scan; works without Git metadata; no values printed in evidence |
| `npm run container:build` | Ordinary Next/custom-server image, non-root, no secret-bearing build args or layers |
| `npm run scan:image` | Pinned Trivy image scan; HIGH/CRITICAL fail; database/download failure is unavailable, never pass |
| `npm run scan:filesystem` | Pinned Trivy filesystem scan for applicable dependency/config issues with the same reporting rule |
| `npm run verify:ci` | Aggregate all required stages including integration, process, container and security checks; never use continue-on-error to claim acceptance |

Clean-environment journey: provision only local/test storage via documented
`docker compose up -d db`, install locked dependencies, configure development
settings through the local untracked mechanism, run config checks, explicitly
migrate, build, start and query `/api/v1/health/live` and `/api/v1/health/ready`.
Expect 200/ok with no authentication. Stop the DB: live remains 200; ready becomes
503 within 2000 ms and reveals only safe checks. Restart DB: readiness recovers.
Repeat probes across schema changes and time to ensure responses are not cached.
Run required verification, then send SIGTERM: no new admission, draining state
observed internally, admitted work bounded, no leaked process/pool and successful
normal exit. A deliberately stalled drain must terminate nonzero within 30 s.
The process harness owns children/ports and tears them down in finally. Container
smoke exercises the same entrypoint and signal delivery.

## Evidence matrix

| Requirement | Task evidence | Acceptance |
|---|---|---|
| FR-001 | T001, T004, T027–T031 | SC-001; clean workflow with exact commands |
| FR-002 | T005–T010, T032 | US1; no forbidden fixture imports |
| FR-003 | T002, T003, T005, T006, T009, T010 | SC-002; rejected unsafe config before listener |
| FR-004 | T003, T011, T027, T031, T034 | Local separation guards plus explicit external K-028 evidence |
| FR-005 | T012, T013, T017, T018 | SC-004; request separation and bounded correlation |
| FR-006 | T003, T011–T013, T017, T018, T029, T032 | SC-004; zero planted sensitive values in stdout/stderr/artifacts |
| FR-007 | T005, T006, T014, T015, T018, T023, T028 | SC-003; canonical probe schema/paths/no auth/no cache |
| FR-008 | T014–T016, T023, T024, T028, T029 | SC-003; mandatory outage/schema/deadline and recovery |
| FR-009 | T016, T021–T024, T031 | SC-005; locked transactional migration and safe recovery |
| FR-010 | T015, T016, T019–T021, T023, T024 | SC-005; concurrent owned test DBs and unsafe cleanup refusal |
| FR-011 | T001, T025–T027, T030, T033 | SC-006; all required checks + negative controls |
| FR-012 | T002, T005, T007, T009, T012, T014, T017, T019, T021, T025, T028, T030, T033 | Red/green evidence, real integration and process checks |
| FR-013 | T005, T006, T009, T010, T016, T024, T028, T029 | SC-003; bounded startup/query/drain and actual cleanup |
| FR-014 | T005–T008, T014, T015, T032 | Root-contract compatibility; policy boundaries retained |
| FR-015 | T004, T011, T031–T034 | SC-007; review/convergence/true Kanban acceptance |

All seven success criteria have work mapping: SC-001 workflow/process;
SC-002 configuration; SC-003 health/lifecycle; SC-004 privacy/context;
SC-005 storage isolation; SC-006 CI controls; SC-007 review/status/evidence.
No business KPI or provisional production SLO is claimed by this mapping.

## Migrations, recovery and rollout

M0 baseline creates only migration metadata and its no-domain baseline record.
Explicit apply is repeatable. Transactional failure rolls back the failing work;
readiness stays unavailable for a missing/incompatible ledger. Inspect sanitized
state, correct with a reviewed forward migration and reapply. Never edit applied
history, stamp a failed migration as complete, automatically run down in production
or restore without approved target/data-loss decisions. Future nontransactional
DDL requires a documented compensating/recovery plan in its owning feature.

Roll out locally and in CI first. The ordinary image must be able to build without
runtime secrets; secrets enter only the runtime process. Verify startup, health,
DB failure/recovery and shutdown. Actual AWS account/region/network/provisioning,
CI hosting credentials, RDS sizing, external provider access and deployment are
outside this documentation authorization. K-028 handoff evidence includes separate
resource/secret references, least privilege and rotation with sensitive values
removed. K-026 owns measured production restore/rollback/load/alerting evidence.

## Review and completion gates

Before implementation: owner/designated reviewer evaluates the canonical CHK
checklist and four documents; resolve material changes in the existing ADR/contract
sources. The built-in spec-quality check is 16/16; that is writing quality only.
Superpowers was unavailable during the original 2026-10-17 planning. The owner
subsequently authorized stack-skill installation on 2026-10-18; Superpowers,
PostgreSQL, Docker, TypeScript/Next.js and AWS sources/discovery links are present
in this workspace. The untracked `skills/README.md`, `skills/sources.lock.json`
and `skills/scripts/manage_skills.py` belong to a separate setup increment and
are excluded from T048; a clean checkout of this commit does not contain them.
Only where that setup is present, recheck it with
`python3 skills/scripts/manage_skills.py`; otherwise report guidance unavailable
and document the review method. Verify runtime prerequisites before applying
guidance. Skill setup is not a prerequisite for running the application's npm
checks. Installation does not authorize implementation, cloud
mutations or stack changes. Apply the per-group skill reviews and commit gates
above without replacing the original preflight or final acceptance checks.

Each group must pass its review/commit pair before the next group starts.
During implementation record failing-test and passing-test evidence, unavailable
commands and focused debugging conclusions. Important code changes need review.
After required checks pass, run `$speckit-converge`, reconcile gaps and accepted
design changes into all affected canonical documents/contracts/ADRs. Only observed
card acceptance can change Kanban/CSV; T033 cannot mark K-028 complete without
T034's external evidence. No memory note or task checkbox proves completion.

This planning session ran document/Spec Kit consistency checks only. Application
unit/integration/contract/process tests, package install/build, scanners, container
smoke, hosted CI, deployment and cloud evidence were not run.

## Planning validation evidence — 2026-10-17

The owner approved remediation of analysis finding I1. T005 now specifies the
initial failing liveness test and T006 introduces the real App Router liveness
route before US1 startup/registry checks. T014/T015 extend that implementation
with broader health/readiness coverage. Task IDs, requirement count and scope
are preserved. A focused inline `python3` check of this ordering and its
requirements/technical/pseudocode reconciliation passed before re-analysis.

Executed from the project root during documentation preparation:

- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation .specify/scripts/bash/check-prerequisites.sh --json --paths-only`: passed; active working paths resolved and pointer verified. The returned feature-context name is not proof of a Git branch.
- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation .specify/scripts/bash/setup-plan.sh --json`: passed; project plan override loaded.
- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation .specify/scripts/bash/check-prerequisites.sh --json --template checklist-template`: passed; project checklist override returned.
- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation .specify/scripts/bash/setup-tasks.sh --json`: passed; project tasks override and supporting artifact paths returned.
- `python3 /tmp/check-foundation-docs.py`: passed after correcting the temporary checker's filename matcher to include `.yaml`; four canonical documents, four stories, 15 FRs, seven SCs, 24 unchecked custom criteria and 34 tasks; all 22 criteria mapped, no unmapped tasks, ordered dependency references, links and mirror equality checked. The temporary checker is session validation material, not an application test or a second project tracker.
- An inline `python3` check using duplicate-key-detecting PyYAML and `jsonschema.Draft202012Validator.check_schema`: passed; existing health path/auth/schema structure and event schema checked. No runtime producer compatibility is claimed.
- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation specify integration status`: **OK**, zero modified/missing managed files, invalid paths or unchecked manifests.
- SHA-256 comparison against the session snapshot: canonical API/events and Kanban/CSV remain unchanged. No permanent `specs/` tree exists.

Git status/diff was unavailable during the 2026-10-17 planning checks because
usable Git metadata was absent. The owner authorized local repository initialization
on 2026-10-18; see the setup audit. The earlier planning results do not establish
a commit, push or hosted CI run.
The final `$speckit-analyze` is read-only; its findings are reported in the session
after the artifacts and mirrors are finalized, rather than written as a second
accepted analysis/status document.

## Task regeneration evidence — 2026-10-18

The owner invoked `$speckit-tasks` for Application Foundation. The explicit
working path and persisted feature pointer both resolve to
`.specify/work/application_foundation`; setup loaded the project tasks-template
override. The four canonical feature documents, working spec/plan and supporting
references were reviewed. Existing task IDs and Kanban mappings were retained.
Story goals, independent evidence, field constraints, delivery/parallel examples
and the preflight-versus-final-review distinction were made explicit above.

Executed documentation/tool checks:

- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation .specify/scripts/bash/setup-tasks.sh --json`: passed; returned the absolute feature/template paths, project template content and four supporting artifact entries.
- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`: passed; resolved the intended feature and existing task artifact.
- `python3 /tmp/check-foundation-docs.py`: passed; 34 sequential unique tasks, ordered dependency references, all 15 requirements and seven success criteria mapped, valid links and canonical/working mirror equality. This is a temporary document checker, not an application test.
- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation specify integration status`: OK; zero modified/missing managed files, invalid paths or unchecked manifests.

The regenerated `tasks.md` remains an ignored, non-authoritative mirror of this
document. Reviewer-owned CHK001–CHK024 remain unchecked. No application tests,
build, dependency installation, CI run or implementation were performed by this
task-generation step. Re-run `$speckit-analyze` on the refreshed artifacts before
implementation review; an earlier analysis does not certify these edits.

## Group closeout task amendment — 2026-10-18

At the owner's request, each of the seven existing phases now ends with a
skill-based review and a structured commit task. Fourteen new IDs T035–T048
preserve the original T001–T034 references; there are 48 unchecked tasks.
The preceding dated 34-task checks describe the earlier artifact, not this revision.
The canonical engineering design and ignored working tasks mirror carry the same
updated task list, dependency graph, counts, review protocol and commit template.
Requirements, technical design, pseudocode, contracts and Kanban status are unchanged.
No feature implementation or Git commit is performed by this amendment.

Observed documentation checks for this amendment:

- `python3 /tmp/check-foundation-closeout.py`: passed; 48 unique unchecked tasks, seven phase-ending review/commit pairs, dependency order, story labels, all 15 FRs/seven SCs mapped, valid Markdown links and canonical/working mirror equality. Protected feature requirements/technical design/pseudocode, contracts and Kanban/CSV hashes matched the pre-edit snapshot. This temporary checker is session validation, not an application test.
- `python3 skills/scripts/manage_skills.py`: passed; 50 installed skills and relative discovery links, 561 source files and 19 notice files verified. Runtime integration tests were not run by this installation check.
- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`: passed; intended feature and task artifact resolved.
- `SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation specify integration status`: OK; zero modified/missing managed files, invalid manifest paths or unchecked manifests.
- `git diff --check -- docs/03_features/application_foundation/specifications/engineering/eng_design.md`: passed after removing trailing whitespace introduced on the edited metadata line.
- `.specify/extensions.yml` is absent; no before/after task hooks were registered to dispatch.
- Independent read-only review using `requesting-code-review`: no Critical, Important or Minor findings in this task amendment; no application code or runtime behavior was reviewed.

## Accepted analysis remediation — U1/U2, 2026-10-18

The owner approved both execution-detail refinements. U1: T015 now establishes
separate local development/test services before T016; T016 introduces the shared
guarded fixture without relying on future migrations; T019/T020 extend it and
T027 preserves the existing service configuration. U2: T009/T010 now separate
production startup from observable development HMR cases with owned-copy mutations,
resource counters and finite startup/reload/cleanup bounds. No task IDs or phase
review/commit gates changed; there are still 48 unchecked tasks. These are planned
implementation deliverables, not files created or runtime checks executed here.
The preceding analysis findings and export hashes describe their earlier snapshots.

## Accepted verification-timing amendment — 2026-10-18

ADR-022 supersedes the earlier U1/U2 remediation only where it made T034 a
prerequisite for local T047/T048. Task IDs, the 48-task inventory, original
review/commit protocol and all other dependencies are retained. T034 remains
open; T047/T048 are not automatically complete because their dependency changed.
Historical runbook statements that these tasks were blocked describe the prior
policy. Their current execution order is T033 → T047 → T048, with T034 on the
separate deployment-readiness branch. M0/K-028 closure still needs real evidence.

For later features, engineering plans must list local/fixture contract scenarios,
the matching real-adapter scenarios, provider-specific smoke/quality/security
checks, access/budget prerequisites, sanitized evidence and owning existing
Kanban IDs. Record limitations and unmet checks on those cards; do not create an
independent tracker or mark provider acceptance from local fixtures. Introducing
an emulator/dependency still requires its feature design, license/coverage review
and meaningful tests. No such implementation or provisioning is performed here.

## Hosted verification reconciliation — 2026-10-20

Hosted Foundation CI is now observed successful for implementation head 0370993, including its required checks/scans/container/negative-control stage ([job](https://github.com/Gyan172004/my-new-system/actions/runs/39145525838/job/117728453724)). K-006 therefore moves to Done in canonical Kanban/CSV. All 47 locally completed task issue mirrors are reconciled with evidence and PR49; T034 remains open under ADR-022. This supersedes historical pending-CI observations without changing the 48-task inventory, external K-028 gate or application behavior.
