# Architecture Decision Records — V1 Register

**Status:** Consolidated V1 decision baseline  
**Purpose:** Record consequential architecture choices and the reasoning behind them.  
**Related documents:** System Master PRD, System HLD, Data and Domain Architecture, Infrastructure and Operations Blueprint, Build Dependency Graph, V1 Scope and Release Plan

## 1. How to use this register

This file consolidates the initial architecture decisions so the project has one place to find the current decision, alternatives, consequences, and revisit triggers. It is not a substitute for reviewing the linked designs.

Status meanings:
- **Accepted baseline:** Use this choice unless new evidence or a deliberate architecture review changes it.
- **Provisional:** A planning assumption/target needs measurement or implementation validation before it can be treated as a proven guarantee.
- **Open:** No decision has been made; downstream work must not assume one.

When a decision changes, update this record and all affected contracts/designs in the same change. For major future decisions, add a separate ADR file if the register becomes difficult to navigate.

## 2. Decision summary

| ID | Decision | Status |
|---|---|---|
| ADR-001 | Start with a modular monolith | Accepted baseline |
| ADR-002 | Separate trusted control/application workloads from untrusted code execution | Accepted baseline |
| ADR-003 | Backend owns interview state and transitions | Accepted baseline |
| ADR-004 | Use PostgreSQL as the primary source of truth | Accepted baseline |
| ADR-005 | Use current session snapshot plus append-only session events | Accepted baseline |
| ADR-006 | Publish immutable, versioned Problem Pack releases | Accepted baseline |
| ADR-007 | Use deterministic rules plus model-assisted interpretation | Accepted baseline |
| ADR-008 | Approach matching must support confidence, abstention, and clarification | Accepted baseline |
| ADR-009 | Execute candidate code in an E2B-managed ephemeral sandbox behind an adapter | Selected for V1; production security gate applies |
| ADR-010 | Use AWS ECS/Fargate, RDS PostgreSQL, and managed supporting services; do not require Kubernetes | Accepted V1 platform baseline |
| ADR-011 | Use Amazon SQS Standard with DLQ, idempotent consumers, and an outbox where needed | Accepted V1 queue baseline |
| ADR-012 | Keep OpenAI model/audio calls behind a Model Gateway with operation-specific model mapping | Accepted V1 provider baseline |
| ADR-013 | Design initially around approximately 1,000 users, 100 active interviews, and 10 concurrent executions | Provisional capacity assumptions |
| ADR-014 | Define initial SLO targets but validate them through measurement | Provisional targets |
| ADR-015 | Preserve evidence and version metadata for candidate feedback | Accepted baseline |
| ADR-016 | Use Clerk for authentication with an internal stable user identity | Accepted V1 provider choice |
| ADR-017 | Include turn-based voice input, transcription, visible transcript, and speech output in V1 | Accepted V1 product scope |
| ADR-018 | Support Python, C++, and Java in V1 | Accepted V1 language scope |
| ADR-019 | Apply explicit data retention and no-durable-raw-audio policy | Accepted V1 default; privacy review required |
| ADR-020 | Use author + independent technical review for Problem Pack publication | Accepted V1 content process |
| ADR-021 | Use TypeScript + Next.js for the trusted application | Accepted owner choice, 2026-10-17 |
| ADR-022 | Develop locally with explicit provider and cloud verification gates | Accepted owner choice, 2026-10-18 |
| ADR-023 | Use verified operator identity plus configuration allowlists for initial content permissions | Accepted owner choice, 2026-10-23 |
| ADR-024 | Allow Groq for explicit local Model Gateway development | Accepted owner choice, 2026-10-23 |

## 3. Decisions

### ADR-001 — Start with a modular monolith

**Status:** Accepted baseline

**Context:** The initial product needs several domains—identity, content, interview orchestration, model integration, code execution, and feedback—but the expected initial scale is modest and the team should avoid unnecessary distributed-systems overhead.

**Decision:** Implement domain modules within one backend application initially. Keep module ownership, interfaces, and dependency rules explicit. Run workloads with distinct trust, resource, or scaling requirements separately when needed (notably code execution and background work).

**Alternatives considered:**
- Microservices for each domain: stronger independent deployment but adds network contracts, distributed transactions, operational overhead, and debugging complexity too early.
- A fully unstructured monolith: simple at first but encourages domain coupling and makes later change risky.

**Consequences:**
- Shared process and deployment can simplify the main business flow.
- Modules must not reach into another module's repositories or bypass its public interface.
- Workload separation does not imply every domain must become a separate service.
- Extraction can be considered later if measured scaling, ownership, or reliability needs justify it.

**Revisit when:** Independent deployment, scaling, isolation, or team ownership requirements become concrete and cannot be handled cleanly with module/workload boundaries.

### ADR-002 — Separate trusted application/control workloads from untrusted execution

**Status:** Accepted baseline

**Context:** Candidate-submitted code is hostile input. It must not gain access to application credentials, data stores, hidden tests, other candidates' work, or internal network services.

**Decision:** Keep session policy, evaluation orchestration, persistence, and authorization in trusted backend workloads. For V1, use a managed E2B sandbox behind a narrow execution adapter, with an ephemeral isolated environment per run and strict resource/network controls. Candidate code does not execute inside the API or ordinary trusted worker process.

**Alternatives considered:**
- Run code in the API process: rejected due to unacceptable blast radius.
- Run code in ordinary application workers with broad credentials/network access: rejected because the isolation boundary would be weak.
- Self-managed microVM/container fleet: deferred for V1 because it imposes substantial security and operational ownership.
- Managed E2B sandbox behind an adapter: selected as the initial managed execution boundary, subject to production threat testing and provider review.

**Consequences:**
- Execution needs a narrow internal contract and explicit outcome taxonomy.
- The trusted evaluator keeps hidden tests and expected outputs outside the sandbox.
- Security testing and capacity/backpressure are release gates.

**Revisit when:** The implementation platform is selected; the trust boundary remains mandatory even if the technology changes.

### ADR-003 — Backend owns interview state and transitions

**Status:** Accepted baseline

**Context:** A conversational model can produce plausible but inconsistent responses, skip steps, disclose hints too early, or invent evidence. The product requires reproducible policy and controlled learning progression.

**Decision:** The backend state machine owns the current stage, allowed actions, transition guards, and persistence. The LLM generates or interprets language within the current stage and returns structured proposals that the backend validates.

**Alternatives considered:**
- Let the model decide the full workflow: rejected due to unpredictability, weak auditability, and policy bypass risk.
- Make every utterance a rigid scripted flow: rejected because it limits natural clarification and discussion.

**Consequences:**
- State transitions must be deterministic and testable.
- Model outputs are untrusted inputs to application policy.
- Timeouts or malformed outputs must not corrupt session state.
- State machine and model-interaction contracts are foundational documents.

**Revisit when:** Not expected to change for V1. Individual transition policies can evolve through versioned design changes.

### ADR-004 — Use PostgreSQL as the primary source of truth

**Status:** Accepted baseline

**Context:** The V1 product has relational entities and consistency requirements across users, problem packs, sessions, submissions, and feedback. Initial scale does not justify multiple specialized databases.

**Decision:** Use managed PostgreSQL for primary transactional data. Use object storage for large immutable artifacts only when practical need arises; keep their metadata and references in PostgreSQL.

**Alternatives considered:**
- Document database as the primary store: not selected because key relationships and transactional workflows are relational.
- Multiple databases per domain: rejected as premature operational complexity.
- Event store as the sole source of truth: rejected for V1 due to added replay/schema complexity.

**Consequences:**
- Schema migrations, indexes, connection pooling, backups, and restore tests are required.
- Avoid sharding and read replicas until profiling or availability needs justify them.
- The exact schema and indexes are refined in feature-level technical designs.

**Revisit when:** Measured data size, query patterns, throughput, or availability needs outgrow a well-operated PostgreSQL deployment.

### ADR-005 — Use snapshot plus append-only session events

**Status:** Accepted baseline

**Context:** Sessions must resume efficiently while retaining an audit trail of meaningful transitions and the evidence used in evaluation.

**Decision:** Persist the current session snapshot for fast resume and append versioned events for meaningful transitions. Write snapshot and event changes transactionally. Use optimistic concurrency or an equivalent guard to prevent competing requests from advancing a session inconsistently.

**Alternatives considered:**
- Snapshot only: simpler, but weak auditability and recovery context.
- Event sourcing as the sole state source: strong replay model but more complexity than required for V1.
- Snapshot plus events: selected as a pragmatic balance.

**Consequences:**
- Event types and payloads need schema versions.
- Events are not a substitute for current state; snapshots remain the efficient read model.
- Use an outbox record in the same transaction when a committed state change must trigger asynchronous publication.
- Replay/recovery behavior needs explicit tests.

**Revisit when:** Event volume, audit requirements, or replay needs materially change.

### ADR-006 — Publish immutable, versioned Problem Pack releases

**Status:** Accepted baseline

**Context:** Interview outcomes depend on the exact statement, reference approaches, hints, tests, follow-ups, and rubrics used at the time.

**Decision:** Content moves through draft, validation, review, and publish stages. Each published Problem Pack version is immutable. A session pins the version it started with; corrections create a new version rather than silently mutating active sessions.

**Alternatives considered:**
- Edit published content in place: rejected because historical sessions become ambiguous.
- Copy all content into each session: rejected as the primary model because it duplicates content; session version pinning provides reproducibility with less duplication.
- Publish generated content without review: rejected for V1 quality and trust reasons.

**Consequences:**
- Content requires provenance, validation, review status, and version identifiers.
- New sessions select eligible published versions; existing sessions keep their pinned version unless an explicit migration policy is designed.
- Publishing operations and validation rules are part of V1 scope.

**Revisit when:** A formal content migration or emergency withdrawal policy is needed; immutability remains the default.

### ADR-007 — Use deterministic rules plus model-assisted interpretation

**Status:** Accepted baseline

**Context:** Natural-language candidate responses require semantic interpretation, while execution outcomes, stage transitions, hint order, and policy enforcement need predictable behavior.

**Decision:** Use deterministic backend logic for control, persistence, authorization, objective test outcomes, and release policy. Use the LLM for conversational wording and bounded semantic assessment, with validated structured outputs and evidence capture.

**Alternatives considered:**
- Model-only evaluation/control: rejected due to nondeterminism and weak enforcement.
- Rules-only evaluation: rejected because candidate explanations vary in wording and require semantic interpretation.
- Hybrid: selected to balance flexibility and control.

**Consequences:**
- Model assessment must be calibrated against reviewed examples.
- Keep model, prompt/policy, rubric, and content versions for reproducibility.
- Do not claim that a model-derived score is objectively correct without evaluation evidence.
- Provide safe fallback paths when the model cannot produce a valid result.

**Revisit when:** Evaluation quality data suggests a particular operation should become rule-based, use a different model, or require human review.

### ADR-008 — Approach matching supports confidence, abstention, and clarification

**Status:** Accepted baseline

**Context:** Candidate approaches may be incomplete, unconventional, or unlike the curated reference. Forcing every answer into a known category risks false feedback.

**Decision:** The matcher returns a candidate match with evidence and confidence, or an explicit unknown/ambiguous result. Low-confidence cases use clarification or open-ended assessment rather than a forced label.

**Alternatives considered:**
- Always select the nearest reference approach: rejected because it creates false certainty.
- Only exact-string/pattern matching: rejected because explanations vary.
- Confidence-aware matching with abstention: selected.

**Consequences:**
- Confidence thresholds and evaluation sets must be defined and tested.
- Curated references are aids, not an exhaustive list of valid algorithms.
- Feedback must distinguish missing evidence from evidence of incorrect reasoning.

**Revisit when:** A reviewed evaluation set provides evidence for threshold changes or a different matching strategy.

### ADR-009 — Use an E2B-managed ephemeral sandbox behind an adapter

**Status:** Selected for V1; production security gate applies

**Context:** Code execution is necessary for objective implementation feedback but is a major security and resource risk.

**Decision:** Use the managed E2B sandbox for V1 through a narrow internal execution adapter. Each run must use an ephemeral isolated environment with enforced CPU/memory/time/process/output limits, the narrowest feasible filesystem, no network by default, no application credentials, and forced cleanup. Keep the trusted evaluator and hidden expected outputs outside the sandbox. Do not expose production execution until the chosen service/configuration passes threat testing, provider data-processing/region review, runtime feasibility checks, and cost/concurrency validation.

**Alternatives considered:**
- Execute on the API host: rejected.
- Long-lived shared worker without per-run isolation: rejected as the default due to cross-run contamination and blast radius.
- Ephemeral sandbox per execution: selected as the baseline; E2B is the chosen managed provider for V1, behind the execution adapter and subject to the stated release gate.

**Consequences:**
- E2B configuration, provider region/data handling, network restrictions, quotas, cleanup, and concurrent-execution limits must pass a documented security and cost review before public execution is exposed.
- Queue depth and concurrency must be bounded.
- Infrastructure failures must be distinguishable from candidate failures.

**Revisit when:** E2B does not pass the production security, data-processing, region, runtime, cost, or operational gates, or threat testing identifies a weaker boundary.

### ADR-010 — Use AWS ECS/Fargate, RDS PostgreSQL, and managed services; do not require Kubernetes

**Status:** Accepted V1 platform baseline

**Context:** V1 needs independently scalable API and trusted worker workloads, a durable relational source of truth, a managed queue, secrets handling, and operational telemetry without operating a Kubernetes control plane.

**Decision:** Use Amazon ECS on Fargate for API and trusted workers, Amazon RDS for PostgreSQL, AWS Secrets Manager and least-privilege IAM task roles, and CloudWatch for logs/metrics/alarms. Use a separate managed E2B sandbox integration for untrusted candidate code. Select and document the AWS Region and networking plan during deployment implementation.

**Alternatives considered:**
- EKS/Kubernetes from day one: capable but adds operational burden before demonstrated need.
- Single host for every workload: rejected because of resource contention and trust-boundary risk.
- AWS ECS/Fargate plus managed RDS/SQS and separate sandbox: selected for V1.

**Consequences:**
- The AWS Region, networking, ingress, task sizing, deployment automation, and resource profiles remain implementation decisions.
- The E2B execution boundary is separate from ECS/Fargate trusted application tasks; never mount application credentials or hidden tests into candidate execution.
- Deployment topology may differ by workload; review only if testing shows the selected stack cannot meet security or reliability needs.

**Revisit when:** Deployment/security tests or scaling evidence show that the selected AWS baseline is unsuitable.

### ADR-011 — Use bounded asynchronous jobs and an outbox where needed

**Status:** Accepted V1 queue baseline

**Context:** Code execution and selected background work need durable dispatch without blocking live interview turns.

**Decision:** Use Amazon SQS Standard with a dead-letter queue. Assume at-least-once delivery and possible reordering; consumers must be idempotent, validate execution/job state before side effects, use bounded receive counts and appropriate visibility timeouts, and expose DLQ alarms/recovery. Use a transactional outbox when PostgreSQL changes and SQS publication must remain consistent. Standard queues are selected because strict FIFO ordering is not needed for V1: session order is enforced by database versions/state guards, while each execution is keyed by a stable ID.

**Alternatives considered:**
- Synchronous work for all code execution: rejected because execution can be slow and resource-intensive.
- Kafka: rejected as unnecessary complexity at initial scale.
- SQS FIFO: not selected because session/state ordering is enforced transactionally and strict global or per-group ordering is not required; reconsider only if a concrete workflow needs it.
- SQS Standard with DLQ: selected.

**Consequences:**
- The queue product is selected; implement queue configuration, IAM access, visibility timeouts, retry/redrive, DLQ alarms, and an operator recovery runbook.
- Job handlers must be safe to retry and must verify authoritative database/job state before side effects.
- A transactional outbox is required for critical DB-to-SQS dispatch paths that cannot tolerate a lost publish after a successful transaction.

**Revisit when:** Job volume, ordering, throughput, or delivery guarantees outgrow the initial queue.

### ADR-012 — Route all model-provider calls through a Model Gateway

**Status:** Accepted V1 provider/model baseline

**Context:** The product requires structured text interpretation plus transcription and speech synthesis, and model choices must be consistent, auditable, and cost-controlled.

**Decision:** OpenAI is the sole approved model provider for V1 staging/production. ADR-024 permits an explicit local-development Groq exception using synthetic inputs only. All calls go through a Model Gateway. Initial operation mapping: `gpt-6.1-sol` for interviewer turns, approach assessment, hint support, and feedback; `gpt-6-luna` for focused intent/stage classification; `gpt-6-astra` is not on the default path and may be enabled only as a benchmarked, budget-approved escalation; `gpt-transcribe` for bounded audio transcription; `gpt-4o-mini-tts` for interviewer speech output. All IDs live in central configuration, not feature code. Model ID availability and behavior are re-verified before deploy; prompt/model versions and usage are recorded.

**Alternatives considered:**
- Direct SDK calls from each feature: rejected due to coupling and inconsistent controls.
- A complex multi-provider routing platform immediately: rejected as premature.
- A thin internal gateway with explicit provider adapters: selected.

**Consequences:**
- Domain modules depend on the internal gateway interface, not provider SDKs.
- Model routing remains operation-specific; no second staging/production provider or silent fallback is approved for V1. ADR-024's local synthetic-data exception does not change this production boundary. A failed provider call follows a recoverable failure path unless a deliberately approved same-provider fallback is configured.
- The gateway should stay small until measured needs justify advanced routing.

**Revisit when:** Model quality, cost, latency, or availability data justifies new provider-routing capabilities.

### ADR-013 — Use initial capacity assumptions as test inputs, not guarantees

**Status:** Provisional capacity assumptions

**Context:** The PRD and infrastructure blueprint need an initial scale target to guide early design, but actual concurrency and workload shape are not yet measured.

**Decision:** Plan initially around approximately 1,000 registered/supported users, 100 simultaneous active interviews, and 10 concurrent code executions. Treat these as load-test inputs and revise them using observed usage, model latency, and execution duration.

**Alternatives considered:**
- Design for very large scale immediately: rejected because it adds cost and complexity without evidence.
- Ignore capacity until launch: rejected because model calls and code execution have clear saturation/cost risks.
- Explicit modest planning assumptions plus load tests: selected.

**Consequences:**
- Execution queues and model usage need hard limits.
- Load tests must use representative interview and execution patterns.
- Registered users are not a substitute for concurrency assumptions.

**Revisit when:** Pilot usage or load-test results show different concurrency, request rate, or execution characteristics.

### ADR-014 — Define initial SLO targets and validate them empirically

**Status:** Provisional targets

**Context:** Product and infrastructure planning need measurable expectations, but model-provider and sandbox latency are partly external and variable.

**Decision:** Use the current initial targets as planning goals: 99.5% monthly core-service availability; ordinary backend operations P95 below 500 ms excluding model and execution waits; live AI turn P95 below 5 seconds where provider behavior permits. Measure model and execution latency separately and revise targets based on evidence.

**Alternatives considered:**
- Promise a strict end-to-end latency including third parties: rejected because it is not fully controlled by the application.
- Launch without measurable targets: rejected because reliability cannot be evaluated consistently.
- Separate service targets and external dependency metrics: selected.

**Consequences:**
- Instrument each latency segment and define alerting once baseline traffic exists.
- Do not label provider latency as backend latency.
- SLO targets are not considered proven until measured in the deployment environment.

**Revisit when:** Staging/load-test and beta data are available.

### ADR-015 — Preserve evidence and version metadata for feedback

**Status:** Accepted baseline

**Context:** Feedback should teach candidates and remain explainable. A single opaque score cannot show what the candidate did well or what needs improvement.

**Decision:** Store feedback dimensions separately and link assessment claims to observable evidence such as candidate statements, hint exposures, code/test outcomes, and completed tasks. Preserve the relevant Problem Pack, rubric, prompt/policy, and model versions.

**Alternatives considered:**
- One aggregate score only: rejected because it hides the basis of the assessment.
- Free-form model-generated report without evidence links: rejected due to weak auditability.
- Dimensioned feedback with evidence and versioning: selected.

**Consequences:**
- Evaluation schemas need evidence references and provenance.
- Model-generated interpretations must be distinguished from objective execution facts.
- Feedback quality requires a reviewed evaluation set and defect reporting.

**Revisit when:** Rubric studies or candidate research supports changes to dimensions or presentation.

### ADR-016 — Use Clerk for candidate authentication

**Status:** Accepted V1 provider choice

**Decision:** Use Clerk for managed sign-in/session issuance. The API verifies Clerk session tokens server-side, maps the validated provider subject to an internal stable `user_id`, and performs authorization against that internal identity. Keep an authentication interface and development/test adapter; the test adapter must refuse to start in production. Do not store passwords in the application.

**Alternatives considered:** Supabase Auth, Auth0, AWS Cognito/Firebase, custom authentication. Clerk is selected for the initial product's integration speed; provider-specific details stay at the boundary.

**Revisit when:** Verified usage, requirements, cost, or organization needs justify a deliberate provider change.

### ADR-017 — Include turn-based voice in V1

**Status:** Accepted V1 product scope

**Decision:** Candidate audio is captured per turn, transcribed, shown as text, and processed through the ordinary backend interview action path. Interviewer response text is displayed and can be spoken using TTS. Text input remains available. V1 excludes always-on microphones and real-time bidirectional voice. Explicit, versioned consent is required before recording/submitting audio. Raw candidate audio is not durably stored by the application.

**Alternatives considered:** Text-only, transcription-only, or a fully real-time voice agent. Turn-based input plus text/audio output best matches the product goal without requiring a real-time audio state machine.

**Revisit when:** Candidate research or latency metrics justify live audio and its additional safety/operational requirements.

### ADR-018 — Support Python, C++, and Java in V1

**Status:** Accepted V1 language scope

**Decision:** The code runner allowlist initially contains Python, C++, and Java only. Pin supported versions, compiler/runtime commands, and image digests; include a language in production only after compile/run/resource-limit tests pass for its pinned toolchain.

**Revisit when:** Candidate demand and test/security capacity justify adding a language.

### ADR-019 — Apply explicit V1 retention defaults

**Status:** Accepted defaults; privacy review required

**Decision:** Retain transcripts/session history 365 days, source code 90 days, execution output 30 days, and security/audit logs 90 days. Do not durably store raw candidate audio. Set RDS automated backup retention to 7 days initially and test restore/deletion behavior. Provider-side handling is separate from application retention and must be verified for OpenAI processing before launch.

**Revisit when:** Privacy/legal review or user research requires a different period or deletion guarantee.

### ADR-020 — Require independent technical review for Problem Pack publishing

**Status:** Accepted V1 content process

**Decision:** An author prepares the pack and records provenance. A different technical reviewer validates statement/constraints, alternative approaches, complexity, sample/hidden test correctness, hint ordering, variants, and licensing/provenance. Authors cannot approve their own work. Only a reviewer or separately authorized publisher can publish; published versions are immutable and corrections create a new version.

**Revisit when:** Catalogue volume requires a more formal content team or specialized review roles.

### ADR-021 — Use TypeScript + Next.js for the trusted application

**Status:** Accepted owner choice, 2026-10-17; foundation implementation remains unbuilt.

**Context:** The existing architecture selects domain/trust boundaries and
providers but does not select an application language/framework. During foundation
clarification the owner answered “Typescript+NextJS”.

**Decision:** Use TypeScript + Next.js App Router with the Node.js runtime.
Route Handlers adapt the versioned API to explicit module application services.
Keep the trusted backend a modular monolith. Future UI can share the application
framework; its behavior is designed in the relevant feature. Do not introduce
FastAPI, NestJS or another backend framework as an unstated prerequisite.

**Alternatives considered:** Python/FastAPI, TypeScript/NestJS and Java/Spring
were presented; the owner selected TypeScript/Next.js. A static export or Edge-only
backend cannot supply this feature's Node/PostgreSQL process lifecycle.

**Consequences:**

- Foundation uses a small custom Node HTTP entrypoint around the public Next.js
  server API to validate settings before listening and own readiness, draining
  and pool cleanup. Standard `next start` plus instrumentation does not establish
  those exact lifecycle guarantees. This is an implementation design, verified
  by process tests; do not use undocumented Next internals.
- Custom server files must be compiled/packaged explicitly; Next.js standalone
  output cannot be combined with this custom entrypoint. Accept the ordinary
  container/dependency footprint; measure resource needs before deployment.
- Node.js 24 LTS and the maintained Next.js 16 line are the planning baselines.
  Pin secure compatible patch versions, the lockfile and container digests in
  K-001/K-002 after checking current releases; this planning step installs none.
- PostgreSQL repositories initially use `pg` and SQL; `node-pg-migrate` owns the
  migration ledger. This introduces no ORM or premature business tables.
- AsyncLocalStorage and process lifecycle dependencies need a process-scoped
  registry across Next bundles, with real process verification rather than
  assuming imported module instances are identical.
- Workers and E2B remain separate; no candidate code runs in Next.js. Clerk,
  OpenAI Gateway, SQS, privacy and release decisions remain binding.

**Impact review:** README, HLD, operations blueprint and all four foundation
documents describe the selected stack. PRD product behavior, domain records,
canonical API/event wire formats and cross-cutting contracts require no changes.
Health producer/consumer compatibility tests are required by K-004. No existing
application code or runtime consumers exist in this documentation baseline.

**Sources reviewed:** [Next.js custom server](https://nextjs.org/docs/app/guides/custom-server),
[Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers),
[Node release policy](https://nodejs.org/en/about/previous-releases),
[node-pg-migrate locking](https://salsita.github.io/node-pg-migrate/migrations/).

**Revisit when:** Measured lifecycle, bundling, container cost or product UI
requirements make the custom entrypoint unsuitable. Any revised lifecycle
implementation must still pass the foundation acceptance tests.

### ADR-022 — Develop locally with explicit provider and cloud verification gates

**Status:** Accepted owner choice, 2026-10-18.

**Context:** The owner will fund AWS resources near deployment. Local integration
must support continued feature development without misrepresenting emulated
behavior as verified managed-service behavior.

**Decision:** Build thin integrated slices using the real application containers,
real local PostgreSQL and contract-tested adapters. Future queue work may use an
SQS-compatible emulator; provider fixtures exercise deterministic success,
malformed output, timeout and failure paths. Production selections in ADR-009
through ADR-012 and ADR-016 remain binding. Ordinary local/CI runs require no
paid-provider credentials. Local completion and external acceptance are distinct.

**Consequences:**

- Foundation local review/commit T047/T048 follows T033, independently of deferred
  T034. K-028 stays incomplete until real environment evidence passes; K-006 still
  requires hosted CI. No milestone or release is declared complete by this split.
- Later features may build against the verified local configuration/secret
  baseline while K-028 remains In Progress, recording this limited dependency
  satisfaction in their engineering design. Other prerequisites remain binding.
- Adapters preserve canonical API/event and provider boundaries. The same
  application-facing contract scenarios run against local and real adapters;
  real-provider runs additionally verify authentication, SDK/API compatibility
  and service-specific behavior. Endpoint changes alone do not prove parity.
- Each provider feature plans a bounded real-service smoke/feasibility gate at
  its integration milestone. If access/budget is unavailable, record it on the
  owning existing card; only independent fixture-backed work may proceed.
  Clerk token verification, OpenAI quality/audio behavior and E2B isolation must
  pass before affected provider-backed acceptance, not be assumed from fixtures.
- Before production, authorized temporary AWS staging must verify real IAM,
  networking, RDS TLS, ECS secret injection/replacement/rotation, queue semantics,
  deployment/rollback, monitoring, backup restore and representative load.
  T034 owns environment evidence; K-026 owns remaining operational release gates.
- Emulators/fixtures never authorize running candidate code in the trusted app
  or prove E2B security. Test adapters/endpoints/credentials must fail closed in
  staging/production; there is no automatic fallback from a failed real provider.
- No dependency, emulator, paid subscription, infrastructure or IaC tool is
  installed/selected by this decision. Tool versions, license, API coverage and
  limitations are reviewed in the owning feature before adoption.

**Alternatives:** Funding persistent AWS environments immediately increases early
cost. Deferring every real-provider check until launch leaves quality, security
and compatibility risks undiscovered. Local integration plus milestone smoke
checks and final staging verification is selected.

**Impact:** Reconciled foundation's four documents, development/runbook guidance,
operations blueprint, sequencing/release dependencies and Kanban/CSV handoff.
Canonical API/event schemas, domain/session/LLM/execution/voice contracts and
production stack do not change; no producer/consumer wire migration is needed.
This is documentation policy, not executed emulator/provider evidence.

**Revisit when:** A provider-specific limitation blocks a vertical slice or
measured staging behavior differs from local assumptions.

### ADR-023 — Use configuration allowlists for initial content staff permissions

**Status:** Accepted owner choice, 2026-10-23; implementation remains planned.

**Context:** Feature 3 needs independent human review and authorized seed
publication before the full K-024 administration workflow. Candidate identity
already exists, but a signed-in candidate must not automatically become staff.
The owner accepted the recommended small-team configuration allowlist after
reviewing it against database-managed role records.

**Decision:** Verify the operator through the existing identity boundary and map
to an active internal user ID. Content publishing checks a strict, reviewed,
versioned server-configuration allowlist for `review_content`, `publish_content`
and `withdraw_content`. Default grants are empty; unknown permissions or malformed
entries fail configuration validation. Permission changes require reviewed
configuration replacement/restart. This adds no database role manager, provider
role setup or admin UI.

**Consequences:**

- Operator commands read ephemeral credentials from standard input; do not put
  credentials in command-line values, logs or committed configuration. The
  allowlist contains only non-secret internal IDs and permission names.
- An operation uses one immutable configuration revision. Review/publication/audit
  evidence records its revision and digest. Process replacement follows the
  existing drain/lifecycle rules; it is not instantaneous in-flight revocation.
- ADR-020's different-author/reviewer rule is unchanged. New publication requires
  current reviewer and publisher grants; removing a reviewer blocks unpublished
  approvals. Exact retries of an already-committed release require current
  publisher permission and matching immutable content/review evidence, and do
  not reselect/re-enable a release or generate another approval.
- Actual author/reviewer/publisher assignments, independent content/source-rights
  approval and configured-environment verification remain acceptance gates. No
  actual staff grant or provider mutation is authorized by this decision.
- Clerk/test-adapter environment restrictions and privacy rules remain binding.
  A submitted review file, email/name or CLI flag is not proof of authority.

**Alternatives:** Database role records support changes without restart, but
need audited grant/revoke operations and more authorization tests. A full admin
interface remains later work. Unsigned identity/approval flags would bypass the
required authority checks and are rejected.

**Impact:** Reconcile Feature 3's four canonical documents and operator test plan.
Identity's verified-caller contract, candidate API payloads, event wire schemas
and provider boundaries remain unchanged. Catalogue `400` declarations are a
separate API-compatibility correction, covered by contract-consumer checks.

**Revisit when:** Staff count or permission-change frequency justifies a reviewed
database-backed role workflow under the content-administration feature.

### ADR-024 — Allow Groq for explicit local Model Gateway development

**Status:** Accepted owner choice, 2026-10-23; not a production provider change.

**Context:** The owner obtained a Groq key to test Stage 4 before funding OpenAI
usage. ADR-012 originally permitted OpenAI only; the owner accepted this narrow
development exception after consistency review, rather than inferring it from
API compatibility.

**Decision:** Allow an opt-in Groq text adapter in local development,
using `openai/gpt-oss-120b` initially. Ordinary tests continue to use synthetic
fixtures without keys; test mode rejects real-provider dispatch. Groq requires
`APP_ENV=development` and a trusted synthetic-input harness. Staging/production
reject fake/Groq adapters. No automatic
fallback, new production provider, Groq audio, or model escalation is selected.

**Consequences:** Keep keys in
server-only configuration and use synthetic development inputs. OpenAI's
operation map, provider data review, separate real-service acceptance and
deployment gates remain binding. Groq results do not qualify OpenAI operations.
No quota, unlimited free use, or provider parity is assumed.

**Alternatives:** Fake-only development costs nothing but cannot exercise real
transport. Funding OpenAI immediately tests the intended provider directly.
Production multi-provider routing adds scope and remains deferred.

**Impact:** Stage 4's four canonical documents and gateway README describe this
accepted exception. ADR-012/ADR-022, canonical API/events, session/LLM/voice contracts and
Kanban status remain in force. No application code or provider calls are made
by this documentation change. ADR-012, the LLM policy, affected architecture/
sequencing summaries and the gateway documents reflect the accepted exception
while preserving their staging/production baseline.

**Revisit when:** OpenAI funding is available or measured development needs
justify a different provider arrangement.

## 4. Remaining implementation decisions and validation gates

Major V1 provider/scope choices have been made. The following details remain implementation-level decisions or mandatory verification gates; do not silently invent them where they affect security, cost, or service behavior.

| Topic | Current baseline | Still to decide/verify | Needed before |
|---|---|---|---|
| AWS Region/network topology | ECS/Fargate + RDS PostgreSQL + SQS Standard | Region, VPC/subnets, egress strategy, ALB/WAF choice, sizing and account boundaries | Production infrastructure design |
| E2B production suitability | E2B managed sandbox behind adapter | Security review, data-processing terms/region, network restrictions, supported runtimes, quotas, concurrency, cost | Enabling candidate code for production users |
| Runtime images | Python, C++, Java | Exact supported versions, compiler/runtime commands, pinned image digests, per-language limits | Code-execution feature implementation |
| Model budgets | OpenAI model map in ADR-012 | Per-operation timeouts, token budgets, per-user limits, Astra escalation trigger and budget; prove quality on reviewed eval set | Production Model Gateway |
| Voice UX | Turn-based voice, transcript visible, TTS output, text fallback | Supported audio mime-types/duration/size, UI consent wording/version, retry UX and latency thresholds | Voice feature implementation |
| Data privacy | 365d transcript/history, 90d source, 30d execution output, 90d audit logs, no durable raw audio, 7d RDS backup | Privacy/legal review, OpenAI account data controls/residency, deletion SLA and backup expiry verification | Production launch |
| Problem Pack roles | Author + independent technical reviewer; ADR-023 configuration permission allowlists; no self-approval | Assign actual people/role holders, reviewed configuration and escalation process for disputed/defective content | First published catalogue |
| Capacity/SLOs | 1,000 users, 100 interviews, 10 concurrent executions; initial targets remain provisional | Load-test headroom, autoscaling thresholds, final RPO/RTO and alert thresholds | Release approval |

The following choices are resolved and must not be listed as open: Clerk authentication, turn-based voice in V1, Python/C++/Java, OpenAI-only staging/production model provider with ADR-024 local exception, AWS ECS/Fargate + RDS PostgreSQL + SQS Standard, E2B-managed sandbox default, the retention defaults above, and author/reviewer content governance.

## 5. Vendor documentation checked for the selected baseline

The following official vendor references were checked on **2026-10-16** while recording these choices. They support integration planning; they do not replace contract/security review, a proof of concept, or verification of account-specific pricing, quotas, regions, and terms at implementation time.

- Clerk server-side session-token verification: https://clerk.com/docs/guides/sessions/manual-jwt-verification
- OpenAI model catalog and model IDs: https://developers.openai.com/api/docs/models
- OpenAI transcription guide: https://developers.openai.com/api/docs/guides/transcription
- OpenAI speech-generation API: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
- AWS ECS best practices: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-best-practices.html
- Amazon SQS Standard delivery semantics: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html
- Amazon SQS dead-letter queues: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
- RDS automated-backup retention: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.BackupRetention.html
- E2B security/isolation description: https://changelog.e2b.dev/security

## 6. Change management

When a decision changes:

1. State the new evidence or requirement.
2. Compare realistic alternatives and their trade-offs.
3. Update the relevant ADR status and rationale.
4. Identify impacted PRD, HLD, domain, infrastructure, API, event, and feature documents.
5. Update those documents and tests in the same change where practical.
6. Record migration or compatibility steps if implementation already exists.

Do not change an accepted baseline silently in a feature implementation.
