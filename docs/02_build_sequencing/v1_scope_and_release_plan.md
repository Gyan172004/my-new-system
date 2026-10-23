# V1 Scope and Release Plan

**Status:** Proposed release baseline  
**Product:** AI DSA Interview Practice Platform  
**Target scale:** Approximately 1,000 users  
**Related documents:** System Master PRD, System HLD, Data and Domain Architecture, Infrastructure and Operations Blueprint, Build Dependency Graph, Architecture Decision Records

## 1. Purpose

This document turns the V1 product scope into release milestones and acceptance gates. It deliberately defines outcomes rather than calendar dates; dates and estimates should be added after the first vertical slice reveals the actual delivery rate.

V1 should demonstrate that candidates can practice a curated DSA problem in a controlled interview, receive safe and evidence-backed guidance, run code in an isolated environment, and review their performance.

## 2. V1 product outcome

A candidate can complete a supported interview flow for a reviewed Problem Pack and receive feedback that distinguishes reasoning, communication, approach quality, implementation correctness, complexity analysis, hint dependence, and variant transfer where assessed.

The system must preserve session state and the exact content/policy versions needed to interpret the outcome.

## 3. Scope boundaries

### In scope

- A curated and versioned DSA problem catalogue.
- A reviewable Problem Pack structure with statement, constraints, examples, edge cases, reference approaches, hints, tests, follow-ups, variants, and provenance as applicable.
- Candidate identity and the minimum per-session context needed by the interviewer. Cross-session persisted profile/preferences are added only where a concrete V1 use case justifies them.
- Backend-owned interview state machine and resumable sessions.
- Model Gateway with timeouts, bounded retries, structured-output validation, and usage/cost tracking.
- Candidate problem restatement, clarification, sample tracing, initial approach discussion, and guided hints.
- Turn-based voice capture, transcription, visible transcript, and generated interviewer speech in V1, with a text fallback; this is not real-time/always-on audio. K-027 records the scope decision and K-029 implements it.
- Approach assessment with confidence and explicit abstention.
- Code editor/submission workflow for Python, C++, and Java, each with pinned runtime/toolchain versions and tested resource profiles.
- Isolated code execution with resource limits and hidden-test protection.
- Evidence-backed feedback and session history.
- Basic content validation/review/publishing operations.
- Basic operational monitoring, backup/restore procedures, rate limits, and deployment rollback.

### Out of scope for V1

- Automatically supporting every external DSA problem or reproducing third-party solution content.
- Fully autonomous, unreviewed Problem Pack publication.
- Guaranteed exhaustive coverage of all possible variants.
- Public social features, leaderboards, contests, or a general-purpose coding platform.
- A microservices-first architecture, Kubernetes by default, multi-region active-active, sharding, Kafka cluster, or service mesh without demonstrated need.
- Advanced adaptive learning or opaque candidate rankings.
- Audio-based personality inference or candidate surveillance.
- A promise of interview success or a perfect score from the AI.
- Supporting every language, framework, and execution environment from day one.
- Always-on/real-time bidirectional voice in V1; only turn-based capture/transcription and generated speech are included.

## 4. Release milestones

### M0 — Engineering foundation

**Outcome:** The application can be built, tested, configured, and operated consistently in a development environment.

Includes:
- Repository and module conventions.
- Configuration validation and secret handling.
- Structured logging and request correlation.
- Database migration workflow.
- Health and readiness endpoints.
- CI with formatting/linting, unit tests, and basic dependency checks.
- Development/staging/production configuration separation.
- Establish the local configuration/secret baseline and document the selected AWS environment, secret-injection and least-privilege conventions (K-028). Actual staging/production evidence is deferred to deployment readiness under ADR-022; K-028 remains incomplete until verified.
- K-027 (voice scope decision) is complete. The voice API/contract is designed; the voice experience itself is delivered under K-029 in M2.

**Acceptance criteria:**
- A clean checkout can follow documented steps to run the application and tests.
- Migrations can be applied to an empty development database.
- CI fails on a deliberately failing test or lint check.
- Health/readiness behavior is documented and tested.
- No secrets are committed or emitted in logs.

### M1 — Persisted interview vertical slice

**Outcome:** A candidate can start and resume a minimal interview session for one seeded problem.

Includes:
- Minimal identity/authentication path appropriate to the development stage.
- One valid, versioned Problem Pack.
- Session creation and pinned pack version.
- Snapshot plus event persistence.
- Server-side transition validation and idempotent commands.
- A deterministic or stub interviewer to validate the control flow.
- Session reload/resume.

**Acceptance criteria:**
- A candidate can open a problem, start a session, answer a question, advance one valid stage, and reload the session.
- Invalid transitions are rejected server-side.
- Concurrent/retried commands cannot silently duplicate a transition.
- Another user cannot read or mutate the session.
- The session records the pack version and state/event sequence.
- Automated integration tests cover the happy path and key failure paths.

### M2 — Model-driven interview and guided reasoning

**Outcome:** The session uses an LLM through the Model Gateway while the backend retains control.

Includes:
- Model Gateway, structured outputs, timeouts, bounded retries, and cost telemetry.
- Stage-specific orchestration and prompt context.
- Problem restatement and sample tracing.
- Initial approach assessment.
- Confidence-aware matching to curated approaches.
- Explicit abstention and clarification path.
- Ordered, one-at-a-time hint policy.
- V1 turn-based voice capture, explicit versioned consent, transcription through the Model Gateway, visible transcript, on-demand interviewer speech, and text fallback (K-029).

**Acceptance criteria:**
- Model output cannot advance a session without backend validation.
- Malformed or unsafe output is rejected or handled by a defined fallback.
- Provider failure does not corrupt session state or count as candidate failure.
- Approach matching records confidence/evidence and can abstain.
- Hint exposure is recorded and hints cannot be skipped or bulk-revealed by the model.
- Voice transcripts enter the same state machine as typed responses; revoked/missing consent or provider failure never advances state; audio is not durably stored by the application.
- Evaluation tests cover representative candidate answers and adversarial/off-topic inputs; voice tests cover consent, payload limits, failure handling, text fallback, and audio/log non-persistence.

### M3 — Safe code execution and evidence-backed feedback

**Outcome:** Candidates can submit code, run supported tests, and receive a feedback report based on observed evidence.

Includes:
- Separate execution coordinator and isolated sandbox workers.
- Restricted supported-language set.
- CPU, memory, time, process, output, and filesystem limits.
- Network denial by default and no application credentials in the sandbox.
- Compile/runtime/wrong-answer/timeout/memory/output/infrastructure outcome categories.
- Hidden tests and expected outputs retained outside the candidate process.
- Candidate code tracing after feasible failures.
- Feedback dimensions and evidence references.

**Acceptance criteria:**
- Candidate code never runs inside the API process.
- Sandbox security tests show no access to application secrets, database, metadata endpoints, or other sessions.
- Hidden tests and expected outputs are not exposed to candidate code or ordinary candidate-facing responses.
- Queue saturation is bounded and returns a clear retryable outcome.
- Infrastructure failures are not scored as wrong answers.
- Feedback separates observed facts from model interpretations and links claims to evidence.
- Session, submission, execution, pack, rubric, and model/policy versions are traceable.

### M4 — Curated follow-ups and content operations

**Outcome:** Reviewed content can be safely maintained, and interviews can use curated follow-ups and variants.

Includes:
- Draft/review/publish lifecycle.
- Content provenance and review metadata.
- Structural validation and test validation.
- Immutable published Problem Pack versions.
- Follow-up and variant selection.
- Deprecation/correction behavior for published packs.

**Acceptance criteria:**
- Invalid or unreviewed content cannot be published.
- Published pack versions are immutable.
- New sessions use an eligible published version; existing sessions retain their pinned version.
- Follow-up questions and variants are selected from reviewed content.
- Source provenance and reviewer status are retained.
- Content defects can be corrected by publishing a new version without silently mutating old sessions.

### M5 — Production readiness and initial launch

**Outcome:** The service can be operated at the initial target scale with measurable reliability and recoverable failures.

Includes:
- Dashboards and alerts for API, database, model, jobs, and execution.
- Rate limits and cost controls.
- Load and soak tests.
- Database backup and restore validation.
- Deployment and rollback procedure.
- Security review of the sandbox and data access boundaries.
- Incident runbooks and retention/deletion policy.
- Initial capacity validation around 100 active interviews and 10 concurrent executions, adjusted from test evidence.

**Acceptance criteria:**
- Initial SLO targets are measured and reporting is available.
- The team can restore a database backup in a test environment.
- A failed deployment can be rolled back using the documented procedure.
- Model-provider and sandbox outages produce defined, user-safe behavior.
- Load tests identify queue limits and saturation behavior.
- Critical vulnerabilities and release-blocking defects are resolved or explicitly accepted by the responsible owner.
- All V1 release gates in the System Master PRD are satisfied.

## 4.1 Local development and external verification schedule

Under ADR-022, build integrated local slices before funding persistent AWS
resources. Use the real application containers and local PostgreSQL; evaluate
queue emulation and provider fixtures in their owning features. No new testing
kit is installed by this plan. The development guide maintains the test matrix.

Foundation local handoff may be reviewed/committed after T033 without T034.
Later features may satisfy only K-028's local prerequisite with recorded passing
configuration/privacy/isolation evidence; this does not make K-028 or M0 Done.
Hosted CI acceptance remains required for K-006. Other hard dependencies remain.

At each provider integration milestone, execute a bounded authorized real-service
smoke test and record results on its owning card. Ordinary CI uses fixtures;
provider-dependent acceptance stays open if real access is unavailable. Validate
Clerk sign-in/token verification, OpenAI text/audio quality and failure behavior,
and E2B execution/isolation before claiming those integrations complete.

Near deployment, prepare authorized temporary AWS staging and verify T034/K-028
plus K-026's operational gates: IAM/networking, RDS TLS, ECS injection and secret
rotation/replacement, actual SQS retry/visibility/duplicate/DLQ behavior,
deployment/rollback, monitoring, backup restore and representative load. Provisioning,
budgets and teardown require their own deployment scope; this document provisions
nothing. Local/emulated results never substitute for these release checks.

## 5. Release gates

A milestone is not considered complete because code has merged. The milestone's acceptance criteria must pass in CI or through a recorded, repeatable verification procedure.

The V1 release is blocked if any of the following remain unresolved:
- Required real-provider acceptance or T034/K-028 and K-026 staging/operational evidence is missing, even when local/emulated checks pass.
- Candidate code can escape its intended sandbox boundary or access secrets/hidden tests.
- The model can bypass backend state-transition policy.
- Session state can be corrupted or silently lost under normal retry/refresh behavior.
- Cross-user access to sessions, submissions, or feedback is possible.
- Hidden expected outputs are exposed.
- Infrastructure failures are recorded as candidate failures.
- Critical operational paths (monitoring, backup restore, rollback) have not been verified.
- Problem Pack content used for live sessions lacks required review and provenance.
- The selected V1 turn-based voice path is not implemented and verified, including explicit consent, transcript visibility, text fallback, and no-durable-audio assertions.

## 6. Release metrics

Track at least:
- Successful session-start and session-resume rate.
- Interview-turn success rate and transition rejection rate.
- Session completion rate and technical-failure rate.
- API P95 latency and error rate.
- Model latency, timeout/rate-limit/fallback rate, structured-output rejection rate, and cost per completed session.
- Execution queue wait, execution duration, infrastructure failure rate, and saturation.
- Approach-matching precision and abstention quality on a reviewed evaluation set.
- Hint exposure and recovery after hints.
- Feedback usefulness and defect reports.
- Problem Pack validation failures and post-publication defects.

Do not use one aggregate score as a substitute for these operational and learning-quality measures.

## 7. Rollout approach

1. **Internal development:** seeded packs and test accounts; stub model/execution where needed to test orchestration contracts.
2. **Internal alpha:** real model integration and a very small set of reviewed problems; execution enabled only after isolation checks pass.
3. **Limited beta:** controlled number of candidates, explicit feedback collection, close cost and reliability monitoring.
4. **Initial release:** expand the curated catalogue and capacity only after quality, safety, and operating behavior meet the release gates.

The number of users at each rollout stage should be set when the deployment environment and monitoring are known. Do not infer launch capacity from registered-user count alone.

## 8. Deferred scope and revisit triggers

Reconsider deferred capabilities only when evidence supports them:
- Kubernetes if deployment, isolation, or autoscaling complexity exceeds the chosen PaaS/container platform.
- Additional model providers if reliability, quality, latency, or cost justifies provider routing.
- More languages when demand and sandbox support are validated.
- Advanced personalization when enough trustworthy skill observations exist.
- More elaborate event infrastructure if job volume, delivery requirements, or operational constraints outgrow the initial queue.
- Additional databases or caching only after profiling demonstrates a bottleneck.

## 9. Planning assumptions to validate

The current capacity assumptions are design inputs, not measured commitments. Validate them with representative load tests. The selected baseline is Clerk, turn-based voice, Python/C++/Java, OpenAI-only staging/production model/audio operations (ADR-024 permits local synthetic-data Groq testing), AWS ECS/Fargate + RDS PostgreSQL + SQS Standard, an E2B-managed sandbox adapter, the retention defaults in ADR-019, and independent Problem Pack review. Remaining verification includes AWS Region/network/sizing, E2B and OpenAI data/security controls, pinned toolchains/resource profiles, audio limits/consent copy, operation budgets, staff assignment, and final SLO/RPO/RTO. Do not treat the voice path as delivered until K-029 and its release tests are complete.
