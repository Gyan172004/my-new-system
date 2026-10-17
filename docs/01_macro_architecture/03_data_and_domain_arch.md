# Data and Domain Architecture

**Status:** V1 domain baseline  
**Database default:** Amazon RDS for PostgreSQL  
**Design intent:** Clear ownership, reproducible sessions, versioned learning content, and durable evidence for feedback.

## 1. Domain boundaries

The platform is divided into these logical domains. They are modules in one backend initially, not separate microservices.

| Domain | Responsibility | Primary records |
|---|---|---|
| Identity & Profile | Account identity, preferences, self-reported practice background | User, CandidateProfile |
| Problem Catalogue | Stable problem identity and discoverable metadata | Problem, Topic, ProblemTopic |
| Problem Pack | Immutable, versioned interview-ready content | ProblemPackVersion, ReferenceApproach, Variant, FollowUp, TestCase, Hint |
| Content Pipeline | Source provenance, processing and review lifecycle | SourceReference, IngestionJob, ReviewRecord |
| Interview | Session lifecycle and server-authoritative state | InterviewSession, SessionSnapshot, SessionEvent |
| Conversation | Candidate/interviewer turns and transcript metadata | ConversationTurn |
| Approach Evaluation | Candidate approach interpretation and matching evidence | ApproachAssessment, RubricEvidence |
| Code Execution | Submission lifecycle and sandbox outcomes | CodeSubmission, ExecutionJob, ExecutionResult |
| Candidate Learning | Longitudinal performance and recommended practice | SkillObservation, LearningRecommendation |
| Feedback | Per-dimension evaluation and final report | FeedbackReport, FeedbackDimensionScore |
| Operations | Outbox, idempotency, audit, cost and telemetry metadata | OutboxEvent, IdempotencyRecord, AuditRecord, ModelUsage |

## 2. Ownership rules

1. Every domain owns writes to its own records and exposes application-service operations to other modules.
2. Other domains must not update its tables directly.
3. Cross-domain references should use stable IDs and explicit DTOs.
4. Keep a single PostgreSQL database initially; schemas can separate module ownership if they simplify access control and migrations.
5. Avoid cross-domain foreign keys where they would prevent a likely future extraction. Use normal foreign keys within a domain.
6. Never share mutable ORM entities across module boundaries.
7. Administrative edits create new versions where they affect interview behavior; do not silently mutate historical evidence.

## 3. Conceptual entity relationships

```text
User ──1:1── CandidateProfile
  |
  └──1:N── InterviewSession ──1:1── SessionSnapshot
                    |
                    ├──1:N── SessionEvent
                    ├──1:N── ConversationTurn
                    ├──1:N── ApproachAssessment
                    ├──1:N── CodeSubmission ──1:N── ExecutionResult
                    └──0:1── FeedbackReport ──1:N── FeedbackDimensionScore

Problem ──1:N── ProblemPackVersion
                    ├──1:N── ReferenceApproach
                    ├──1:N── Variant
                    ├──1:N── FollowUpQuestion
                    ├──1:N── Hint
                    └──1:N── TestCase

ProblemPackVersion ──1:N── InterviewSession (pinned version reference)
ReferenceApproach ──1:N── ApproachAssessment (optional matched reference)
User ──1:N── SkillObservation ──1:N── LearningRecommendation
```

This is a conceptual model; exact relational normalization and indexes belong in engineering design and migrations.

## 4. Key entities

### User
- `id`
- authentication subject/provider identifier
- `created_at`, `updated_at`
- account status

Do not store passwords if an identity provider owns authentication. V1 uses Clerk; persist the provider subject as an external identity mapping, but use the platform's internal stable `user_id` for domain ownership and foreign keys. The API verifies Clerk session tokens server-side; never trust a user ID supplied by the browser.

### CandidateProfile
Potential cross-session profile record, persisted only for data that has a clear product use across sessions:
- `user_id`
- self-reported platforms and ratings (for example, LeetCode/Codeforces), if the candidate opts to save them
- preferred programming languages
- preferred interview/conversation language (distinct from programming language)
- practice goals and accessibility/preferences, as needed
- timestamps

A candidate can provide self-reported experience as per-session context without requiring a persistent profile for the first vertical slice. Ratings are contextual inputs, not direct score multipliers.

### Problem
Stable identity independent of individual content revisions:
- `id`
- canonical slug
- title
- difficulty
- topics/tags
- lifecycle status

### ProblemPackVersion
Immutable content version:
- `id`, `problem_id`, `version`
- canonical statement and constraints
- normalized explanation and sample-case metadata
- clarifications and invariants
- publication status and timestamp
- content schema version
- provenance/review references
- test-suite manifest/reference
- checksum

Published versions are immutable. Corrections create a new version.

### ReferenceApproach
- `id`, `problem_pack_version_id`
- name and summary
- algorithm steps and preconditions
- correctness argument/invariant
- time and space complexity
- trade-offs and failure cases
- matching features/aliases
- required knowledge and likely gaps

Multiple valid approaches can coexist, including a novel approach not in the reference catalogue.

### Variant
- `id`, `problem_pack_version_id`
- variant statement and changed constraints
- concept being tested
- expected approach family (optional)
- difficulty
- prerequisite relation (optional)
- test/reference metadata

### FollowUpQuestion
- `id`, `problem_pack_version_id`
- question text
- purpose/skill dimension
- expected answer points
- evaluation rubric
- allowed follow-up policy

### Hint
- `id`, `reference_approach_id` or pack ID
- ordinal position
- hint text
- intended conceptual step
- release condition

Hints are revealed one at a time and each exposure is recorded in session events.

### TestCase
- `id`, `problem_pack_version_id`
- category (sample/public/hidden/edge/performance)
- input reference
- expected output reference
- constraints and rationale
- validation status

Hidden expected outputs must be stored and accessed only by trusted evaluator infrastructure, never injected into candidate code or returned to the browser.

### InterviewSession
- `id`, `user_id`
- problem and pinned pack version
- `current_stage` (interview stage)
- lifecycle `status` (created/active/paused/recoverable_error/completed/abandoned)
- monotonic `version` and timestamps
- model/policy/rubric versions
- idempotency/session correlation fields

### SessionSnapshot
- `session_id`
- current state and structured state payload
- turn/version counter
- last applied event sequence
- updated timestamp

The snapshot is optimized for resume; the event log provides history and audit.

### SessionEvent
- `id`, `session_id`, monotonic sequence number
- event type and schema version
- event payload
- occurred/recorded timestamps
- correlation and causation IDs

Events should capture meaningful domain transitions, not every low-level log line.

### ConversationTurn
- `id`, `session_id`, turn number
- speaker and content/reference
- input modality and transcription metadata when relevant
- model/prompt version for generated turns
- status, timestamps, token/cost metadata

Apply retention: transcript/session history for 365 days; raw candidate audio is not durably stored by the application. Voice consent metadata (notice version, accepted/revoked status, and timestamp) is retained with session audit metadata. Audio is transiently processed by the OpenAI transcription API; provider-side data handling must be reviewed before launch.

### ApproachAssessment
- `id`, `session_id`, `turn_id`
- normalized candidate approach
- matched approach ID (nullable)
- confidence
- evidence and missing elements
- outcome: matched / ambiguous / abstained / novel
- evaluator version

Confidence must not be treated as proof of correctness.

### CodeSubmission
- `id`, `session_id`, language, source reference
- submission sequence
- status and timestamps
- execution request ID

### ExecutionResult
- `id`, `submission_id`, test identifier or safe aggregate
- outcome classification
- exit status, duration, resource usage
- bounded stdout/stderr references
- infrastructure/candidate failure distinction

Do not persist hidden inputs/expected outputs into candidate-visible records.

### FeedbackReport
- `id`, `session_id`
- rubric and evaluator versions
- overall summary
- evidence references
- generated timestamp and status

### FeedbackDimensionScore
- `id`, `feedback_report_id`
- dimension
- score or qualitative level
- supporting evidence
- confidence/limitations
- actionable next step

Prefer dimension-level feedback to a single opaque score.

### SkillObservation
- `id`, `user_id`, session/problem/variant reference
- skill dimension
- observed result and evidence reference
- observation time and evaluator version

### LearningRecommendation
- `id`, `user_id`
- recommendation type, problem/variant reference
- reason and evidence
- priority/status
- created/consumed timestamps

## 5. Versioning and reproducibility

A session must pin:
- `problem_pack_version_id`;
- interview policy/state-machine version;
- rubric version;
- prompt/template version;
- model/provider identifier and relevant configuration;
- evaluator version;
- test-suite manifest/version.

This allows a team to explain why the same answer was evaluated in a particular way. Do not promise bit-for-bit reproduction of a stochastic model response; retain the inputs, outputs, versions, and evidence needed for audit. V1 model mapping: `gpt-6.1-sol` for interviewer turns, approach assessments, hint support, and feedback; `gpt-6-luna` for focused classification; `gpt-6-astra` only for a quality-tested and budget-approved escalation. Use `gpt-transcribe` for audio input and `gpt-4o-mini-tts` for on-demand speech output. Record the configured model ID and relevant API/version metadata on each model operation.

## 6. Snapshot + event model

For each meaningful transition, update the snapshot and append the event in one database transaction. If asynchronous publication is required, insert an outbox record in the same transaction.

Example:
1. Validate the requested transition against the current state/version.
2. Apply the domain transition.
3. Update snapshot and sequence.
4. Insert event and any required outbox message.
5. Commit.
6. Publish outbox messages asynchronously and idempotently.

Use optimistic concurrency (for example, a state version/turn number) to prevent two requests from advancing the same session simultaneously.

## 7. Content provenance and publication lifecycle

Recommended lifecycle:

```text
DISCOVERED -> INGESTED -> NORMALIZED -> ENRICHED
    -> VALIDATED -> HUMAN_REVIEW -> PUBLISHED
                                  -> REJECTED
```

Store source URL, retrieval timestamp, source type, rights/licensing notes, transformation version, and reviewer decisions. Content sourced from discussion forums or solution pages must not be republished wholesale without appropriate rights review. Generated content is a draft until validated and reviewed.

A published pack version is immutable. Deprecation prevents new sessions from selecting it but does not silently alter active sessions.

## 8. Data integrity and constraints

Enforce in the database where appropriate:
- unique canonical problem slug;
- unique `(problem_id, version)`;
- unique session event sequence per session;
- unique turn number per session;
- valid foreign keys within module ownership;
- valid enumerated states and outcome classifications;
- idempotency-key uniqueness within its scope;
- one active final feedback report per session/version policy;
- published pack required fields and references.

Cross-field rules that are difficult to express as database constraints should be enforced by domain validators and tests.

## 9. Indexing baseline

Likely initial indexes:
- `interview_session(user_id, created_at DESC)`;
- `interview_session(status, updated_at)`;
- `session_event(session_id, sequence_no) UNIQUE`;
- `conversation_turn(session_id, turn_no) UNIQUE`;
- `problem_pack_version(problem_id, version) UNIQUE`;
- `reference_approach(problem_pack_version_id)`;
- `code_submission(session_id, created_at DESC)`;
- `execution_result(submission_id)`;
- `skill_observation(user_id, observed_at DESC)`;
- `outbox_event(status, created_at)`.

Add indexes from query plans and observed workload, not by default on every column.

## 10. Retention, privacy, and deletion

Apply the following selected V1 application-retention defaults. These periods are product policy defaults pending privacy/legal review before production; provider-side processing and backups are distinct retention layers.

| Data class | Application retention | Implementation requirement |
|---|---:|---|
| Transcript and interview/session history | 365 days | An idempotent retention job deletes or anonymizes eligible rows; account deletion follows a documented workflow. |
| Submitted source code | 90 days | Store via an opaque source-artifact reference; restrict reads and delete artifact plus references after expiry. |
| Execution stdout/stderr and bounded diagnostics | 30 days | Do not copy raw output into ordinary application logs; expire persisted output. |
| Model request/response payloads | No separate durable log copy | Persist only required conversation/feedback records under their stated policy; telemetry stores metadata/usage rather than unrestricted prompts or outputs. |
| Security/audit logs | 90 days | Prefer metadata/redacted fields; never log tokens, raw audio, hidden tests, or unrestricted source code. |
| Raw candidate audio | No durable application storage | Process in transient memory/buffer only; do not persist to disk/object storage or logs/traces; clear buffers on success/failure. |
| Generated interviewer audio | No durable application storage | Stream TTS output to the client and do not persist generated audio. |
| RDS automated backups | 7 days initially | Backup copies are a separate recovery layer; document expiry and reapply deletion/retention processing after restore before serving data. |

Keep operational logs free of secrets and minimize raw candidate content. Define data-owner/deletion scope, account-deletion timing, and backup-expiry behavior before production. Confirm OpenAI API data controls, processing terms, and any applicable region/residency settings; the application's non-persistence of raw audio does not imply provider-side zero retention. Retention jobs must be idempotent, observable, and tested.

## 11. Data access boundaries

- Browser: only candidate-authorized session content and safe execution results.
- Application: access through module repositories/services.
- Sandbox: only source code and one test input at a time; no database credentials, hidden expected outputs, or broad internal network access.
- Trusted evaluator: access to expected outputs and hidden test metadata.
- Content administrators: controlled access to draft and published pack content.
- Analytics: consume minimized events/aggregates where possible.

## 12. Decisions deferred to engineering design

The exact table DDL, SQL types, partitioning, object-storage layout, transcript representation, encryption policy, row-level authorization strategy, and migration sequence should be specified alongside feature requirements and actual access patterns. Keep V1 relational and avoid premature sharding.


## 13. Selected platform and async contracts

- **Authentication:** Clerk token verification at the API boundary, then map to an internal `user_id`; test identities are permitted only in development/test.
- **Primary store:** Amazon RDS for PostgreSQL; migrations and connection pooling are required.
- **Queue:** Amazon SQS Standard with a dead-letter queue. Assume at-least-once delivery and possible reordering; consumers must be idempotent.
- **Host:** Amazon ECS/Fargate for the API and trusted background work; execution uses the separate managed E2B sandbox adapter.
- **Languages:** Python, C++, and Java. Toolchain versions/image identifiers must be pinned before user-facing execution.
