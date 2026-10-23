# Initial Kanban Board

**Purpose:** Track implementation work derived from the dependency graph and V1 release plan.  
**Status:** Application Foundation implementation started; K-001 workflow acceptance is verified. No application milestone is complete. K-027 is Done because the owner decision and required documentation/contract updates are complete.
**Architecture source of truth:** Linked Markdown requirements, contracts, and design documents.  
**Task status source of truth:** This board or its imported live equivalent.

## Workflow

- **Backlog:** Valid task, but prerequisites are not yet satisfied.
- **Ready:** Prerequisites are satisfied and the task can start.
- **In Progress:** Actively being worked on.
- **In Review:** Implementation is complete and awaiting review/verification.
- **Done:** Acceptance criteria have been verified.

## Working agreements

1. Default WIP limit: one active implementation task for a solo developer.
2. Cards should be independently verifiable and preferably 0.5–2 days; split larger tasks.
3. Every card needs a deliverable, acceptance criteria, and dependencies.
4. A card is not Done merely because code was written; tests and relevant documentation must pass.
5. If blocked, record the blocking decision/dependency.
6. If using GitHub Projects, Trello, or Linear, treat that live board as the status source; this Markdown is the initial snapshot.
7. Do not put secrets, candidate data, hidden tests, or credentials in task descriptions.

### Local development prerequisite policy

Under ADR-022, K-028 remains In Progress until T034's real environment evidence
passes. Its verified local configuration/privacy/isolation portion can satisfy
the local-development prerequisite for a consuming feature (including K-029),
provided that feature's engineering design records the evidence and outstanding
external gate. This does not automatically move cards or waive other dependencies.
Real-provider acceptance stays on the owning existing cards; cloud/operational
release checks remain T034/K-028 and K-026. T047/T048 may follow T033 independently
of T034. See the [release schedule](../docs/02_build_sequencing/v1_scope_and_release_plan.md#41-local-development-and-external-verification-schedule).

## Ready

_None._

## Backlog


### K-010 — Implement session state transition guards
- Milestone: M1 · Priority: P0 · Depends on: K-002 and `session_state_machine.md`
- Acceptance: allowed and forbidden transitions are tested; client/model cannot set arbitrary state.

### K-011 — Implement session snapshot and event persistence
- Milestone: M1 · Priority: P0 · Depends on: K-005, K-010
- Acceptance: snapshot/event commit atomically; version checks prevent lost updates; event payloads are versioned.

### K-013 — Add idempotency and optimistic concurrency to session commands
- Milestone: M1 · Priority: P0 · Depends on: K-005, K-011
- Acceptance: same key/same payload returns original logical result; same key/different payload conflicts; stale version is rejected.

### K-014 — Implement first session API endpoints
- Milestone: M1 · Priority: P0 · Depends on: K-009, K-011, K-012, K-013
- Acceptance: create/get session and submit action conform to `contracts/api/v1_openapi.yaml`; contract tests pass.

### K-015 — Add deterministic stub interviewer for the vertical slice
- Milestone: M1 · Priority: P0 · Depends on: K-010, K-014
- Acceptance: stage-appropriate question proposal is produced without owning state transitions.

### K-016 — Verify first end-to-end session flow and resume
- Milestone: M1 · Priority: P0 · Depends on: K-014, K-015
- Acceptance: candidate opens problem, starts session, responds, advances, refreshes/reopens, and sees persisted state; invalid transitions and retries are tested.

### K-018 — Implement LLM interaction policy and regression fixtures
- Milestone: M2 · Priority: P1 · Depends on: K-017
- Acceptance: model cannot bypass state policy; fixtures cover ambiguity, abstention, invalid output, and prompt injection.

### K-019 — Implement approach assessment and ordered hint policy
- Milestone: M2 · Priority: P1 · Depends on: K-008, K-018; follows the reviewed Problem Pack schema/content contract
- Acceptance: low-confidence matches abstain/clarify; one approved hint per accepted action; exposure is recorded.

### K-020 — Threat-model and prototype isolated execution worker
- Milestone: M1 · Priority: P0 · Depends on: K-002
- Acceptance: threat model and proof of concept verify the selected E2B managed sandbox, provider data-processing/region, network/secret restrictions, toolchain feasibility, resource limits and cleanup before exposure. Full coordinator/queue integration remains K-021 in M3.

### K-021 — Implement execution coordinator and bounded queue
- Milestone: M3 · Priority: P0 · Depends on: K-020; implements `docs/03_features/code_execution/specifications/technical/execution_contract.md`
- Acceptance: Amazon SQS Standard + DLQ; at-least-once/out-of-order delivery handled idempotently; bounded concurrency (initial target 10 executions), visibility timeout, bounded retry/redrive, cancellation, and infrastructure-error classification work.

### K-022 — Integrate submissions with sessions and trusted test evaluation
- Milestone: M3 · Priority: P0 · Depends on: K-009, K-011, K-021
- Acceptance: hidden expected outputs stay outside sandbox; results are persisted against pinned pack/test-suite versions.

### K-023 — Generate evidence-backed feedback report
- Milestone: M3 · Priority: P1 · Depends on: K-019, K-022
- Acceptance: qualitative claims link to evidence; objective execution facts remain authoritative; relevant versions are retained.

### K-024 — Implement content review and immutable publishing workflow
- Milestone: M4 · Priority: P1 · Depends on: K-007, K-008
- Acceptance: unreviewed packs cannot publish; published versions are immutable; provenance/reviewer metadata is retained.

### K-025 — Add curated follow-up and variant selection
- Milestone: M4 · Priority: P2 · Depends on: K-019, K-023, K-024
- Acceptance: reviewed follow-ups/variants are selected and their IDs recorded in session evidence.

### K-026 — Validate observability, capacity, backup restore, and rollback
- Milestone: M5 · Priority: P0 · Depends on: K-003, K-004, K-005, K-006, K-014, K-017, K-022, K-023, K-028, K-029
- Acceptance: dashboards/alerts exist; load tests exercise expected concurrency; backup restore and rollback are demonstrated; all explicitly in-scope V1 modes have release evidence.

### K-029 — Implement V1 turn-based voice input/transcription and speech output
- Milestone: M2 · Priority: P0 · Depends on: K-014, K-017, K-018, K-028
- Acceptance: explicit versioned consent/revocation; bounded audio validation; OpenAI `gpt-transcribe` runs through the Model Gateway; transcript enters the same state machine as text; interviewer text is displayed and `gpt-4o-mini-tts` speech is streamed on demand; raw audio/speech is not durably stored by the application; provider failures do not advance state; text fallback, rate limits, log redaction and retention tests pass.

## In Progress

### K-017 — Add Model Gateway skeleton and structured-output validation
- Milestone: M2 · Priority: P1 · Depends on: K-002, K-006
- Acceptance: OpenAI adapter is isolated; operation map is centrally configured (`gpt-6.1-sol`, `gpt-6-luna`, conditional `gpt-6-astra`, `gpt-transcribe`, `gpt-4o-mini-tts`); fake adapter verifies timeout, bounded retry, schema validation, and usage metadata. Gateway seam can be built against mocks in parallel; integrate after session contracts.
- Progress: owner-authorized Stage 4 orchestration is active on `feature/model-gateway`; reviewed planning/tasks and derived issue mirrors are recorded in the [gateway engineering design](../docs/03_features/model_gateway/specifications/engineering/eng_design.md). Code/provider acceptance remains unverified; external OpenAI gate T184 stays pending.

### K-009 — Implement published Problem Pack retrieval and version pinning
- Milestone: M1 · Priority: P0 · Depends on: K-005, K-007, K-008
- Acceptance: sessions pin an immutable published version; candidate API excludes private fields.
- Progress: reviewed code now covers immutable publication, candidate HTTP and real atomic session pins. Local acceptance passed 522 Vitest tests, five browser tests and the catalogue/identity coverage gates. Full completion still requires K-008 genuine seed approval ([T132 / #135](https://github.com/Gyan172004/my-new-system/issues/135)); no real seed is published. Code review is [draft PR #136](https://github.com/Gyan172004/my-new-system/pull/136). See [canonical engineering evidence](../docs/03_features/problem_catalogue/specifications/engineering/eng_design.md#group-06--coverage-and-convergence-evidence).

### K-008 — Create one reviewed seed Problem Pack
- Milestone: M1 · Priority: P0 · Depends on: K-007
- Acceptance: pack passes structural validation and human correctness review; provenance is recorded.
- Progress: the complete Two Sum draft passes the implemented schema/data checks for all 37 cases. Verified author assignment, independent human correctness/source-rights review and final exact-checksum approval remain [T132 / #135](https://github.com/Gyan172004/my-new-system/issues/135); no seed has been published.


### K-028 — Establish environment configuration and secret-handling baseline
- Milestone: M0 · Priority: P0 · Depends on: K-002
- Acceptance: development/staging/production configuration is separated; required settings validate at startup; secret injection/storage is documented; example files contain placeholders only; secrets are absent from source control and logs.
- Progress evidence: startup/configuration, environment examples, secret-free image/log checks and role/injection/rotation handoff are implemented locally. Owner confirmed on 2026-10-18 that staging/production resources are not ready. Owner approved deferring resource funding to deployment readiness (ADR-022). Actual resource separation, task-definition injection, least-privilege roles, verified remote TLS and rotation evidence remain T034; card is not Done. Verified local prerequisites may support later features with explicit engineering-design evidence; local T047/T048 no longer wait for T034. See [foundation runbook](../docs/runbooks/foundation.md#environment-isolation-and-secret-injection-handoff).


## In Review

_None._

## Done

### K-007 — Define minimal Problem Pack schema and validation rules
- Milestone: M1 · Priority: P0 · Depends on: K-002
- Acceptance: schema covers candidate-visible statement/examples, version metadata, reference approaches, hint metadata, and private test references with visibility separation.
- Completion evidence: strict schema, bounded diagnostic generation, reference/input profile validation and canonical checksums passed 93 focused tests within 295 passing unit tests. Architecture, TypeScript, scoped lint and independent review passed. Original seed bytes are preserved; human seed approval remains K-008. See the [engineering evidence](../docs/03_features/problem_catalogue/specifications/engineering/eng_design.md#group-01--observed-validation-acceptance).

### K-006 — Add CI checks and automated test stages
- Milestone: M0 · Priority: P0 · Depends on: K-001, K-002
- Acceptance: CI runs formatting/lint, unit and relevant integration/contract tests, dependency/static checks, and simple architecture-boundary checks; a deliberate failing check fails CI.

- Completion evidence: Hosted GitHub Actions verify succeeded for foundation head 0370993, including the required checks, scans, container and negative-control stage. [Observed job](https://github.com/Gyan172004/my-new-system/actions/runs/39145525838/job/117728453724). Local full suite212/212 and deliberate failure controls are documented in the foundation runbook. K-028/T034 external-environment evidence remains deferred under ADR-022.

### K-012 — Add session ownership and authorization checks
- Milestone: M1 · Priority: P0 · Depends on: K-002, K-005, K-011
- Acceptance: cross-user read/write tests fail safely; Clerk token verification and provider-subject-to-internal-user mapping work; development/test identity adapter is prohibited in production.

- Dependency clarification: authentication adapters may start after K-002; K-005/K-011 are needed for real persisted cross-user service acceptance. K-014 consumes K-012 and owns HTTP error/ownership/replay integration; K-016 owns the end-to-end session journey. Neither is a prerequisite for K-012 completion. Authentication admission and denial-side-effect rules follow the identity feature designs.
- Completion evidence: Feature 2 development acceptance verified: 312 full-suite tests, 215 coverage tests and five browser tests passed; real Clerk Google/email-code sign-in, stable mapping, refresh/token expiry, actual expired-code rejection, privacy and real PostgreSQL ownership checks passed. Owner screenshot plus read-only database inspection confirms the Google-linked internal mapping. See docs/runbooks/identity.md. K-010/K-011 full features, K-014/K-016 consumers and hosted/cloud release gates remain separate.

### K-004 — Add health and readiness endpoints
- Milestone: M0 · Priority: P0 · Depends on: K-002
- Acceptance: liveness and readiness have distinct semantics and automated tests.
- Completion evidence: reviewed uncached contract-compliant live/ready adapters; real absent/migrated/incompatible history, optional-provider absence, exhaustion, query cancellation and recovery tests pass. Phase 5 full suite 201/201; no test databases or owned DB sessions remain. See [foundation runbook](../docs/runbooks/foundation.md).

### K-005 — Configure database migrations and test database workflow
- Milestone: M0 · Priority: P0 · Depends on: K-002
- Acceptance: migrations apply to an empty database; integration tests use isolated test data; recovery expectations are documented.
- Completion evidence: explicit stable node-pg-migrate baseline applies to empty storage and repeats as a no-op; transactional failure, immutable full history, bounded lock contention/cancellation/recovery and concurrent owned test isolation pass. Safe forward-fix/approved-restore expectations documented; production restore remains K-026. Phase 5 full suite 201/201. See [foundation runbook](../docs/runbooks/foundation.md).

### K-003 — Add structured logging and request correlation
- Milestone: M0 · Priority: P0 · Depends on: K-002
- Acceptance: request/job correlation IDs appear in logs; secrets and sensitive payloads are redacted.
- Completion evidence: reviewed runtime-owned request context and allowlisted Pino telemetry; concurrent canaries, raw dependency errors and cancelled-request process tests pass. Final suite 176/176, including real driver safety checks. Future job producers must explicitly map request IDs to canonical correlationId; no queue producer is introduced. See [foundation runbook](../docs/runbooks/foundation.md).

### K-002 — Establish application skeleton and module boundaries
- Milestone: M0 · Priority: P0
- Depends on: K-001
- Acceptance: application starts locally; module boundaries follow the modular-monolith design; no feature logic bypasses another module's public interface.
- Completion evidence: reviewed Phase 3 module/public-interface and client/provider boundary checks; production startup and two actual HMR reloads preserve the shared runtime handle and single listener. Final suite: 125/125 tests passed; secret-free build, lint, typecheck and architecture checks passed. See [foundation runbook](../docs/runbooks/foundation.md). Readiness/storage/CI and external environment gates retain their own cards.

### K-001 — Confirm repository conventions and local developer workflow
- Milestone: M0 · Priority: P0
- Depends on: None
- Acceptance: clean-checkout instructions are documented; configuration is validated; format/lint/test commands are discoverable.
- Completion evidence: locked clean-directory installation, configuration validation, format/lint/type checks and 67 unit tests passed; independent review found no blocking issues. See [foundation runbook](../docs/runbooks/foundation.md).

### K-027 — Resolve V1 voice interaction and transcription scope
- Milestone: M0 · Priority: P0 · Depends on: None
- Completion evidence: owner selected turn-based candidate audio input, OpenAI transcription, visible transcript, interviewer text plus speech output, consent, and text fallback; PRD, ADRs, feature order, API contract and voice technical contract now reflect the choice. Implementation remains K-029.

## Blocked / decisions needed

- AWS Region/VPC/networking and resource sizing; owner confirmed staging/production resources are not ready (2026-10-18). This defers T034/K-028 external acceptance to deployment readiness; under ADR-022 it does not block local T047/T048 or independently verifiable feature development. Real-provider milestone acceptance and production release gates remain binding.
- E2B production security/data-processing/region review and pinned language toolchains before candidate execution is exposed.
- Per-operation model/audio budgets/timeouts and Astra escalation threshold before production model calls.
- Voice audio MIME/size/duration limits, versioned consent copy, privacy review, and E2B/OpenAI data controls before production launch.
- Named content author/reviewer/publisher assignments before public catalogue publication.
- Final load-test SLO/RPO/RTO and alert thresholds before release.

## Status maintenance

The dependency graph defines sequence; the Kanban board defines task status. Do not maintain duplicate task-status truth in multiple places.
