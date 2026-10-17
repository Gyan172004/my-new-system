# Phase 2 — Technical Contracts Index

Phase 2 defines foundational interfaces and behavior rules needed before feature implementation. These are initial contracts and should be refined with feature requirements, not treated as complete specifications for every future endpoint.

| Order | Artifact | Purpose |
|---:|---|---|
| 1 | `contracts/api/v1_openapi.yaml` | Machine-readable initial REST API surface |
| 2 | `contracts/events/async_schemas.json` | Versioned asynchronous event envelope and initial payload schemas |
| 3 | `docs/03_features/interview_session/specifications/technical/session_state_machine.md` | Session states, transitions, guards, idempotency, and recovery |
| 4 | `docs/03_features/interview_orchestration/specifications/technical/llm_interaction_policy.md` | Backend/model responsibility boundary, structured output, abstention, hint safety, and fallback |
| 5 | `docs/03_features/code_execution/specifications/technical/execution_contract.md` | Execution request/result contract and sandbox security requirements |
| 6 | `contracts/api/README.md` | API contract rules and intentionally deferred endpoint semantics |

## Cross-document consistency rules

- The backend is the source of truth for state and transition decisions.
- Sessions pin immutable Problem Pack versions.
- Snapshot and domain event changes are transactional; the event schema covers the session lifecycle events documented by the state-machine contract.
- Session API creation starts in the `created` stage; `start` is a distinct action. Session concurrency uses a standards-compliant `ETag`/`If-Match` pair.
- Model output is validated and advisory; it cannot directly commit transitions.
- Candidate code runs outside the API process in a restricted execution boundary.
- Hidden expected outputs remain outside the sandbox and candidate-facing API.
- Infrastructure failures are neutral and must not be scored as candidate failures.
- Idempotency, optimistic concurrency, bounded retries, and safe error behavior apply wherever operations may be retried.
- V1 selections are recorded in ADRs: Clerk; OpenAI model/audio mapping; Python/C++/Java; AWS ECS/Fargate + RDS PostgreSQL + SQS Standard; managed E2B sandbox behind an adapter; explicit retention defaults; independent Problem Pack review.

## Deliberate limitations

The OpenAPI includes the initial session vertical slice plus the selected turn-based voice consent and voice-turn submission contracts. Code submission/execution endpoints remain deliberately deferred until the submission UX and queued-result semantics are finalized. Voice implementation work is tracked by K-029; K-027 is the completed scope decision. All voice input uses the existing backend state-machine path after transcription; there is no separate voice-controlled state machine.
