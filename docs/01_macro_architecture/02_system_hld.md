# System High-Level Design (HLD)

**Status:** V1 architecture baseline  
**Architecture style:** Modular monolith with separate execution plane  
**Primary constraint:** The interviewer may be an LLM, but control flow and scoring evidence must remain governed by application code.

## 1. Design goals

The system must deliver a structured DSA interview, preserve session progress, use curated problem knowledge, execute untrusted code safely, and generate useful feedback. It should support roughly 1,000 users without adopting distributed-system complexity prematurely.

## 2. Architecture decisions

- **Modular monolith** for the main application: one deployable backend, explicit domain modules and interfaces.
- **Hybrid interaction model:** synchronous requests for live turns; asynchronous jobs for long-running/offline work.
- **Backend-controlled interview state machine:** model output proposes an action or response; backend validates whether it is allowed.
- **Curated Problem Packs:** immutable, versioned content is loaded by a session and pinned for reproducibility.
- **Hybrid evaluation:** deterministic checks for code execution, required steps, state transitions, and rubric aggregation; LLM-based judgment for open-ended explanations, with structured outputs and evidence.
- **Snapshot + events:** persist current session snapshot for efficient reads and append versioned events for history, audit, and recovery.
- **Separate execution plane:** candidate code runs in ephemeral, resource-limited sandboxes; no direct database access.
- **Managed PostgreSQL** as the initial source of truth.
- **Containers/PaaS before Kubernetes**, unless deployment or isolation needs prove otherwise.

## 3. Logical architecture

The application implementation uses TypeScript + Next.js, selected by the owner
on 2026-10-17 (ADR-021). Next.js Node.js Route Handlers adapt HTTP requests to
module application services; neither Route Handlers nor future Server Actions
may bypass domain authorization, policy or persistence boundaries. The first
feature defines the server lifecycle and tooling; candidate screens are designed
in their owning features. No separate backend framework is selected.

```text
Candidate Web App
      |
      | HTTPS / authenticated API
      v
API + Modular Monolith
  ├── Identity & Candidate Profile
  ├── Problem Catalogue / Pack Resolver
  ├── Interview Orchestrator
  ├── Conversation & Turn Manager
  ├── Approach Matcher
  ├── Hint / Variant Policy
  ├── Code Submission Service
  ├── Evaluation & Feedback
  ├── Session History
  ├── Model Gateway
  └── Admin / Content Publishing
      |
      +---------- PostgreSQL (source of truth)
      |
      +---------- OpenAI text/audio APIs, through Model Gateway
      |
      +---------- Internal Execution API
                        |
                        v
                 Execution Coordinator
                        |
                        v
                 Isolated Sandbox Workers
                 (ephemeral containers)

Offline / asynchronous workloads:
Content Ingestion -> Normalize -> Enrich -> Validate -> Review -> Publish Problem Pack
Background Worker -> summaries, analytics, non-critical processing
```

## 4. Control plane vs. execution/data plane

### Control plane
The trusted application handles identity, session state, interview policy, curated content, evaluation orchestration, persistence, and model calls. It owns credentials for the database and model providers.

### Execution plane
The execution service accepts narrowly scoped jobs and runs candidate code in isolated environments. It returns bounded output, exit status, timing, and resource usage. It does not receive database credentials, hidden expected outputs, or general application secrets.

This boundary is a security requirement, not merely a future scaling option.

## 5. Main modules and ownership

| Module | Owns | Must not own |
|---|---|---|
| Identity/Profile | User identity, preferences, self-reported experience | Interview scoring policy |
| Problem Catalogue | Problem metadata and published pack versions | Live session state |
| Content Pipeline | Ingestion, normalization, enrichment, validation, review workflow | Live interview orchestration |
| Interview Orchestrator | Session state machine, permitted next actions, recovery | Provider-specific SDK details |
| Conversation | Turn input/output, transcript references, turn status | Independent state transitions |
| Approach Matcher | Candidate approach classification, confidence, abstention | Final score by itself |
| Hint/Variant Policy | Ordered hints, variant selection rules, exposure tracking | Unbounded LLM-driven branching |
| Model Gateway | Provider routing, timeout, retries, structured-output validation, usage/cost | Product policy decisions |
| Code Submission | Submission lifecycle and execution requests | Running code inside API process |
| Execution Service | Compile/run sandbox jobs and bounded results | Application database access |
| Evaluation/Feedback | Evidence, rubric results, final feedback | Inventing evidence not present in session |
| Session History | Snapshots, events, replay/audit support | Owning all domain logic |
| Admin/Publishing | Review, publish, deprecate packs | Mutating already-pinned session content |

Modules communicate through explicit application-service interfaces and DTOs. Avoid direct repository access across module boundaries.

## 6. Interview control flow and V1 voice

The backend owns the canonical interview state regardless of input modality. V1 supports turn-based voice: the client records one bounded utterance only after explicit consent, submits it to the voice endpoint, and receives a transcript plus the normal interviewer response. The transcript is processed through the same candidate-response validation and state-transition code used for typed input. The client displays the transcript and response text; speech is generated separately when requested. This is not an always-on microphone or real-time bidirectional audio session.

Raw candidate audio is processed transiently and is not durably stored by the application. Consent version/time is auditable. Transcription or speech failure must not silently advance state, and a candidate can retry or switch to text. See the voice feature contract for request semantics.

The backend owns the canonical state. A typical sequence is:

```text
CREATED
  -> INTRO
  -> EXPERIENCE_CONTEXT
  -> PROBLEM_READ_AND_CLARIFY
  -> PROBLEM_RESTATEMENT
  -> SAMPLE_TRACE
  -> INITIAL_APPROACH
  -> APPROACH_CLARIFICATION / HINTS (as needed)
  -> CODE
  -> TEST_AND_DEBUG (as needed)
  -> IMPROVE_APPROACH
  -> VARIANTS_AND_FOLLOWUPS
  -> COMPLEXITY_ANALYSIS
  -> FEEDBACK
  -> COMPLETED
```

The exact transitions should be represented as a tested state machine. The LLM cannot move the session directly to any arbitrary state. Backend policy validates each requested transition against current state, evidence, candidate action, and problem-pack policy.

If model output is invalid, missing, or contradictory, retry only within a bounded policy; otherwise use a safe fallback prompt or mark the turn as recoverable failure.

## 7. Approach matching and uncertainty

The candidate's natural-language explanation is matched against versioned reference approaches. The result should include:
- candidate approach summary;
- matched approach ID, if any;
- confidence and supporting evidence;
- missing/unclear elements;
- whether the matcher abstained.

High confidence may select targeted follow-up questions. Medium/low confidence should trigger clarification or the open-ended path. Never force a match just because a nearest reference approach exists. Novel but valid approaches must remain possible.

## 8. Hybrid evaluation model

Use deterministic code for:
- state transitions and policy gates;
- exact test execution and result classification;
- complexity answer format and rubric aggregation where possible;
- content schema and publication validation;
- session/version consistency.

Use an LLM for:
- interpreting explanations;
- summarizing a proposed approach;
- identifying conceptual gaps;
- asking the next permitted question naturally;
- producing evidence-linked qualitative feedback.

LLM results must be structured, validated, and tied to the input evidence and versioned rubric. Do not let the model independently decide whether infrastructure failures count against the candidate.

## 9. Code execution flow

1. Backend creates a submission record and execution request.
2. Execution coordinator validates the request and applies queue/capacity policy.
3. A fresh sandbox compiles/runs the candidate program under CPU, memory, time, process, output, filesystem, and network restrictions.
4. The sandbox receives only the input for the individual test. Expected outputs remain outside the sandbox.
5. The trusted evaluator compares bounded output to expected output.
6. Result is stored with a clear classification: compile error, runtime error, wrong answer, time limit, memory limit, output limit, or infrastructure error.
7. The interviewer uses the result to ask the candidate to trace/debug when appropriate.

Infrastructure errors must be neutral and retryable. Do not expose hidden test data or expected answers to the candidate.

## 10. State persistence: snapshot + events

Persist the current session snapshot for efficient resume and append versioned events for important transitions, such as:
- session started;
- problem pack pinned;
- candidate response received;
- approach match produced;
- hint shown;
- code submitted;
- execution completed;
- rubric evidence recorded;
- feedback generated;
- session completed.

Use transactions to keep snapshot updates and event/outbox records consistent. Events are not a substitute for the current snapshot. Store enough version metadata to reproduce how a session was evaluated.

## 11. Sync and async work

Synchronous request path:
- read/write interview turns and guarded state transitions;
- OpenAI text calls that must return the next turn;
- bounded audio transcription for a submitted voice turn;
- speech generation on demand for an approved interviewer turn.

Asynchronous work:
- code execution, through Amazon SQS Standard and a separate worker/coordinator path;
- content ingestion and enrichment;
- analytics, non-critical summaries, retries, retention cleanup, and cost aggregation.

SQS Standard is at-least-once and may deliver duplicates or messages out of order. Consumers must be idempotent; use execution IDs, database state/version checks, bounded receive counts, visibility timeouts, and a dead-letter queue. Use a transactional outbox when a committed database update must enqueue a job. Do not add Kafka without a demonstrated need.

## 12. Data flow and source of truth

PostgreSQL is the source of truth for users, published pack metadata, session state, events, submissions, and evaluation records. Large immutable artifacts may move to object storage when useful, with metadata and references in PostgreSQL.

The browser is not authoritative for time, state transitions, scores, hidden tests, or execution results. The backend must validate all client input.

## 13. Reliability and failure behavior

- Model timeout/failure: preserve session state; use an explicitly configured fallback or a recoverable error.
- Matcher uncertainty: ask for clarification or use the open-ended approach path.
- Sandbox unavailable: preserve submission; do not mark it incorrect.
- Background worker failure: do not block active interviews.
- Database failure: stop unsafe state changes; return a clear recoverable error.
- Duplicate request: use idempotency keys for commands that could create duplicate submissions, turns, or jobs.
- Bad Problem Pack release: stop new pinning to that version and publish a corrected version; existing sessions retain their pinned version unless a deliberate migration policy says otherwise.

## 14. Security boundaries

- Candidate code is hostile.
- No candidate code executes in the API process.
- No database credentials or model-provider keys enter the sandbox.
- Hidden expected outputs never enter the sandbox.
- Outbound network is disabled by default.
- API access, rate limits, request sizes, and execution resources are bounded.
- Sensitive transcripts and code are logged only when needed and under a defined retention policy.

## 15. Deployment and scaling

V1 target deployment is AWS: an Application Load Balancer with TLS fronts API tasks on Amazon ECS/Fargate; separate Fargate services/task definitions run the API and trusted background workers. Amazon RDS for PostgreSQL lives in private subnets and accepts traffic only from approved task security groups. Amazon SQS Standard queues and dead-letter queues coordinate retryable work. AWS Secrets Manager supplies secrets; least-privilege ECS task roles authorize access; CloudWatch collects logs, metrics, and alarms.

Candidate execution remains outside the trusted ECS service boundary: use the managed E2B sandbox service behind the execution adapter. Do not treat a normal Fargate task as the final isolation boundary for hostile code. Keep a small execution adapter so E2B can be replaced if security review, compliance, availability, or economics require a different sandbox.

Use separate development, staging, and production accounts/environments as practical; isolate VPCs, credentials, data, and provider keys. Scale API, workers, and database connections independently. Adopt Kubernetes only if later evidence justifies it.

## 16. Important trade-offs

| Decision | Benefit | Cost / trade-off |
|---|---|---|
| Modular monolith | Simple deployment and local transactions | Requires enforced module boundaries |
| Backend-owned state machine | Predictable flow and auditability | More explicit policy code to maintain |
| Snapshot + events | Fast resume plus history/replay | Event schema/version discipline |
| Hybrid deterministic + LLM evaluation | Reliable objective checks with flexible language judgment | Must manage model variability and calibration |
| Curated versioned packs | Repeatable sessions and quality control | Content pipeline and review effort |
| Separate execution plane | Limits blast radius of hostile code | Additional service boundary and operational work |
| Managed services | Less infrastructure toil | Provider cost and some vendor coupling |

## 17. V1 exclusions

No microservices decomposition, Kubernetes by default, Kafka cluster, multi-region active-active deployment, database sharding, or complex distributed cache unless evidence justifies them. Do not let the content pipeline or analytics compete with active interview workloads.

## 18. Validation before implementation

- State machine transition tests cover allowed and forbidden transitions.
- Session recovery works after refresh and transient failures.
- Pack versions are immutable and pinned per session.
- Approach matcher can abstain and preserve novel approaches.
- Model output schema and allowed actions are validated.
- Sandbox isolation and hidden-test confidentiality are tested adversarially.
- Infrastructure failures do not affect candidate scoring.
- Snapshot/event writes are transactionally consistent.
- Load tests validate the initial concurrency and latency assumptions.
