# Voice Interaction Contract (V1)

**Status:** Selected V1 behavior; numeric upload limits must be set in implementation design before production.

## 1. Scope

V1 supports turn-based candidate speech, transcription to visible text, and interviewer response text plus optional generated speech. It is not a continuously open microphone, a real-time bidirectional voice agent, or an independent state machine. A user can use text at any point.

## 2. Provider operations

- Transcription: OpenAI `gpt-transcribe` via the Model Gateway.
- Interview response: normal session/orchestration path; defaults to `gpt-6.1-sol`, focused intent/stage classification may use `gpt-6-luna`.
- Speech output: OpenAI `gpt-4o-mini-tts` via the Model Gateway, requested only for an approved interviewer turn.
- No voice-specific provider SDK calls from UI/domain modules. Provider IDs are central configuration.

These model IDs were checked against the OpenAI API model/audio catalog on 2026-10-16. Re-check access, deprecations, pricing, region/data controls, and output quality before a production deploy.

## 3. Request/turn flow

1. The UI explains audio processing, provider processing, non-persistence of raw audio, and the text alternative. The candidate explicitly accepts a versioned notice before enabling recording.
2. The backend records consent metadata (user/session, notice version, accepted/revoked state, timestamp). Consent is not inferred from microphone permission alone.
3. The client records one bounded utterance locally and sends it over HTTPS to the voice-turn endpoint with a session `If-Match` value and idempotency key.
4. The backend authenticates/authorizes the owner, verifies consent, validates size/type/duration, and transcribes the audio.
5. Only after transcription succeeds does the backend normalize the transcript as a candidate response and call the same guarded session transition path used by typed input.
6. The response includes the stored transcript and interviewer response text/turn ID. The UI displays the transcript and response text.
7. The UI may request speech for that interviewer turn. TTS is generated from the already-approved text, not a new model decision, and returned as an audio stream.
8. Audio processing errors leave the session state unchanged where the candidate response was not accepted; the client can retry or use text.

## 4. API/contract semantics

The OpenAPI routes are:

- `POST /interview-sessions/{sessionId}/voice-consent`: record acceptance or revocation of the current notice version; owner-only, guarded by `If-Match` and `Idempotency-Key`.
- `POST /interview-sessions/{sessionId}/voice-turns`: multipart upload of audio; owner-only, requires active consent, `If-Match`, and `Idempotency-Key`; returns transcript, normal interviewer response text, session snapshot, and turn IDs.
- `POST /interview-sessions/{sessionId}/turns/{turnId}/speech`: stream speech for an existing interviewer turn; must reject candidate/system turns and cross-session turn IDs. It does not change interview state.

Implementations must not log multipart bodies or transcript/audio payloads at ingress middleware. Use explicit request-size and duration limits configured centrally and advertise those limits to clients. The OpenAPI schema intentionally leaves the numeric limits as implementation configuration until load/provider tests establish a safe baseline.

## 5. Privacy and retention

- Raw candidate audio is not durably stored by the application and is not written to long-lived object storage, database columns, logs, traces, analytics, or support tickets.
- Audio is streamed/buffered only as needed for transcription; temporary buffers are cleared in success and failure paths. Do not write plaintext audio to disk.
- Transcript and interview/session history retention is 365 days.
- Security/audit logs are retained 90 days and include consent metadata but not raw audio or unrestricted content.
- Generated speech audio is streamed to the client and not persisted by the application.
- OpenAI receives audio for transcription and text for speech generation. Before production, verify enabled API data controls, processing terms, and applicable region/residency settings; no claim of provider-side zero retention is implied here.

## 6. Failure, abuse, and testing

- No consent/revoked consent: reject before reading/forwarding audio.
- Oversize, unsupported, silent, or invalid audio: return a safe validation error without changing session state.
- Transcription timeout/rate limit/malformed response: preserve state, emit sanitized operational telemetry, permit retry/text fallback, and do not score the candidate.
- Stale session version: return `412` without committing a candidate turn.
- Duplicate idempotency key and same payload: return the original turn result; same key with different payload: return conflict.
- TTS failure: interviewer text remains available; no session state rollback is needed.
- Tests cover consent revoked/missing, cross-user ownership, duplicate/replayed requests, stale versions, bad MIME/size, provider failure, no-audio-persistence assertions, log redaction, transcript equivalence with typed input, and speech access to interviewer turns only.

## 7. Open implementation parameters

Before production, pin the supported audio MIME types, maximum file size/duration, request and provider timeout, maximum response speech length, per-user rate limits, consent notice text/version, and latency/cost budget. Privacy and security review are release gates.
