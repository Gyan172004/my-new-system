# Document Review and Consistency Audit — Final Baseline

**Review status:** Planning and contract documents reconciled for the selected V1 baseline  
**Review date:** 2026-10-16  
**Scope:** Architecture/PRD, ADRs, implementation sequencing, feature contracts, OpenAPI, async event schemas, feature workspaces, README, and Kanban Markdown/CSV.

## Summary

The selected V1 choices have been recorded consistently across the project documents:

- **Identity:** Clerk, with an internal stable `user_id`, server-side token verification, ownership checks, and a non-production-only test adapter.
- **Voice:** turn-based candidate audio capture, OpenAI transcription, visible transcript, interviewer text plus on-demand speech output, explicit versioned consent, text fallback, and no durable raw audio. Real-time/always-on audio is out of scope for V1.
- **Code languages:** Python, C++, and Java, with toolchain versions and numeric resource profiles to be pinned before production execution is enabled.
- **Models:** OpenAI only through the Model Gateway; `gpt-6.1-sol` for core interviewer/assessment/hint/feedback operations, `gpt-6-luna` for focused classification, conditional `gpt-6-astra` escalation only after evaluation/budget approval, `gpt-transcribe` for transcription, and `gpt-4o-mini-tts` for speech. IDs are centrally configured and must be rechecked before deployment.
- **Deployment:** AWS ECS/Fargate for trusted API/workers, RDS PostgreSQL, SQS Standard with DLQ, IAM task roles/Secrets Manager, and CloudWatch. AWS region/network/sizing remain deployment details.
- **Code isolation:** E2B-managed ephemeral sandbox behind an internal adapter. This is the chosen V1 default, but public execution is gated on security, provider-data, region, runtime, cost, concurrency, and threat-test approval.
- **Retention defaults:** transcripts/session history 365 days, source code 90 days, execution output 30 days, security/audit logs 90 days, no durable raw candidate audio, and initial 7-day RDS automated backups. Provider-side retention and backup-deletion behavior require verification and disclosure.
- **Content governance:** author plus independent technical reviewer; no self-approval; only authorized reviewers/publishers publish immutable pack versions.

## Corrections and consistency decisions

1. **OpenAPI duplicate keys and duplicate route definitions:** removed repeated copies of the voice endpoints and schemas, kept OpenAPI 3.1 nullability syntax, and updated the API description to describe the actual session and voice paths. `If-Match`/ETag and idempotency semantics remain the concurrency contract.
2. **Session state versus lifecycle status:** preserved the split between `currentStage` and lifecycle `status`. Backend guards own transition legality; the model cannot directly mutate session state.
3. **Voice/API boundary:** added explicit consent/revocation, bounded voice-turn upload, and on-demand speech operations. Voice input enters the same normal backend state-machine path as typed text. Audio request/response bodies must not be logged or durably stored.
4. **Event schemas:** retained versioned event envelopes and explicit execution-request/completion versions. Session events can carry modality/turn/consent/model metadata without storing audio references.
5. **Hosting and queue:** reconciled architecture/ADR/Kanban to AWS ECS/Fargate, RDS PostgreSQL, SQS Standard and DLQ. Queue consumers must tolerate duplicate and out-of-order delivery, use idempotent handlers, and rely on database state/version guards. Use a transactional outbox where committed database state and job publication must not diverge.
6. **Sandbox:** replaced provider-open language with E2B as the selected managed default behind an adapter. The security gate is deliberately retained; selection is not evidence of production security approval.
7. **Retention:** aligned the PRD, domain, infrastructure, and ADR defaults. Deletion jobs, provider controls, and the effect of the seven-day backup window remain implementation/review gates.
8. **Problem Pack quality:** aligned the immutable versioning model with a two-person author/reviewer process and prohibition on self-approval.
9. **Roadmap and Kanban:** K-027 is Done as a product-scope decision; K-029 tracks actual voice feature implementation. K-028 covers environment configuration/secret handling. K-020 remains an early threat-model/prototype task; K-021/K-022 cover production queue and evaluation integration.
10. **Feature workspaces:** retained feature-specific directories for all four canonical documents: requirements, technical design, engineering design, and pseudocode. Existing cross-cutting technical contracts remain separate and must be referenced rather than duplicated inconsistently.
11. **Architecture decisions:** corrected stale ADR language that described the sandbox technology and queue provider as undecided; removed duplicated consequences and stale M0 voice-scope wording.

## Current architecture consistency matrix

| Area | Result | Remaining gate |
|---|---|---|
| Product scope and voice | Consistent | K-029 must be implemented and release-tested before claiming voice is delivered. |
| Authentication and ownership | Consistent | Configure Clerk instance/origins and test server verification in selected backend framework; never enable test identity in production. |
| Session state/concurrency | Contract aligned | Implement state/version guards, ETags/If-Match, idempotency storage and replay semantics; test races. |
| Problem Packs | Consistent | Pin pack schema, publish one reviewed seed pack, separate private tests from candidate-visible content. |
| Model Gateway | Consistent | Recheck models/account access; benchmark operation mapping; finalize cost/token/timeouts and escalation threshold. |
| AWS runtime and database | Consistent at provider level | Select region, VPC/subnets/egress, ingress/WAF decision, task sizing, IAM policies and deployment pipeline. |
| SQS jobs | Consistent | Configure visibility timeouts, retry/redrive/DLQ, alarms, idempotency, cancellation, and outbox transaction paths. |
| E2B sandbox | Consistent as selected default, not yet security-approved | Prove network/metadata/secret restrictions, runtime/toolchain, resource limits, cleanup, concurrency and provider terms before public exposure. |
| Retention/privacy | Policy values aligned | Implement expiry/deletion jobs; verify provider controls and explain backup deletion lag; assign privacy/legal review. |
| Feedback/content review | Consistent | Assign actual reviewers/publishers and create quality/evaluation datasets. |
| Observability/capacity/recovery | Consistent as a plan | Measure the 100-interview/10-execution target and validate SLO/RPO/RTO, restore, rollback, and alarms. |

## Validation performed for this document update

The following syntax and structural checks were run successfully after the final edits:

- parsed OpenAPI YAML with duplicate-key detection;
- validated local OpenAPI `$ref` targets and unique operation IDs;
- parsed the event contract as JSON and validated its JSON Schema structure plus representative voice, execution-request, and Problem Pack publication fixtures;
- parsed Kanban CSV, confirmed unique task IDs, and confirmed every dependency refers to an existing task;
- checked all four required feature workspace directory locations and relative Markdown links;
- verified archive integrity and preservation of empty feature folders.

A dedicated OpenAPI 3.1 specification-validator/linter package was not available in the environment, so the full OpenAPI conformance suite was not run. Duplicate-key parsing, path/operation uniqueness, local reference resolution, and component-schema structure were checked instead. Passing these checks validates document structure and internal references, **not** deployed behavior. The security of E2B configuration, correctness/quality of models, legal sufficiency of retention settings, capacity, and disaster recovery cannot be proven by document review alone.

## Vendor references checked on 2026-10-16

- Clerk session JWT verification: https://clerk.com/docs/guides/sessions/manual-jwt-verification
- OpenAI model catalog: https://developers.openai.com/api/docs/models
- OpenAI transcription: https://developers.openai.com/api/docs/guides/transcription
- OpenAI speech generation: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
- AWS ECS best practices: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-best-practices.html
- SQS Standard semantics: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html
- SQS dead-letter queues: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
- RDS backup retention: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.BackupRetention.html
- E2B isolation/security description: https://changelog.e2b.dev/security

Vendor features, model access, terms, costs, quotas, and regional availability can change. Confirm account-specific details during implementation and before launch.
