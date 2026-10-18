# Application Foundation — Requirements

**Date:** 2026-10-17  
**Status:** Accepted design with Phases 1–6 and Phase 7 local closeout verified; deferred T034 and external acceptance gates remain open. See the canonical Kanban and foundation runbook for evidence.
**Authority:** Canonical feature behavior under root [AGENTS.md](../../../../AGENTS.md).  
**Related Kanban:** K-001–K-006, K-028; implementation status remains in [Kanban](../../../../project_management/kanban_board.md).

## Baseline and dependency readiness

Read with the [PRD](../../../01_macro_architecture/01_system_master_prd.md),
[HLD](../../../01_macro_architecture/02_system_hld.md),
[domain architecture](../../../01_macro_architecture/03_data_and_domain_arch.md),
[operations blueprint](../../../01_macro_architecture/04_infra_and_ops_blueprint.md),
[ADR register](../../../01_macro_architecture/05_architecture_decision_records.md),
[feature order](../../../02_build_sequencing/feature_implementation_order.md),
[dependency graph](../../../02_build_sequencing/build_dependency_graph.md) and
[release plan](../../../02_build_sequencing/v1_scope_and_release_plan.md).
K-001 has no dependencies. K-002 requires K-001; current status belongs to Kanban.
K-003/004/005/028 require K-002; K-006 requires K-001 and K-002.
Planning authorization does not authorize implementation or change task status.

## Clarifications

### Session 2026-10-17

- Q: Which backend language and framework should Application Foundation use? → A: TypeScript + Next.js (user: “Typescript+NextJS”).

Clarification coverage: functional scope, entities, developer/operator journeys, failure paths, security/privacy, terminology and completion signals are clear. One question asked and answered. Runtime/tool selection is resolved in the technical plan. AWS region/network/IaC, provider budgets and other features’ UI/voice/runtime parameters stay deferred to their existing release gates; none blocks this bounded documentation work.

| Clarification category | Outcome |
|---|---|
| Functional scope and behavior | Clear: four developer/operator/reviewer journeys; M0 only |
| Domain and data model | Clear: operational metadata only; domain records deferred |
| Interaction and UX | Clear: setup/probes/CI; candidate screens outside this feature |
| Non-functional quality | Clear: privacy, failure isolation and finite limits specified in design; release SLOs remain provisional |
| Integration and dependencies | Clear: existing providers retained, no live integrations in M0; K-028 external evidence explicit |
| Edge cases and failure handling | Clear: startup, storage, timeout, migration, cleanup and CI cases enumerated |
| Constraints and tradeoffs | Resolved: owner selected TypeScript + Next.js; implementation conventions documented in design |
| Terminology and consistency | Clear: process state is separate from interview state |
| Completion signals | Clear: SC-001–007 require observed evidence, not planning checkboxes |
| Placeholders and miscellaneous | Clear: no unresolved foundation requirement marker |

## User Scenarios & Testing

### US1 — Start and change the service reproducibly (P1)

A developer needs one documented workflow to install, configure, run and test the trusted application without buying access to external providers.

- Given a clean checkout and documented prerequisites, when the developer follows the setup guide with local development configuration, then the application starts and its minimal liveness smoke check succeeds before the broader health/readiness slice is added.
- Given a missing or invalid required setting, when startup is attempted, then it exits unsuccessfully before accepting traffic and identifies the setting by name without disclosing its value.
- Given the modular skeleton, when an illegal cross-module repository or provider import is introduced, then an automated boundary check fails with the offending dependency.
- Given a development identity adapter selected in a production environment, when startup is attempted, then startup fails closed.

Independent evidence: clean-environment setup transcript, the initial `/api/v1/health/live` response, startup failure tests, and an intentionally forbidden import rejected by the boundary check. K-001, K-002, K-028. This first operational route is part of making the skeleton runnable; full K-004 acceptance still requires the later health/readiness slice and its evidence.

### US2 — Diagnose service health without exposing data (P1)

An operator needs to distinguish a functioning process from a service that can safely receive traffic and trace failures without seeing candidate content.

- Given a functioning process and required storage available at the expected schema version, when liveness and readiness are queried, then both report success with a timestamp.
- Given storage unavailable, timed out or at an incompatible schema revision, when probes run, then liveness remains successful and readiness reports unavailable within its finite deadline.
- Given an optional provider unavailable, when readiness is queried, then the optional dependency does not make the service unready.
- Given requests overlap or supply malformed correlation metadata, when the service records completion or failure, then each request retains its own safe correlation identifier without cross-request contamination.
- Given credentials, candidate text/code/audio, hidden test material or an unexpected dependency error, when telemetry is produced, then values and raw payloads are absent from logs, traces and probe responses.

Independent evidence: probe contract tests, dependency-failure integration cases, concurrent correlation and telemetry canary tests. K-003, K-004.

### US3 — Evolve storage without damaging another environment (P1)

A developer needs a repeatable migration and isolated test-storage workflow before feature tables are added.

- Given an empty development database, when migrations are explicitly applied, then it reaches the documented head; a second application is a no-op.
- Given a failed migration, when its command exits, then failure is visible, readiness stays unavailable for an incompatible revision, and recovery instructions identify a safe forward-fix or approved restore path.
- Given concurrent test runs, when integration fixtures acquire and release resources, then they use separate test databases and cleanup cannot target development, staging or production storage.
- Given two migration invocations overlap, when the migration lock is acquired, then only one migrates and the other waits within a bounded deadline or exits safely.

Independent evidence: real-storage migration, repeatability, failure, lock and isolation tests. K-005.

### US4 — Reject regressions before release (P1)

A reviewer needs automated checks that expose defects and honest evidence about checks that could not run.

- Given a clean checkout and no paid-provider credentials, when the documented CI workflow runs, then formatting, lint/static checks, unit, integration, contract, architecture, dependency and container checks execute with recorded outcomes.
- Given a deliberate test, lint or boundary failure, when the matching CI stage runs, then the workflow fails rather than silently skipping it.
- Given a required service or scanner unavailable, when verification is reported, then the result is failed or unavailable and the task remains incomplete.

Independent evidence: successful required-stage logs plus deliberate negative-control failures; no application acceptance is claimed by this planning exercise. K-006, all foundation cards.

## Requirements

| ID | Requirement | Source / acceptance |
|---|---|---|
| FR-001 | Document supported prerequisites, locked installation, safe local settings, start/stop, migrations, test isolation and every required verification command. | K-001; US1, US3, US4 |
| FR-002 | Provide one trusted backend skeleton with explicit module ownership/public interfaces; prohibit cross-module private persistence access, provider calls outside approved adapters and candidate-code execution in trusted workloads. | ADR-001/002/012; K-002; US1 |
| FR-003 | Validate environment and active-component settings before serving; reject invalid/missing settings and production test identity; require no external provider credentials for unused integrations. | K-028; ADR-016; US1 |
| FR-004 | Keep development, staging and production settings/data/credentials distinct; document production secret injection and least-privilege workload conventions, with no real secrets in tracked files, images, command output or telemetry. | K-028; operations §§6,19; US1 |
| FR-005 | Emit structured request-completion and sanitized failure telemetry with a request correlation identifier and bounded values; separate overlapping request contexts and retain future job-correlation compatibility. | K-003; operations §16; US2 |
| FR-006 | Exclude authorization, cookies, connection secrets, request/response bodies, audio, unrestricted transcripts/source and hidden evaluation data from telemetry; return no internal diagnostics in probes/errors. | ADR-019; voice/execution contracts; US2 |
| FR-007 | Provide distinct unauthenticated read-only liveness and readiness interfaces following the existing API contract; include status and timestamp, disclose only safe named check outcomes. | K-004; HealthStatus; US1, US2 |
| FR-008 | Readiness must require current service initialization and mandatory storage/schema compatibility, use finite checks and exclude optional model/audio/sandbox/analytics dependencies; liveness must not probe dependencies. | K-004; operations §18; US2 |
| FR-009 | Provide explicitly invoked versioned migrations, a baseline that applies to empty storage and repeat no-op, serialized bounded migration execution, and documented forward-fix/restore recovery. Do not run migrations inside probes or each application replica. | K-005; ADR-004; US3 |
| FR-010 | Isolate real-storage integration tests from all non-test environments and from concurrent test runs; reject unsafe cleanup targets and bound setup/teardown. | K-005; US3 |
| FR-011 | Automate locked install, formatting/lint/static analysis, unit/integration/contract/architecture checks, dependency scanning, container build/image scanning, and secret checks; fail closed on failed/unavailable required stages. | K-006; operations §14; US4 |
| FR-012 | Cover startup, configuration, probes, correlation/privacy, migrations/isolation and CI failure paths using test-first production development; finish with a local process-level smoke journey. | Constitution IV; all cards; US1–US4 |
| FR-013 | Startup/shutdown and required dependency work must have finite configured limits; shutdown stops readiness before draining and closes resources without automatic schema mutation. | Operations §§5,18; K-002/004; US1/US2 |
| FR-014 | Reference existing API/event/session/LLM/execution/voice contracts without implementing their business behavior or adding placeholder product endpoints; reconcile any actual interface proposal and its consumer tests before adoption. | Constitution I–III; K-002/004 |
| FR-015 | Review specification/design/test/dependency readiness before implementation; record exact verification outcomes, obtain important-change code review and run convergence before Kanban completion, synchronizing CSV. | AGENTS; all cards |

## Key Entities

Foundation introduces operational configuration, request context, health report, schema revision and isolated test-resource identity. It introduces no candidate/domain records. User, session, Problem Pack, event/outbox, consent, model usage and execution entities remain owned by the domain architecture and later features. Existing API and event contracts remain canonical under root `contracts/`.

## Success Criteria

- SC-001: One clean-environment run completes documented install → configure → explicit migrate → start → health checks → all required checks → stop, without paid-provider credentials or undocumented steps (FR-001–004,009–012).
- SC-002: Every invalid/missing required-setting and production-test-identity fixture prevents traffic and discloses only safe setting names (FR-003/004).
- SC-003: All declared healthy, mandatory-dependency failure, timeout, incompatible-schema and optional-dependency cases produce the documented distinct health outcomes within the configured deadline (FR-007/008/013).
- SC-004: All concurrent request and telemetry canary cases preserve request separation and expose zero planted sensitive values in captured output (FR-005/006).
- SC-005: Empty-storage migration, repeat no-op, failed migration, concurrent migration and two concurrent test-run isolation cases pass with no non-test resources altered (FR-009/010).
- SC-006: Every required verification stage runs; deliberate test/lint/boundary failures are observed to fail the workflow; unavailable stages are never counted as passes (FR-011/012).
- SC-007: All implementation cards retain their true Kanban status until their acceptance evidence is observed; planning/checklist completion alone changes no implementation status (FR-015).

These are acceptance targets, not observed runtime results. Existing capacity, availability and latency goals remain provisional release targets; M0 does not prove them.

## Scope, Edge Cases and Clarifications

Scope: Stage 0 / M0 foundation, K-001–K-006 and K-028. Personas are developers, reviewers and operators. This is a backend/platform foundation; candidate-facing UI behavior remains deferred to its owning features; the selected application framework is Next.js.

Non-goals: authentication implementation, catalogue/session/conversation/voice/model/execution business logic, feature tables, worker/queue consumers, AWS resource provisioning, production deployment, IaC selection, full release load/restore evidence and product UI. K-028 still needs actual staging/production secret/environment evidence before its entire acceptance is claimed; local settings alone cannot finish it.

Edge cases: invalid/unknown environment; missing active-component secret; unused-provider configuration absent; malicious/oversize correlation metadata; simultaneous requests; raw exception containing credentials; storage timeout; absent/newer/older schema; concurrent/failed migration; teardown pointed at non-test storage; interrupted setup/shutdown; unavailable required CI service/scanner. They must have explicit tests and bounded failure behavior in the plan.

Environment evidence: Git metadata was unavailable during the 2026-10-17 planning checks. The owner authorized repository initialization on 2026-10-18; the local main branch now exists, with Git metadata writes requiring approved access outside this sandbox. Earlier planning does not establish a commit, push or hosted CI result; each requires its own observed evidence. See the setup audit. Superpowers skills were not available during planning; rediscover skills before implementation and retain required engineering discipline without claiming unavailable skills were invoked.

Resolved material choice: the user selected TypeScript + Next.js on 2026-10-17. The technical design uses its Node.js server runtime for the trusted modular monolith, with Route Handlers adapting the canonical API. No separate backend framework is introduced. Candidate-facing screens remain outside this foundation feature.

## Reviewer requirements-quality checklist

**Created:** 2026-10-17  
**Purpose:** Standard-depth pre-implementation review of foundation security, operations and dependency clarity.  
**Review owner:** Project owner or designated reviewer.

These are questions about the quality of these requirements and their associated
technical/engineering design. Newly generated items remain unchecked until the
reviewer signs off; `[x]` never means implementation passed. All items have explicit
traceability. The built-in specification-quality check separately passed 16/16.

- [x] CHK001 Are setup prerequisites, locked install and start/stop/verification outcomes specified? [Completeness; FR-001; SC-001]
- [x] CHK002 Are framework adapters separated from domain ownership and private persistence access? [Completeness; FR-002; FR-014]
- [x] CHK003 Are required, optional and unimplemented integration settings distinguished explicitly? [Clarity; FR-003; US1]
- [x] CHK004 Are environment names and the rejection of test identities outside local/test use unambiguous? [Clarity; FR-003; FR-004; US1]
- [x] CHK005 Are missing, invalid and secret-bearing configuration failures defined without value disclosure? [Coverage; FR-003; FR-006; SC-002]
- [x] CHK006 Are development, staging and production isolation requirements distinct from deployment evidence? [Coverage; FR-004; Scope]
- [x] CHK007 Are request identifier provenance, bounds and overlapping request context rules specified? [Clarity; FR-005; US2]
- [x] CHK008 Are sensitive data exclusions stated for logs, traces, errors and probe responses? [Completeness; FR-006; SC-004]
- [x] CHK009 Are health paths, authentication exceptions and response schemas tied to the canonical API? [Consistency; FR-007; FR-014]
- [x] CHK010 Are liveness, readiness, mandatory dependencies and finite failure budgets distinguishable? [Measurability; FR-007; FR-008; FR-013; SC-003]
- [x] CHK011 Are absent, older, newer and unknown schema histories covered by readiness requirements? [Coverage; FR-008; Edge cases]
- [x] CHK012 Are optional provider outages excluded from readiness without silently enabling a provider fallback? [Consistency; FR-003; FR-008]
- [x] CHK013 Are migration ownership, explicit invocation, no-op repetition and overlap handling specified? [Coverage; FR-009; US3]
- [x] CHK014 Are failed migration behavior, rollback limits and forward-fix or restore responsibilities defined? [Coverage; FR-009; SC-005]
- [x] CHK015 Are test-resource allocation, allowed targets and refusal of unsafe cleanup documented? [Clarity; FR-010; US3]
- [x] CHK016 Are concurrent migration and concurrent test-run acceptance outcomes defined? [Measurability; FR-009; FR-010; SC-005]
- [x] CHK017 Are required CI stages and unavailable-stage reporting requirements enumerated? [Completeness; FR-011; US4]
- [x] CHK018 Are deliberate test, lint and architecture failures required as CI negative controls? [Measurability; FR-011; SC-006]
- [x] CHK019 Are test-first behavior changes and real-storage/process verification responsibilities explicit? [Coverage; FR-012; SC-001; SC-005]
- [x] CHK020 Are startup, draining, interrupted initialization and resource cleanup requirements bounded? [Coverage; FR-013; US1; US2]
- [x] CHK021 Are the session state, LLM policy, execution and voice contracts preserved rather than replaced? [Consistency; FR-014; Scope]
- [x] CHK022 Does every functional requirement and buildable success criterion have a task/evidence mapping? [Traceability; FR-001–015; SC-001–007]
- [x] CHK023 Are K-001 before K-002 and the remaining canonical task dependencies stated explicitly? [Consistency; Baseline and dependency readiness; FR-015]
- [x] CHK024 Are reviewer signoff, observed verification, code review, convergence and Kanban/CSV ownership distinguished from planning completion? [Governance; FR-015; SC-007]

### Requirements-quality review signoff — 2026-10-18

Reviewed by Codex at the owner's explicit request to review and check the items.
All CHK001–CHK024 criteria are satisfied by the current requirements, technical
design, engineering design, pseudocode and canonical health contract. U1/U2
execution-detail refinements were applied and independently reviewed beforehand.
This signs off document quality and pre-implementation readiness only; it does
not establish implemented behavior, passing runtime tests or Kanban completion.

| Criteria | Reviewed evidence |
|---|---|
| CHK001 | Engineering design's planned commands and clean-environment journey; locked npm installation, configuration, start/stop and checks |
| CHK002, CHK021 | Technical design's public module boundaries and interface impact review; existing session/LLM/execution/voice policies retained |
| CHK003–CHK006 | Configuration/lifecycle rules: explicit environments/adapters, no unused-provider secrets, sanitized failures; local guards and external T034 evidence distinguished |
| CHK007–CHK008 | Server-generated UUID, isolated AsyncLocalStorage, allowlisted logs and stdout/stderr canary tests |
| CHK009–CHK012 | Canonical health paths/schema/auth exceptions, no-store, mandatory DB/schema checks, finite deadlines and excluded optional providers |
| CHK013–CHK016 | Explicit bounded/locked migrations, forward-fix/approved restore, guarded owned test allocation and concurrent isolation; U1 specifies early test-service/fixture readiness |
| CHK017–CHK020 | Required fail-closed CI/scanners, negative controls, test-first real-storage/process evidence and lifecycle bounds; U2 defines observable HMR reuse |
| CHK022–CHK024 | All 15 FRs/seven SCs mapped to 48 tasks; explicit K/T dependencies, preflight, review/commit, convergence and Kanban/CSV ownership |


### T032 signoff reconfirmation — 2026-10-18

An independent read-only reviewer checked the current implementation against all
four canonical feature documents, relevant architecture/ADRs and contracts.
CHK001–CHK024 remain satisfied as requirements/design-quality checks; the earlier
pre-T001 signoff remains the prerequisite and is not replaced by this late review.
No material product/architecture or interface changes required renewed decisions.
No Critical/Important blocker was found. The reviewer did not execute tests or
establish hosted CI, staging/production resource/role/injection/rotation, remote
TLS or production restore acceptance. Those retain their existing evidence gates.

## Accepted local development and external acceptance policy — 2026-10-18

Owner-approved ADR-022 permits local development and foundation review/commit
before AWS resources are funded. FR-004/015 and SC-007 still require K-028 to
remain incomplete until T034 verifies actual environments. FR-011/SC-006 still
require hosted CI evidence for K-006. Local and external evidence must be labeled
separately; no required unavailable check is a pass.

Acceptance: T047/T048 may follow verified T031–T033 independently of T034.
Subsequent feature planning can rely on K-028's verified local configuration,
privacy and isolation portion, explicitly recording that dependency in its
engineering design. This does not waive other prerequisites or complete M0.
Future provider features use contract-tested fixtures/emulators for ordinary CI,
plus bounded real-service checks at their integration milestones before claiming
provider acceptance. Deferred cloud evidence remains a pre-release requirement.
Fixtures cannot prove model quality, real authentication or sandbox isolation;
no candidate code runs in trusted application/test-adapter paths. No automatic
production fallback to fixtures or local endpoints is allowed.

This amendment changes verification timing and local review dependencies, not
API/event schemas or product behavior. The material requirements delta must be
reviewed with the four documents; earlier signoffs remain historical evidence.
