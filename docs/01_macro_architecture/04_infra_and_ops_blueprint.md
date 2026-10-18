# Infrastructure and Operations Blueprint

**Status:** Selected V1 platform baseline
**Primary platform:** AWS ECS/Fargate + RDS PostgreSQL + SQS Standard
**Execution isolation:** Managed E2B sandbox behind an adapter (production-security gate applies)  
**Initial target:** Approximately 1,000 users  
**Principle:** Keep infrastructure simple while isolating the highest-risk workload: untrusted candidate code.

## 1. Purpose

This document defines deployment boundaries, environment strategy, security controls, scaling, reliability, observability, and recovery. It is not a cloud-specific implementation guide.

## 2. Operating principles

1. Keep the main application simple.
2. Run candidate code outside the backend in a separate trust boundary.
3. Scale model, background, and execution workloads independently.
4. Prefer managed services when they reduce undifferentiated operational work.
5. Put timeouts and bounded retries on every external dependency.
6. Treat infrastructure failures separately from candidate failures.
7. Observe critical user journeys, not only machine health.
8. Avoid distributed infrastructure until measurements justify it.

### Local development and deployment timing

Follow ADR-022 and the [release schedule](../02_build_sequencing/v1_scope_and_release_plan.md#41-local-development-and-external-verification-schedule):
local containers, real local PostgreSQL and contract-tested fixtures/emulators
support development before AWS resources are funded. Production remains
ECS/Fargate, RDS PostgreSQL, SQS Standard and Secrets Manager. Real provider
smoke checks occur at their integration milestones; unavailable checks remain
open. Actual environment, IAM/network, TLS, injection/rotation, deployment,
monitoring, restore and load evidence is required before release. Local review
and commits may proceed while T034/K-028 remains pending; provisioning is a
separate authorized deployment activity. No local emulator proves cloud parity
or untrusted-code isolation.

## 3. Capacity assumptions

Planning assumptions to validate with load tests:
- around 1,000 registered/supported users;
- around 100 simultaneous active interviews as an initial design point;
- around 10 concurrent code executions initially;
- backend requests roughly 20–30 requests/sec during a burst.

These are not guarantees. Model calls and code execution will likely dominate latency and capacity costs.

## 4. Deployment topology

```text
Candidate Browser
   | HTTPS
ALB / TLS (AWS)
   |
ECS Fargate API service (trusted control plane)
   |-- Clerk token verification / internal user mapping
   |-- Model Gateway -> OpenAI API (text + audio operations)
   |-- RDS PostgreSQL (private subnets)
   |-- transactional outbox -> SQS Standard (+ DLQ)
   |                              |
   |                     ECS Fargate trusted workers
   |                              |
   |                     execution adapter
   |                              v
   |                    Managed E2B sandbox service
   |
CloudWatch logs/metrics/alarms; Secrets Manager; least-privilege IAM task roles
```

## 5. Deployment units

The TypeScript/Next.js trusted API uses the Node.js runtime in an ordinary
container (ADR-021). The foundation design uses a minimal custom Node server for
pre-listener configuration validation and bounded resource shutdown; do not
combine that entrypoint with Next.js standalone output. This selects no AWS
region, provisioning tool, task sizing or new deployment platform.

- **ECS/Fargate API service:** modular monolith, authentication boundary, interview flow, published content reads, evaluation orchestration, and Model Gateway integration.
- **ECS/Fargate trusted worker service:** consumes SQS jobs for bounded background work; has only the IAM permissions it needs.
- **RDS for PostgreSQL:** source of truth in private subnets, encrypted at rest, with automated backups and point-in-time recovery configured.
- **Amazon SQS Standard + DLQ:** code-execution requests and suitable background jobs; idempotent consumers handle duplicate/out-of-order delivery.
- **E2B managed sandbox:** per-execution isolated runtime behind the execution adapter; receives source and current test input only, never expected output or application secrets.
- **AWS Secrets Manager, IAM task roles, and CloudWatch:** production secret injection, least-privilege service access, logging/metrics/alarms.
- **Optional private S3 artifacts:** only if needed for large submission artifacts; SSE-KMS, block public access, scoped access, and explicit lifecycle/deletion policy. Do not store raw candidate audio there.
- **Content pipeline:** offline ingestion/enrichment/review work; it must not compete with live interviews.

These are workload/deployment boundaries; they do not require microservices for every domain.

## 6. Environments

Maintain development, staging, and production. Use separate databases, credentials, model keys, and execution resources. Staging should test migrations, model integration, sandbox restrictions, authentication, observability, and rollback. Production changes should be automated and reviewed; avoid undocumented manual server edits.

## 7. Network trust zones

### Public edge
Expose only required HTTPS endpoints. Enforce TLS, request-size limits, authentication, and rate limits.

### Trusted application network
Backend, workers, database, and internal coordinator endpoints. PostgreSQL should accept connections only from approved workloads.

### Untrusted execution network
Candidate code runs here. Deny outbound network by default and block access to application networks, cloud metadata endpoints, databases, internal services, host filesystems, secrets, and other candidates' sandboxes.

## 8. Sandbox security baseline

Treat candidate code as hostile. Use a fresh ephemeral sandbox per execution, with:
- non-root execution;
- CPU, memory, wall-clock, process-count, and output limits;
- restricted filesystem and temporary workspace;
- dropped Linux capabilities and restricted syscalls where available;
- no network by default;
- no application/database/model credentials;
- bounded stdout/stderr;
- forced cleanup after completion or timeout.

The trusted evaluator must compare outputs outside the candidate process. Hidden expected outputs and other test cases must never be passed into the sandbox. Containerization alone is not a sufficient security argument; use the strongest practical isolation supported by the chosen execution environment and test it adversarially.

## 9. Execution outcomes

Distinguish at least:
- compilation error;
- runtime error;
- wrong answer;
- time limit exceeded;
- memory limit exceeded;
- output limit exceeded;
- infrastructure error.

Infrastructure errors are neutral to candidate evaluation and retryable where safe. Do not expose hidden inputs or expected outputs in candidate-facing messages.

## 10. Capacity and backpressure

Bound execution queues and worker concurrency. When capacity is exhausted, queue within a configured limit or return a retryable busy response. Do not create unlimited containers or allow queues to grow indefinitely.

Scale execution workers based on queue wait time, utilization, and execution duration. Scale the backend based on request latency and throughput. Scale background jobs separately. Keep active interviews ahead of analytics and offline content generation when capacity is constrained.

## 11. Database and persistence

Use managed PostgreSQL for V1. Prioritize:
- appropriate indexes and query plans;
- bounded connection pools;
- transaction correctness;
- automated backups and point-in-time recovery where available;
- tested restoration;
- versioned migrations.

Use expand -> deploy compatible code -> migrate -> contract for risky schema changes. Avoid read replicas, sharding, or additional databases until measurements require them.

## 12. Jobs and events

Use Amazon SQS Standard as the V1 durable queue, with separate queues or clear message contracts for workloads with different concurrency/latency needs and a DLQ for poison messages. Standard queues provide at-least-once delivery and may reorder messages, so each message carries a stable job/execution ID and schema version. Consumers check persistent job state before side effects; use bounded retries, exponential backoff, an appropriately sized visibility timeout, queue-age alarms, and a documented DLQ redrive/manual-review process.

When a database transaction must enqueue a job, write an outbox record in the same RDS PostgreSQL transaction. A publisher sends it to SQS and marks it delivered idempotently. Do not treat an SQS acknowledgement as proof that a job completed. Kafka is not a V1 requirement.

## 13. Model gateway operations

All model-provider calls pass through a Model Gateway responsible for:
- provider credentials and routing;
- per-operation timeouts;
- bounded retries and backoff;
- rate limiting and fallback policy;
- structured-output validation;
- token and cost accounting;
- recording model/provider/prompt versions.

Retry transient errors only. Do not retry authentication or configuration errors indefinitely. A fallback model must be explicitly approved for the operation; record when fallback changes the model. Preserve session state if no safe response can be produced.

## 14. CI/CD and release

Required CI checks:
- formatting and linting;
- static analysis and dependency scanning;
- unit, integration, and contract tests;
- architecture-boundary tests;
- container build and image scanning;
- sandbox isolation tests for execution changes.

Build immutable, versioned artifacts. Deploy to staging, run smoke tests, then deploy production. Use rolling deployment or a small canary when supported. Keep a simple rollback path to the previous application version. Database changes must remain compatible with rollback wherever practical.

## 15. Architecture fitness rules

Automate rules such as:
- domain modules do not call model-provider SDKs directly;
- execution code does not import interview domain logic;
- modules do not reach into another module's repository;
- candidate code never executes inside the API process;
- hidden expected outputs never cross into the sandbox;
- critical commands have idempotency protections;
- published Problem Packs are immutable.

## 16. Observability

Use structured logs, metrics, and distributed traces; OpenTelemetry is a suitable vendor-neutral standard.

Useful correlation identifiers:
- request ID;
- trace ID;
- session ID;
- execution ID;
- model request ID.

Keep high-cardinality identifiers in logs/traces rather than metric labels.

### Core service metrics
- request rate, latency, and error rate;
- CPU and memory;
- database latency, connections, and pool saturation;
- background and execution queue depth;
- execution queue wait, compile/run time, and infrastructure error rate.

### AI metrics
- model latency and errors;
- rate-limit and fallback frequency;
- structured-output validation failures;
- token usage and cost per call;
- cost per completed interview.

### Product reliability metrics
- successful interview-turn rate;
- session completion rate;
- state-transition failures;
- successful code-execution service rate;
- percentage of sessions recovered after transient failures.

## 17. Initial SLOs

Initial targets to validate after deployment:
- monthly core service availability: 99.5%;
- ordinary backend operations: P95 below 500 ms, excluding model/sandbox waits;
- live interviewer turn: P95 below 5 seconds where provider behavior allows;
- track model and execution latency separately.

Do not promise a hard end-to-end latency when third-party models and execution workloads are involved. Define alert thresholds and error-budget policy once enough baseline traffic exists.

## 18. Health checks and graceful degradation

Separate liveness (process is functioning) from readiness (safe to receive traffic). Do not make optional dependencies part of readiness.

Examples:
- analytics unavailable: continue interviews and retry asynchronously;
- candidate-learning aggregation unavailable: continue from current session state;
- OpenAI model operation degraded: use only a deliberately configured same-provider fallback or return a recoverable error; never silently route to an unapproved provider;
- sandbox unavailable: preserve the submission and do not mark it wrong;
- database unavailable: stop unsafe state changes and return a clear error.

Every remote call needs a timeout. Retries must be bounded and safe. Use load shedding when overloaded instead of allowing cascading failure.

## 19. Secrets and privacy

Use AWS Secrets Manager and least-privilege ECS task roles. Never commit credentials, bake secrets into images, or log authorization headers and keys. Separate production/staging/development credentials and scope IAM permissions by task. Candidate code must never receive AWS credentials or production secrets.

Send only necessary candidate information to OpenAI. Record no raw audio in the application; do not log request bodies or audio/transcription payloads. Confirm OpenAI account/API data controls, processing terms, and residency settings before launch. Enforce these application retention defaults: transcripts/session history 365 days, submitted source code 90 days, execution output 30 days, security/audit logs 90 days, no durable raw-audio storage, and RDS automated backup retention initially 7 days. The cleanup jobs, backup expiry, and account-deletion path must be tested. These policy values are product defaults pending final privacy/legal review.

## 20. Backups and recovery

Use automated database backups and point-in-time recovery where available. Periodically test restoration; a backup is not proven until a restore succeeds.

Define:
- **RPO:** acceptable amount of recent data loss;
- **RTO:** acceptable recovery time.

Initial planning should aim for low data loss and recovery within hours, then set precise targets based on cost and provider capabilities. Retain published Problem Pack versions and provenance independently from ephemeral application containers.

Runbooks should cover database outage, model-provider degradation, stuck execution queues, sandbox fleet failure, bad deployment, bad Problem Pack release, and credential rotation.

## 21. Rate limits and cost controls

Protect expensive operations: model calls, code execution, authentication, and content ingestion. Apply user/session/system-level limits as appropriate. Track model tokens, model calls, interview duration, evaluator calls, code executions, and cost per completed interview. Keep offline content-generation budgets separate from live-interview capacity.

## 22. Selected V1 infrastructure choices

- API and trusted background workers: Amazon ECS on AWS Fargate.
- Primary data store: Amazon RDS for PostgreSQL, deployed in private subnets.
- Async queue: Amazon SQS Standard with a dead-letter queue and idempotent consumers.
- Secrets and permissions: AWS Secrets Manager, separate ECS task/execution roles, least-privilege IAM.
- Logs/metrics/alarms: Amazon CloudWatch; structured application logs and correlation IDs.
- Sandbox: managed E2B isolated execution behind a narrow adapter; requires a threat-model review and production data/security verification.
- Identity: Clerk-managed auth; server-side token verification and internal user mapping.
- Model provider: OpenAI only through the Model Gateway.

Do not introduce EKS/Kubernetes, a service mesh, Kafka, database sharding, multi-region active-active deployment, GPU infrastructure, or a distributed cache cluster without a measured need. Choose the AWS Region, subnet/egress shape, RDS sizing, SQS quotas/visibility settings, and E2B concurrency/cost profile during deployment design and validate against the privacy/security requirements.

## 23. Pre-launch checklist

- [ ] Production and staging credentials are separate; Clerk token verification and internal user mapping are tested.
- [ ] SQS standard-queue duplicate/reordering behavior, visibility timeout, DLQ alarm, and redrive process are tested.
- [ ] E2B data-processing terms, region behavior, network controls, and the exact isolation configuration pass security review.
- [ ] Voice consent, transcript display, no-durable-audio behavior, and text fallback are tested.
- [ ] TTL cleanup for 365-day transcripts, 90-day source, 30-day execution output, and 90-day audit logs is tested.
- [ ] Database backups are enabled and restore tested.
- [ ] Candidate code cannot reach production networks or cloud metadata.
- [ ] Sandbox CPU, memory, time, process, filesystem, output, and network limits are tested.
- [ ] Hidden expected outputs stay outside candidate execution.
- [ ] Model and sandbox calls have finite timeouts.
- [ ] Critical commands are idempotent.
- [ ] CI includes tests, dependency checks, and architecture rules.
- [ ] Production rollback is tested.
- [ ] Structured logs, metrics, traces, dashboards, and critical alerts exist.
- [ ] Published Problem Packs are immutable and versioned.
- [ ] Retention and deletion policies are documented.
- [ ] Incident runbooks exist for critical dependencies.

## 24. Evolution principle

Use **measure -> identify constraint -> isolate -> scale**. Add capacity or infrastructure to the specific bottleneck. The goal is a dependable interview product, not infrastructure complexity for its own sake.
