# Feature Implementation Order

**Status:** Canonical sequencing guide for implementation  
**Scope:** V1 interview-practice platform  
**Last updated:** 2026-10-16

## 1. Purpose and source of truth

This document defines the recommended **feature-level implementation order** and the reasons behind it. It reconciles the macro dependency graph, V1 release plan, architecture contracts, and initial Kanban task list.

Use each artifact for its intended purpose:

- **This file — feature order:** the default order in which feature areas should be designed and delivered.
- [`build_dependency_graph.md`](build_dependency_graph.md) — dependency relationships and constraints. If a dependency blocks the proposed sequence, satisfy the dependency first.
- [`v1_scope_and_release_plan.md`](v1_scope_and_release_plan.md) — release scope and milestone boundaries.
- [`../01_macro_architecture/05_architecture_decision_records.md`](../01_macro_architecture/05_architecture_decision_records.md) — recorded architectural decisions and unresolved decisions.
- [`../../project_management/kanban_board.md`](../../project_management/kanban_board.md) and [`../../project_management/kanban_tasks.csv`](../../project_management/kanban_tasks.csv) — **current task status**, ownership, and readiness. The Kanban is not replaced by this document.
- Each feature's four design documents — the feature-specific requirements and implementation contract.

This is a dependency-aware default order, not a rule that every feature must be completed in isolation before the next begins. Small, explicitly scoped work can proceed in parallel when its contracts are stable.

## 2. Non-negotiable implementation rules

1. The backend owns session state, legal transitions, hint progression, test execution, scoring, and completion. The LLM proposes structured interpretations; it does not control the state machine.
2. Keep the initial application a **modular monolith**. Separate trusted application/control-plane work from untrusted code execution.
3. PostgreSQL is the durable source of truth for session state and events. Use explicit migrations and versioned contracts.
4. Problem Packs are validated, reviewed, published, and immutable once published. Sessions pin a specific published version.
5. Model calls and code execution are external/slow boundaries: define timeouts, bounded retries, idempotency, failure behavior, and observability before relying on them.
6. Never expose hidden tests, expected hidden outputs, credentials, or private authoring notes to the model or candidate.
7. Do not build infrastructure for hypothetical scale. Validate the stated initial target—about 1,000 users, 100 simultaneous interviews, and 10 concurrent executions—with load and failure tests before scaling the architecture.

## 3. Recommended feature order

### Stage 0 — Repository and application foundation

**Priority:** P0  
**Goal:** Make the codebase safe and repeatable to change before implementing product behavior.

Deliver:
- Confirm repository conventions, local run/test commands, and existing tooling.
- Establish the application skeleton and module boundaries.
- Configuration and secret handling.
- Structured logs and request/correlation IDs.
- Liveness/readiness endpoints.
- Database migration workflow and a reliable test database.
- CI checks for formatting/linting, types where applicable, unit tests, and integration tests.

Exit criteria:
- A new developer can run the service and tests from documented instructions.
- CI catches basic regressions.
- Health endpoints distinguish process liveness from dependency readiness.
- No secrets are committed; configuration is validated at startup.

Related initial Kanban tasks: **K-001–K-006** and **K-028** for environment/secret configuration.

### Local dependency satisfaction and deferred cloud evidence

ADR-022 allows local slices to continue before AWS resources are funded. K-028
has a verified local configuration/privacy/isolation portion and an outstanding
external acceptance portion (T034). Record reliance on the local portion in each
consuming feature's engineering design; K-028 stays In Progress and all other
prerequisites remain binding. This applies also to W15/K-029's K-028 dependency.
Foundation local review/commit T047/T048 depends on T033, not deferred T034.
Each provider feature retains its real-service milestone smoke/acceptance gate.
Cloud deployment and production release require T034 plus K-026 operational
evidence; see [the release schedule](v1_scope_and_release_plan.md#41-local-development-and-external-verification-schedule).

### Stage 1 — Identity and candidate access

**Priority:** P0 for a multi-user release  
**Goal:** Identify the caller and enforce ownership boundaries.

Deliver:
- Integrate Clerk at the authentication boundary and map verified provider subjects to internal stable user IDs.
- Keep the test identity adapter development/test-only; fail startup if it is selected in production.
- Enforce owner-scoped session/history access in the backend.
- Capture minimal interview-experience context only where it improves the interview; ratings are not direct score multipliers.
- Test missing/expired/forged tokens, cross-user access, and authorization failures.

Exit criteria:
- Every private session read or mutation is authorized server-side.
- A user cannot access another user's data by changing an identifier.
- Clerk token validation and internal identity mapping are covered by contract/integration tests.

Dependency note: a local development identity stub may unblock early vertical slices, but it must not be mistaken for production authentication.

### Stage 2 — Problem catalogue and immutable Problem Packs

**Priority:** P0  
**Goal:** Create a trustworthy, versioned content contract before the interviewer depends on problem data.

Deliver:
- Problem Pack schema and validation.
- Problem metadata, canonical statement, examples, constraints, reference approaches, complexity expectations, hint ladder, follow-ups/variants, and test metadata as appropriate.
- Content provenance, review status, and publication validation.
- An author creates the pack and records provenance; a different technical reviewer checks correctness, alternatives, tests, hint ordering, and rights/provenance. Authors cannot self-approve; only a reviewer or authorized publisher can publish.
- A small independently authored/reviewed seed catalogue.
- Read APIs for published problems and version pinning.
- A clear boundary between candidate-visible content and private evaluation material.

Exit criteria:
- Invalid packs cannot be published.
- Published versions are immutable; corrections create a new version.
- A session can pin a specific pack version and remains reproducible if the catalogue changes.
- The seed pack has passed content and test review.

Related initial Kanban tasks: **K-007–K-009**, with content review/publishing hardening in **K-024**.

Sequencing note: define the pack schema and publication invariants here. A complete authoring/admin UI can be delivered later; do not let the absence of that UI block a reviewed seed pack.

### Stage 3 — Interview session management and deterministic vertical slice

**Priority:** P0  
**Goal:** Prove the session lifecycle without making an LLM or code runner a prerequisite.

Deliver:
- Session creation, ownership, status, persisted state, and resume.
- Explicit state machine and transition guards.
- Snapshot plus append-only event history where specified by the architecture.
- Optimistic concurrency and idempotency for mutating actions.
- Session API endpoints and contract tests.
- A deterministic stub interviewer so the complete flow can be exercised without provider variability.

Exit criteria:
- Illegal transitions are rejected consistently.
- Repeated idempotent requests do not duplicate effects.
- Concurrent stale writes are detected rather than silently overwriting newer state.
- A candidate can create, progress, leave, and resume a session.
- End-to-end tests cover the core happy path and important failure paths.

Related initial Kanban tasks: **K-010–K-016**.

### Stage 4 — Model Gateway

**Priority:** P1  
**Goal:** Introduce provider-backed model calls behind a narrow, testable boundary.

Deliver:
- Provider abstraction and centrally managed model configuration.
- Structured output schemas and validation.
- Timeouts, bounded retries, cancellation where supported, and explicit error mapping.
- Usage/cost telemetry and request correlation.
- Mocked provider tests and recorded regression fixtures; avoid depending on live model calls for ordinary CI.

Exit criteria:
- Provider-specific details do not leak across domain modules.
- Invalid or incomplete model output fails safely and cannot mutate session state directly.
- Timeouts, provider errors, malformed output, and rate limits have defined behavior.
- Sensitive content is not logged unnecessarily.

Related initial Kanban task: **K-017**. V1 model map: `gpt-6.1-sol` for interview turns, approach assessment, hint support, and feedback; `gpt-6-luna` for focused intent/stage classification; `gpt-6-astra` only as a quality-tested, budget-approved escalation; `gpt-transcribe` for voice input; and `gpt-4o-mini-tts` for speech output. All calls use central Model Gateway configuration.

### Stage 5 — Interview orchestration and conversation policy

**Priority:** P1  
**Goal:** Connect the model to the backend-owned interview state machine.

Deliver:
- Stage-aware prompt/context assembly.
- Turn handling and structured model response validation.
- A policy layer that limits the model to allowed actions, candidate-visible facts, and permitted identifiers.
- Backend-controlled transition decisions.
- Deterministic fallback behavior when model output is invalid or unavailable.
- Regression fixtures for representative conversation paths.

Exit criteria:
- The model cannot skip required stages, reveal hidden material, or declare completion by itself.
- Candidate input is treated as untrusted content.
- Every accepted action has a traceable backend decision and outcome.
- Core conversation tests run deterministically with mocked model responses.

Related initial Kanban tasks: **K-018** and the orchestration contracts under `docs/03_features/interview_orchestration/`.

### Stage 5A — Turn-based voice interaction (V1)

**Priority:** P0 for the selected V1 experience  
**Goal:** Add spoken input/output without creating a second interview state machine.

Deliver:
- Explicit, versioned voice-processing consent before audio capture/submission.
- Bounded candidate audio upload and OpenAI transcription through the Model Gateway (`gpt-transcribe`).
- Transcript visible to the candidate and sent through the same candidate-response policy used for text.
- Interviewer response text plus on-demand speech generation (`gpt-4o-mini-tts`).
- Text fallback, transcript correction/retry behavior, audio mime/size/duration limits, and safe provider-failure handling.
- No durable raw-audio storage; request bodies/audio must be excluded from logs and traces.

Exit criteria:
- Voice and typed answers produce equivalent backend state semantics for the same transcript.
- Missing/revoked consent blocks capture/submission; consent version/time is auditable.
- Transcription failures do not advance session state or count against the candidate.
- The user sees the transcript and can continue via text if audio services fail.
- Privacy/terms, provider controls, and data handling pass review before production.

Related Kanban task: **K-029**. The product scope decision itself is recorded as complete in **K-027**.

### Stage 6 — Approach assessment and progressive hints

**Priority:** P1  
**Goal:** Help candidates improve their reasoning without pretending uncertain semantic matches are certain.

Deliver:
- Curated reference-approach matching with confidence thresholds and explicit abstention.
- Structured assessment grounded in candidate evidence.
- Progressive hint selection controlled by backend state.
- A rule that an accepted hint action advances the hint ladder at most once.
- Tests for ambiguous approaches, incorrect reasoning, repeated requests, and unavailable references.

Exit criteria:
- Low-confidence assessments abstain or ask for clarification rather than inventing certainty.
- Hints are released in order and never expose private evaluation material.
- Feedback and transitions are tied to observable candidate evidence.
- Regression cases cover known approach variants and common misconceptions.

Related initial Kanban task: **K-019**.

### Stage 7 — Isolated code execution and submission evaluation

**Priority:** P0 for a code-enabled release; isolate and prototype early  
**Goal:** Execute candidate code safely and evaluate it using trusted infrastructure.

Deliver:
- A documented threat model and a small sandbox proof of concept before broad integration.
- Ephemeral isolated execution with no network by default, no credentials, resource limits, and bounded output.
- Language/runtime selection based on an explicit V1 decision.
- Execution coordinator and bounded queue.
- Submission lifecycle, compile/runtime/timeout outcomes, and trusted test evaluation.
- Clear distinction between candidate-visible tests/results and hidden evaluation material.
- Failure classification so infrastructure failures are not scored as candidate failures.

Exit criteria:
- Untrusted code cannot access application secrets, internal services, or other candidates' data.
- CPU, memory, wall time, output, and concurrency are bounded.
- Infrastructure failures are reported neutrally and can be retried safely.
- Integration tests cover successful runs, compile errors, runtime errors, timeouts, resource limits, and runner failure.
- Security review approves the execution boundary before public exposure.

Related initial Kanban tasks: **K-020–K-022**. The initial execution boundary is a managed E2B sandbox behind an adapter; Python, C++, and Java are the V1 allowlist. Trusted evaluation retains expected outputs outside the sandbox. SQS Standard is used for queued execution work.

Dependency note: prototype sandbox feasibility during early foundation work. Full product integration follows the submission contract and session lifecycle. Do not run candidate code inside the trusted API process.

### Stage 8 — Feedback and interview history

**Priority:** P1  
**Goal:** Turn a completed session into useful, evidence-backed learning.

Deliver:
- A feedback model grounded in session events and candidate actions.
- Summary of reasoning, communication, approach choice, correctness, complexity, and improvement areas where evidence exists.
- Session history and retrieval with ownership checks.
- Clear handling of incomplete sessions and missing evidence.

Exit criteria:
- Feedback claims can be traced to session evidence.
- The system does not fabricate unobserved behavior or score unavailable evidence as failure.
- History is private to the owning candidate and respects retention policy.

Related initial Kanban task: **K-023**.

### Stage 9 — Content administration and review workflow

**Priority:** P1 before scaling the catalogue  
**Goal:** Make content quality sustainable beyond a hand-maintained seed pack.

Deliver:
- Authoring and validation workflow.
- Review/approval and publication controls.
- Version history, provenance, and safe correction through new versions.
- Separation of authoring-only fields from candidate-facing content.
- Auditability for content changes.

Exit criteria:
- Only authorized reviewers can publish.
- Published versions cannot be silently edited.
- Each published pack has required metadata, validation results, and review status.
- Candidate sessions remain pinned to their original content version.

Related initial Kanban task: **K-024**.

### Stage 10 — Follow-ups and problem variants

**Priority:** P2  
**Goal:** Test whether a candidate understands the pattern and can transfer it to a related problem.

Deliver:
- Curated links between a base problem and reviewed follow-ups/variants.
- Backend-controlled selection based on session evidence and policy.
- Separate expected reasoning and evaluation criteria for each variant.
- Tests preventing unsupported or out-of-scope variants from being introduced.

Exit criteria:
- Follow-ups are drawn from reviewed content rather than improvised as authoritative requirements.
- Selection has an explainable reason based on candidate evidence.
- A variant cannot silently change the active problem contract.

Related initial Kanban task: **K-025**.

### Stage 11 — Operational hardening and release readiness

**Priority:** P0 before public launch; ongoing after launch  
**Goal:** Validate reliability, security, cost, and recovery at the intended initial scale.

Deliver:
- Metrics, dashboards, alerts, and correlation across API, model, database, queue, and execution jobs.
- Load and soak tests against the provisional target.
- Rate limits, abuse controls, and cost guardrails.
- Backup/restore verification, migration/rollback procedure, and incident runbooks.
- Retention/deletion behavior and privacy review.
- Security review of authorization, prompt injection boundaries, content leakage, and code execution.
- Release checklist and staged rollout.

Exit criteria:
- Load tests demonstrate the agreed capacity with documented headroom and bottlenecks.
- Restore and rollback procedures have been exercised, not merely documented.
- Alerts identify user-impacting failures without excessive noise.
- Known risks and unresolved decisions are accepted explicitly before launch.

Related initial Kanban task: **K-026**. Foundation tasks K-003–K-006 also contribute.

## 4. Dependency-aware execution plan

The practical path is:

1. **Foundation:** K-001 → K-002, then establish logging, health checks, database/test setup, and CI (K-003–K-006).
2. **Parallel prerequisites:** implement the Problem Pack path (K-007 → K-008 → K-009) while building identity/authorization behind an interface (K-012). Start the sandbox threat model and proof of concept during M1 (K-020), before the full execution milestone.
3. **Session vertical slice:** K-010 → K-011 → K-013, then integrate K-009/K-012/K-013 into K-014 → K-015 → K-016, respecting the actual dependencies in the Kanban. K-012 need not wait for K-009, but K-014 needs both.
4. **AI behavior:** K-017 → K-018 → K-019, integrated only through the backend policy and session contracts.
5. **Code-enabled flow:** K-020 → K-021 → K-022, with the sandbox prototype and security review treated as gates, not optional cleanup.
6. **Learning value and content scale:** K-023 and K-024; K-025 follows once base sessions and content versions are stable.
7. **Release readiness:** K-026 plus completed security, load, recovery, privacy, and operational checks.

Some work may overlap, but only after the interface it depends on is written and agreed. In particular, sandbox research can run early; model gateway tests can be developed against mocks; and content authoring workflow can be designed before its UI is scheduled.

## 5. Required design documents for every feature

Before implementing a feature, create or review these four documents in its feature directory:

1. `requirements/feature_req.md` — user problem, scope, acceptance criteria, non-goals, and failure cases.
2. `specifications/technical/tech_design.md` — architecture, interfaces, data model, dependencies, and decisions.
3. `specifications/engineering/eng_design.md` — implementation breakdown, module/file boundaries, migration/testing plan, and operational concerns.
4. `pseudo_code/logic_and_state.md` — algorithms, state transitions, validation rules, and edge cases.

Existing cross-cutting contracts—such as the session state machine, LLM interaction policy, execution contract, OpenAPI, and async schemas—must be referenced and kept consistent rather than copied into conflicting alternatives.

For each feature, follow this loop:

1. Review requirements and acceptance criteria.
2. Review technical design and dependencies.
3. Review engineering design and test plan.
4. Review pseudocode and state/error paths.
5. Implement the smallest useful vertical slice.
6. Run relevant unit, integration, contract, and end-to-end tests.
7. Review security, observability, and failure behavior where applicable.
8. Update the Kanban task status and record any decision or contract changes.
9. Revisit the dependency graph if the work reveals a real dependency change.

Do not mark a feature complete merely because the happy path works. Completion requires the agreed acceptance criteria, relevant tests, and documentation updates.

## 6. How to use the Kanban

The Kanban is the operational task tracker; this document is the feature-level roadmap.

- Start implementation with **K-001** and **K-002**, which are initially marked Ready. K-027 records the voice-scope decision and is Done; K-029 tracks voice implementation.
- Pull work only when its dependencies and acceptance criteria are clear.
- Keep task status current as work progresses.
- Split a task if it is too large to implement and verify in a focused increment.
- Add tasks when a design review or test exposes missing work; do not hide scope changes inside an existing task.
- If the proposed order conflicts with a genuine technical dependency, satisfy the dependency and update this document, the dependency graph, and the Kanban together.

## 7. Remaining implementation decisions and release gates

The major choices are selected in the ADR register. Resolve/verify these implementation details before production exposure:

- AWS Region/VPC/subnets, private networking, egress plan, RDS/SQS sizing, and account boundaries.
- E2B security/data-processing review, supported runtimes, network restrictions, quotas, concurrency, and cost.
- Pinned Python/C++/Java toolchain versions/image digests and numerical execution limits.
- Per-operation model/audio timeouts, token/cost budgets, and a measured threshold for `gpt-6-astra` escalation.
- Voice audio MIME/size/duration limits and versioned consent notice text; test text fallback.
- Privacy/legal review of selected retention defaults and confirmation of OpenAI/E2B data handling and regional controls.
- Assign actual author/reviewer/publisher role holders and define escalation for defective content.
- Validate final SLO/RPO/RTO, load-test thresholds, autoscaling, and alerting empirically.

Do not reopen selected provider/scope defaults without updating the ADR register and affected contracts.

## 8. Definition of V1 readiness

V1 is ready only when the agreed release scope works end to end and has passed relevant safety and operational gates. At minimum:

- A candidate can authenticate, discover a published problem, start an interview, make progress, and resume it.
- Session state and transitions remain backend-controlled and durable.
- Model failures and invalid model output fail safely.
- Hints and assessments follow policy and are grounded in candidate evidence.
- If code execution is in scope, it runs only in the approved isolated environment and hidden evaluation data stays trusted.
- Feedback and history enforce ownership and do not fabricate evidence.
- Core paths have automated tests, monitoring, and documented recovery procedures.
- Load, security, privacy, and restore checks have been performed against the agreed V1 criteria.
- K-029 implements the selected turn-based voice mode and its release tests pass; until then, product claims and release status must state that voice is selected but not yet delivered.

A milestone is not complete just because its feature code has merged; it is complete when its acceptance criteria and relevant release gates pass.
