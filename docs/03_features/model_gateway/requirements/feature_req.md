# Model Gateway — Requirements

**Stage:** 4 · **Kanban:** K-017 · **Status:** Owner-authorized implementation;
planning/review and observed acceptance gates remain required (2026-10-23).

## 1. Purpose and scope

Give backend features one controlled way to call a model. The gateway selects
the configured provider/model, validates requests and responses, bounds resource
use, and returns usage metadata. It does not decide interview policy or write
session state.

Stage 4 delivers a text gateway, fake provider, OpenAI adapter, local
Groq adapter, and a synthetic structured-output probe. Interview prompts,
assessment rules, hints, feedback and voice delivery remain with their owning
features. Register their operation names now; enable them only when their
schemas, context rules and evaluations are defined. No new UI or public API.

## 2. Provider decision

OpenAI remains the production provider under ADR-012. The owner has obtained a
Groq key for temporary testing; the selected local model is
`openai/gpt-oss-120b`. Start with one text model. Defer the 20B classification
split until evaluated, and do not introduce Groq audio in this stage.

Groq is a development-only exception accepted by the owner on 2026-10-23 in
ADR-024 in the [existing ADR register](../../../01_macro_architecture/05_architecture_decision_records.md).
It permits synthetic inputs only, never real candidate/session data. It does not
replace production models, permit automatic fallback, or satisfy OpenAI acceptance.

## 3. Functional requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-001 | All model calls cross the gateway's internal interface. Callers select a registered operation, never an arbitrary provider URL, model or tool.                                                                                                                                                                                 |
| FR-002 | Each enabled operation declares its input/output schema versions, prompt version, allowed context, model mapping, timeout, retry/output/cost budgets and evaluation-set version. Missing declarations disable the operation.                                                                                                   |
| FR-003 | Validate input before dispatch and the complete response before returning success. Reject unknown fields, invalid IDs, oversized, empty, refused, truncated or malformed output and unexpected tool calls. Structured JSON alone does not establish semantic correctness.                                                      |
| FR-004 | Return validated data as a proposal. The caller owns stage/action eligibility, evidence checks, authorization, idempotency and guarded persistence. Provider failure is never candidate failure.                                                                                                                               |
| FR-005 | Apply one total deadline across admission, attempts, backoff and response reading. Honor caller cancellation and shutdown; discard late responses and release resources. At most two provider attempts per call.                                                                                                               |
| FR-006 | Retry only explicitly transient, side-effect-free failures within the same provider/model. Do not retry invalid output, authentication errors or cancellation; no automatic repair, fallback or escalation in Stage 4.                                                                                                         |
| FR-007 | Bound request/response bytes, completion tokens and concurrent calls. Reject saturation rather than queue without limit. Require production estimated-cost limits; distinguish an estimate from a provider billing cap. Bound operator smoke runs too.                                                                         |
| FR-008 | Return operation/provider/model/prompt/schema versions, correlation, duration, attempts, outcome and available usage/cost metadata for success and failure. Missing usage/cost is unknown, never assumed zero.                                                                                                                 |
| FR-009 | Keys stay server-side. Use only allowlisted context; never send credentials, hidden tests, expected hidden outputs or private reviewer notes. Never log unrestricted prompts, candidate text/source, provider bodies or audio.                                                                                                 |
| FR-010 | Ordinary local/CI tests use a fake provider without keys. Groq requires explicit opt-in, a key, development mode and a trusted synthetic-input harness; test mode rejects real-provider dispatch. Staging/production reject fake/Groq configuration; disabled gateway mode remains valid for features that do not need models. |
| FR-011 | Keep the canonical OpenAI operation map and existing session, LLM and voice contracts. Stage 4 introduces no session mutation, audio route, database migration or event schema.                                                                                                                                                |
| FR-012 | Cover success, malformed/refused/truncated output, timeouts, retries, cancellation, rate limits, saturation, configuration, privacy and usage with deterministic tests. Record separate, bounded real-provider checks before claiming provider-backed acceptance.                                                              |

## 4. Acceptance scenarios

1. **Valid call (US1):** Given an enabled operation and permitted context, a valid
   response returns typed data and call metadata. Unknown operations, invalid
   input and missing credentials cause zero network requests.
2. **Safe failure (US2):** Given timeout, rate limit, refusal or invalid output,
   the caller receives a stable error within the configured bounds. No turn,
   score, hint exposure or session version is changed by the gateway.
3. **Local development (US3):** Fake tests pass without credentials. An explicitly
   selected Groq development probe accepts only trusted synthetic fixtures. Test
   mode rejects real-provider dispatch; staging/production reject Groq configuration.
4. **Privacy:** Secret and restricted-content canaries are absent from outbound
   prohibited fields, logs, client assets and retained smoke evidence.
5. **Provider acceptance:** Groq smoke evidence proves only Groq connectivity and
   schema compatibility. OpenAI requires its own authentication/schema smoke;
   each business operation additionally needs its owning feature's quality set.

The PRD's P95 live-turn target below five seconds remains a measurement target,
not a promise about free endpoints. Production budgets and quality thresholds
must be reviewed before the affected operation is enabled.

## 5. Dependencies and authoritative contracts

K-017 depends on K-002/K-006. The gateway can be built independently of the full
session journey; integration waits for session contracts and K-018 orchestration.
Do not infer K-010–K-016 completion from the owner's stage summary: Kanban owns
those cards. ADR-022 permits fixture-backed progress while external evidence is
pending; T034/K-028 and K-026 retain their deployment/release gates.

Follow the [state machine](../../interview_session/specifications/technical/session_state_machine.md),
[LLM policy](../../interview_orchestration/specifications/technical/llm_interaction_policy.md),
[voice contract](../../voice_interaction_transcription/specifications/technical/voice_interaction_contract.md),
[API](../../../../contracts/api/v1_openapi.yaml) and
[events](../../../../contracts/events/async_schemas.json).
