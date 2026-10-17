# API Contract Notes

**Status:** Initial V1 contract  
**Machine-readable contract:** `contracts/api/v1_openapi.yaml`

## Scope

The OpenAPI file defines the API surface needed for the application foundation and first persisted session vertical slice: liveness/readiness, candidate-visible published problem listing/retrieval, session creation pinned to a published Problem Pack version, session retrieval, and action submission with optimistic concurrency and idempotency. Session creation returns a `created` session; a separate `start` action moves it into `intro`.

It intentionally does not define every future operation. Add endpoints when feature requirements and technical designs establish their semantics.

## Contract rules

1. Base path is `/api/v1`.
2. Application endpoints require authentication except health checks. V1 uses Clerk-managed sessions; the backend verifies Clerk bearer/session tokens at the request boundary and maps them to an internal stable user ID. The test identity adapter is forbidden in production.
3. Session reads/writes are scoped to the authenticated owner or an explicitly authorized operational role.
4. Clients cannot set canonical session state, scores, hidden content, arbitrary pack versions, hidden-test IDs, expected outputs, or execution resource limits.
5. State-changing requests use `Idempotency-Key`. Session responses return an `ETag` whose quoted decimal value encodes the session version; session actions send that value in the standard `If-Match` header.
6. Errors use a consistent `ApiError` shape with safe messages and a request ID.
7. Retryable errors must not imply a command committed. Reuse the same idempotency key to resolve uncertainty after a network failure. For a matching idempotent replay, the stored result is returned before rejecting the now-stale version precondition; reusing the key with a different payload conflicts.
8. Session creation selects the currently eligible published Problem Pack version. Concrete problem detail and session responses use `problemPackVersion`; a list summary may expose `latestPublishedVersion`. The created session's `problemPackVersion` is authoritative; candidate clients do not choose arbitrary or private versions.
9. Candidate-visible problem responses exclude reference answers, private reviewer notes, hidden tests, and expected hidden outputs.
10. OpenAPI is a contract baseline; implementation should add contract tests and avoid silent breaking changes.
11. API evolution should be additive where practical. Breaking changes require a new API version or documented migration.

## Deliberately deferred API work

- Code submission/execution endpoints and queued-result retrieval/polling semantics; design them alongside K-021/K-022 before adding them to OpenAPI.
- Pagination conventions and final error-code catalogue.
- Numeric limits for uploaded audio and exact permitted MIME types are feature-implementation parameters and must be fixed before production.
- Voice consent and voice-turn processing are in the V1 contract; they do not create a separate state machine. Audio must not advance state unless consent is present and transcription succeeds.
- Final pagination conventions.
- Interview/conversation language and programming-language preferences are separate concepts; `preferredInterviewLanguage` is a spoken/written language preference.
- Code submission is deliberately not an accepted action in the initial session API. Design the code-submission endpoint/action and decide synchronous response versus queued/polling semantics with K-021/K-022 before extending the contract.
- Final error-code catalogue and correlation-ID format.

## Validation

CI should parse the OpenAPI document and run contract tests against implemented endpoints. Add a linter and generated types only if they reduce drift without excessive build complexity.


## Voice endpoints

The OpenAPI contract includes versioned voice consent/revocation, a bounded multipart audio-turn endpoint, and on-demand speech generation for an existing interviewer text turn. Voice transcription must feed the ordinary backend state machine. Audio bodies and generated audio must not be written to application logs or durable storage. See `../../docs/03_features/voice_interaction_transcription/specifications/technical/voice_interaction_contract.md` for behavior and privacy gates. The code-submission/execution API remains deferred until its queued-result semantics are designed.
