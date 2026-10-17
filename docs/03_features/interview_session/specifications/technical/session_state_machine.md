# Interview Session State Machine

**Status:** Initial V1 contract  
**Owner:** Interview Orchestrator  
**Source of truth:** Backend session state and versioned session events  
**Related:** `contracts/api/v1_openapi.yaml`, `contracts/events/async_schemas.json`, `docs/03_features/interview_orchestration/specifications/technical/llm_interaction_policy.md`

## 1. Purpose and invariants

The persisted session aggregate separates **`currentStage`** (the interview stage) from **`status`** (the lifecycle/runtime condition). `currentStage` starts as `created`; lifecycle statuses such as `paused`, `recoverable_error`, `completed`, and `abandoned` do not erase the last interview stage. This distinction is reflected in the OpenAPI `InterviewSession` schema.

The backend owns session state. The client and LLM may propose actions or text, but neither can set the next state directly.

Invariants:

1. Every session pins one immutable published Problem Pack version.
2. Every accepted state-changing command increments the session version exactly once.
3. Snapshot and transition event are committed atomically.
4. Commands that may be retried require idempotency keys.
5. State transitions are validated against the current state, candidate action, session status, and pack policy.
6. A model/provider failure must not be interpreted as candidate failure.
7. Hidden tests, expected outputs, private reference material, and secrets are never included in candidate-visible session payloads.
8. Session ownership is checked on every read and mutation.
9. A completed or abandoned session is terminal unless a deliberate future reopening policy is specified.

## 2. Interview stages and lifecycle status

The table below defines values for `currentStage` only.

| Interview stage (`currentStage`) | Meaning | Typical allowed candidate actions |
|---|---|---|
| `created` | Session record exists; the Problem Pack version is pinned; initial prompt not yet committed | `start` |
| `intro` | Interviewer introduction and session framing | `candidate_response`, `continue` |
| `experience_context` | Optional self-reported background context | `candidate_response`, `continue`, `skip_optional` |
| `problem_read_and_clarify` | Candidate reviews the statement and asks clarifying questions | `candidate_response`, `request_clarification`, `continue` |
| `problem_restatement` | Candidate restates the problem in their own words | `candidate_response`, `continue` |
| `sample_trace` | Candidate explains or traces sample cases | `candidate_response`, `continue` |
| `initial_approach` | Candidate proposes an initial approach | `candidate_response`, `request_clarification`, `continue` |
| `approach_clarification` | Interviewer resolves ambiguity in the proposed approach | `candidate_response`, `continue` |
| `hints` | One permitted hint is offered or discussed | `candidate_response`, `request_hint`, `continue` |
| `code` | Candidate writes or submits an implementation | `candidate_response`, `submit_code`, `continue` |
| `test_and_debug` | Candidate interprets test results and traces their code | `candidate_response`, `submit_code`, `continue` |
| `improve_approach` | Candidate considers improvement or an alternative | `candidate_response`, `continue` |
| `variants_and_followups` | Curated follow-up or variant is presented | `candidate_response`, `request_clarification`, `continue`, `skip_optional` |
| `complexity_analysis` | Candidate explains time and space complexity | `candidate_response`, `continue` |
| `feedback` | Feedback is generated and presented | `continue` |
| `completed` | Interview flow is complete | Read-only |

Lifecycle `status` is separate from `currentStage` and uses these values:

| Lifecycle status (`status`) | Meaning | `currentStage` behavior |
|---|---|---|
| `created` | Session was created and its pack version pinned; start has not committed | `created` |
| `active` | Interview can accept a permitted action | Current active interview stage |
| `paused` | Session is temporarily paused by explicit policy | Preserve the last active interview stage |
| `recoverable_error` | A transient dependency failure prevents current progress | Preserve the stage for retry/resume |
| `completed` | Required interview stages and feedback are complete | `completed` |
| `abandoned` | Session ended without normal completion | Preserve the last stage for history; read-only |

The API exposes this lifecycle `status` alongside detailed `currentStage`. Internal stage names and lifecycle statuses must be mapped consistently to the OpenAPI enums. Text and voice are input modalities, not separate session stages: the voice endpoint checks consent, transcribes the utterance, and passes the transcript into the same candidate-response validation/transition path. A transcription error leaves the state/version unchanged. Code submission is not yet an accepted action in the initial session REST contract: add it only after the K-021/K-022 execution UX and queued-result semantics are designed.

## 3. Transition policy

The following is the default path. The orchestrator may loop within a stage for clarification, candidate follow-up, or bounded retries. It must not skip a required stage merely because the model suggests doing so.

```text
created --start--> intro
  -> experience_context [optional]
  -> problem_read_and_clarify
  -> problem_restatement
  -> sample_trace
  -> initial_approach
  -> approach_clarification [if ambiguity warrants]
  -> hints [only when policy permits and a hint is requested/needed]
  -> code
  -> test_and_debug [when execution needs interpretation or a feasible failure occurs]
  -> improve_approach [when appropriate]
  -> variants_and_followups [optional within V1 policy]
  -> complexity_analysis
  -> feedback
  -> completed
```

`approach_clarification`, `hints`, `test_and_debug`, `improve_approach`, and `variants_and_followups` are conditional or repeatable stages. Their entry conditions must be defined by deterministic policy and Problem Pack configuration.

## 4. Transition table

| From | Trigger/guard | To | Required backend action |
|---|---|---|---|
| `created` | Valid start command while lifecycle status is `created` | `intro` | Persist the start event/initial interviewer turn and set lifecycle status to `active`; do not repin or reject the already-pinned version merely because it is later deprecated |
| `intro` | Intro turn committed | `experience_context` | Present optional experience question |
| `experience_context` | Answer, continue, or optional skip | `problem_read_and_clarify` | Store only relevant candidate-provided context |
| `problem_read_and_clarify` | Candidate indicates ready; no unresolved required clarification | `problem_restatement` | Present restatement prompt |
| `problem_restatement` | Candidate response captured | `sample_trace` | Store evidence and present sample-tracing prompt |
| `sample_trace` | Candidate response captured and sample stage complete | `initial_approach` | Store evidence and request approach |
| `initial_approach` | Response is materially ambiguous | `approach_clarification` | Ask a targeted clarification; do not force-match |
| `initial_approach` | Approach is sufficiently understood | `hints` or `code` | Select based on policy; do not expose hints by default |
| `approach_clarification` | Candidate clarifies | `initial_approach` or `code` | Reassess the explanation and continue by policy |
| `hints` | Candidate requests/receives one allowed hint | `hints` or `code` | Advance hint index only when hint exposure is committed |
| `code` | Valid submission accepted | `test_and_debug` | Persist submission and enqueue execution |
| `test_and_debug` | Execution result is available | `code`, `improve_approach`, or next required stage | Present safe result; keep infrastructure errors neutral |
| `improve_approach` | Candidate response or revised submission captured | `code` or next required stage | Store reasoning evidence and follow configured flow |
| `variants_and_followups` | Follow-up answered or optional stage skipped | `complexity_analysis` | Store evidence and selected variant identifiers |
| `complexity_analysis` | Candidate response captured | `feedback` | Freeze evaluation inputs and generate feedback |
| `feedback` | Feedback persisted and presented | `completed` | Mark terminal state and record completion event |
| Any active state | Explicit pause allowed by product policy | `paused` | Persist current state without advancing stage |
| `paused` | Authenticated resume request | Previous active stage | Restore state; do not replay side effects |
| Any non-terminal state | Transient dependency failure after bounded retry | `recoverable_error` or remain at current state | Preserve state and define retryable action |
| `recoverable_error` | Retry succeeds | Previous active stage | Resume the same logical operation idempotently |
| Any non-terminal state | Explicit cancellation/abandonment accepted | `abandoned` | Persist terminal event |
| `completed` or `abandoned` | Any mutating action | No transition | Reject with conflict/terminal-state error |

This table is the baseline, not permission to skip required stages. Feature-level requirements may tighten guards but must not weaken the invariants above.

## 5. Concurrency, idempotency, and atomicity

- Each state-changing request includes an `Idempotency-Key` and expected session version (`If-Match`). The API returns an `ETag` whose quoted decimal value encodes that version; clients send that exact entity tag, not an unquoted integer.
- The server verifies ownership, status, expected version, and allowed action before performing work.
- Resolve an existing idempotency record before evaluating the version precondition for a retry. A duplicate key with the same normalized payload returns the original logical result, even if its original `If-Match` is now stale; a duplicate key with a different payload returns `409 Conflict`.
- For a new command, a stale expected version returns `412 Precondition Failed`. The client must use the current `ETag` for a new logical command.
- Persist snapshot, event, idempotency result, and outbox entry (if needed) in one database transaction.
- Do not hold a database transaction open while waiting for a slow model or code execution call. Use a persisted operation/job state and finalize with a guarded compare-and-swap transition.
- A result from a stale model/execution operation must not overwrite a newer session state.

## 6. Failure and recovery

| Failure | Required behavior |
|---|---|
| Model timeout or invalid structured output | Bounded retry where safe; otherwise preserve current stage and offer retry/recovery. No transition on invalid output. |
| Model provider rate limit | Respect bounded retry/backoff; return recoverable status when retry budget is exhausted. |
| Execution queue full | Preserve submission; return a retryable saturation outcome or queued state according to contract. |
| Sandbox infrastructure failure | Mark infrastructure failure; do not score as candidate error. |
| Database unavailable before commit | Do not claim the action succeeded; retry with the same idempotency key. |
| Client disconnect after commit | Retry returns the committed result. |
| Concurrent turn submissions | Only one command can commit for the expected session version; other request receives conflict. |
| Published pack withdrawn for new sessions | Existing session remains pinned; new session creation rejects unavailable versions. |

## 7. Event minimums

At minimum, record events for session creation/start, pack version pinning, accepted candidate response, accepted stage transition, hint exposure, code submission, execution completion, evaluation evidence, feedback generation, pause/resume, recoverable failure, and completion/abandonment.

Events should contain identifiers, versions, and outcome metadata—not secrets, full hidden test payloads, or unnecessary personal data.

## 8. Tests required before implementation is considered complete

- Every permitted transition and representative forbidden transition.
- Terminal-state mutation rejection.
- Pack version pinning and no silent mutation.
- Stale version and concurrent command handling.
- Same idempotency key/same payload and same key/different payload.
- Snapshot/event atomicity and recovery after client disconnect.
- Model timeout/malformed output without state corruption.
- Execution infrastructure failure neutrality.
- Cross-user read/write denial.
- Resume from every non-terminal stage supported by V1.
