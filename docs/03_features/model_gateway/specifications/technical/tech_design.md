# Model Gateway — Technical Design

**Status:** Accepted design for owner-authorized K-017 implementation; local Groq
exception accepted in ADR-024 on 2026-10-23.
Implementation and provider acceptance remain separate.

## 1. Boundary and implementation shape

Use the existing TypeScript/Next.js Node backend. Place the gateway under
`src/modules/model-gateway/`, with cross-module access through `public.ts`.
Provider-specific HTTP mapping stays in `adapters/`; application code owns
validation, deadlines, retries and metadata. Use Node's native `fetch` and the
existing Zod validation library initially; no SDK/dependency upgrade is required.

```text
Trusted caller -> operation registry -> admission/input checks
               -> provider adapter -> complete-response validation
               -> typed proposal/error + call metadata -> caller policy checks
```

The caller supplies authorized, minimized context. The gateway enforces the
operation's input allowlist, not database ownership or product eligibility.
Never accept a whole session/Problem Pack record as provider context.

## 2. Internal interface

Proposed TypeScript contract; not a new HTTP/event interface:

```typescript
declare function invoke<K extends EnabledOperation>(request: {
  operation: K;
  input: OperationInput[K];
  context: {
    requestId: string; // existing request correlation
    operationId: string; // stable caller logical-operation identifier
    sessionId?: string;
    expectedSessionVersion?: number;
    packVersion?: string;
    rubricVersion?: string;
    policyVersion?: string;
  };
  signal: AbortSignal;
}): Promise<GatewayResult<OperationOutput[K]>>;
```

`GatewayResult` is a discriminated success/error union. Both branches include
metadata; neither exposes raw headers, provider error bodies or credentials.
Success carries `data`; failure carries `code` and a caller-level `retryable`
flag. That flag does not permit unbounded retries. Only trusted composition code
constructs the registry and provider adapter; consumer input cannot replace them.

Trusted server composition uses `createModelGateway` with an adapter, optional
validated registry, actual environment, optional reviewed rate card and safe
completion callback. A real adapter without an explicit environment is rejected.
The factory snapshots rate-card scalars; later caller mutations cannot change
reservation, attempt estimates or recorded version. `close`/`destroy` abort work.

Adapters may prepare a fixed request without billable dispatch, returning a
nullable conservative input-token bound plus a send closure. Preparation shares
the total deadline; production/staging reject unknown bounds/cards/caps before
sending. Transport fixes the provider endpoint and limits complete-body reads;
owned tests can inject fetch, while runtime composition always uses native fetch.
Response ownership is retained through fetch/reader handoff, including arrivals
after cancellation. No new HTTP or event contract is introduced by these seams.

The registry stores input/output validators, JSON Schema, prompt ID/version,
evaluation-set version, visibility rules, limits, and provider capability needs.
Generate/reconcile provider JSON Schema with the runtime validator; test both
against the same fixtures. Pin an immutable prompt version, never log its body.

Stage 4's enabled `gateway_probe` accepts exactly `{ text: string }` from a
trusted synthetic fixture (1–512 UTF-8 bytes; no extra fields) and returns
exactly `{ "schemaVersion": 1, "acknowledged": true }`. The operator verifies
that exact result. It proves transport/validation, not interviewer quality.
Business operations stay disabled until their owning designs supply full
schemas and semantic checks; do not invent a universal interview response.

## 3. Central provider map and configuration

| Operation                                                           | Production OpenAI model | Local Groq model (synthetic inputs only)                |
| ------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| `gateway_probe`                                                     | `gpt-6.1-sol`           | `openai/gpt-oss-120b`                                   |
| `interview_turn`, `approach_assessment`, `hint_support`, `feedback` | `gpt-6.1-sol`           | `openai/gpt-oss-120b`, after consumer design/evaluation |
| `intent_classification`, `stage_classification`                     | `gpt-6-luna`            | `openai/gpt-oss-120b` initially; 20B deferred           |
| `transcription`                                                     | `gpt-transcribe`        | Unsupported in Stage 4                                  |
| `speech`                                                            | `gpt-4o-mini-tts`       | Unsupported in Stage 4                                  |

`gpt-6-astra` remains disabled unless quality-tested and budget-approved under
ADR-012. No automatic model/provider substitution. Reverify account access,
model IDs and endpoint/schema support before live acceptance or deployment.

Proposed server settings: `MODEL_GATEWAY_ADAPTER=disabled|fake|groq|openai`
(default `disabled`), `GROQ_API_KEY`, `OPENAI_API_KEY`. Keep operation/model/policy
configuration in one trusted, versioned registry. Only selected real adapters
require their key. Keys live in ignored `.env.local` for local runs; remote
injection follows K-028. Reject public key variants, including
`NEXT_PUBLIC_GROQ_API_KEY`. Never read or print keys for documentation evidence.

Runtime environment rules:

| Environment             | Allowed adapters                                           |
| ----------------------- | ---------------------------------------------------------- |
| `development`           | `disabled`, `fake`, explicitly selected `groq` or `openai` |
| `test`                  | `disabled`, `fake`; no real-provider dispatch              |
| `staging`, `production` | `disabled`, `openai`                                       |

Groq is restricted to the operator-only `gateway_probe` in Stage 4. Its input
comes from checked-in synthetic fixtures chosen by the trusted harness, never
live session records or a caller-supplied `synthetic=true` flag. Future Groq
business-operation tests still require synthetic fixtures and owning-feature
schema/evaluation review; qualifying a schema does not authorize real candidate
data. No public handler may invoke the Groq adapter.

Controlled-server contract tests construct adapters with an injected test
transport and dummy credentials, independently of runtime adapter selection.
That transport targets an owned local fixture server and checks the intended
provider origin/wire shape. It is unavailable to production composition; there
is no environment-controlled endpoint override or external provider call in CI.

Groq uses `https://api.groq.com/openai/v1/chat/completions`; OpenAI text uses
`https://api.openai.com/v1/responses`. Each adapter builds/extracts its own wire
shape. Set OpenAI Responses `store: false`; this does not promise provider-side
zero retention. Fix/allowlist origins and disable redirects; no request-controlled URL.
Strict JSON Schema support does not make tool calls, reasoning fields, usage
fields or streaming interchangeable. Stage 4 buffers bounded text responses;
no model tools, streaming or audio capabilities are enabled.

## 4. Limits, retries and error semantics

Initial **development probe defaults**, to be measured rather than treated as
production SLOs:

| Control                                     | Limit                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Serialized provider request / response body | 16 KiB / 128 KiB; bounded streaming read even when Content-Length is missing                            |
| Completion tokens                           | 1,024, including reasoning where the provider counts it                                                 |
| Total call / each attempt                   | 15 seconds / at most 6 seconds, clipped to remaining total time                                         |
| Attempts                                    | 2 total, including the original request                                                                 |
| Retry wait                                  | 250–500 ms jitter; honor valid Retry-After only if at most 2 seconds and it fits the remaining deadline |
| In-flight calls per process                 | 2; no waiting queue; reserve slot for the whole logical call                                            |
| Operator smoke run                          | At most 5 logical calls / 10 provider attempts; concurrency 1                                           |

Byte limits are not token estimates. A large model context window does not
override the account's token-per-minute quota. Handle provider context/quota
rejection explicitly. Check live account limits rather than hard-code free-tier
allowances as guarantees. Per-process admission is not a fleet-wide quota or a
per-user abuse control; those remain activation gates for public consumers.

Retry only connection failures, attempt timeouts, HTTP 408, recognized transient
429 throttling and 500/502/503/504 when budget remains. Quota exhaustion is not
transient throttling. Adapters classify bounded error envelopes using recognized
machine-readable codes, never free-text message matching; an unknown 429 is
nonretryable until classified. Error bodies remain private and are never logged.

Parse Retry-After as delta seconds or an HTTP date; invalid values use normal
jitter. Wait at least the greater of the valid provider delay and local jitter.
If that wait exceeds two seconds or cannot fit the remaining deadline, return
without retrying early. An attempt timeout may retry; total timeout or caller
abort may not. Disable hidden transport retries. A retry may incur another charge
even if the earlier outcome is unknown.

| Stable error                                                     | Meaning / behavior                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `invalid_request`, `operation_disabled`, `unsupported_operation` | Reject locally; no retry                                                           |
| `configuration_error`, `provider_auth_failed`                    | Operator correction needed; no retry                                               |
| `saturated`, `budget_exceeded`                                   | Reject before another dispatch; caller may recover according to policy             |
| `rate_limited`, `provider_unavailable`, `timeout`                | Recoverable dependency failure after bounded attempts                              |
| `cancelled`                                                      | Stop immediately; ignore late completion                                           |
| `invalid_output`, `refused`, `output_limit`                      | No repair/retry; preserve state and let caller choose the documented recovery path |

Provider mapping is shared by the adapters' contract fixtures:

| Condition                                                                   | Code                                           | Caller `retryable` / internal retry               |
| --------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Input schema/size failure; provider context-limit error or HTTP 400/413/422 | `invalid_request`                              | false / none                                      |
| Unknown operation / known disabled operation                                | `unsupported_operation` / `operation_disabled` | false / none                                      |
| Missing configuration; model/endpoint not found (404); redirect (3xx)       | `configuration_error`                          | false / none                                      |
| Authentication/permission/model-access denial (401/403)                     | `provider_auth_failed`                         | false / none                                      |
| Recognized exhausted quota/credit condition, including a quota 429          | `quota_exhausted`                              | false / none; operator must restore quota         |
| Recognized transient throttling (429)                                       | `rate_limited`                                 | true / within attempts, delay and deadline bounds |
| Connection failure; HTTP 500/502/503/504                                    | `provider_unavailable`                         | true / within remaining bounds                    |
| Attempt timeout or HTTP 408                                                 | `timeout`                                      | true / only while total time remains              |
| Total deadline expired                                                      | `timeout`                                      | true / none in this invocation                    |
| Unknown 429, other 4xx or unclassified HTTP failure                         | `provider_rejected`                            | false / none                                      |
| Invalid successful envelope, content type, JSON or output schema            | `invalid_output`                               | false / none                                      |
| Refusal / truncation, response byte cap or completion-token limit           | `refused` / `output_limit`                     | false / none                                      |
| Local saturation / estimated-cost cap                                       | `saturated` / `budget_exceeded`                | true / no dispatch from this invocation           |
| Caller/shutdown cancellation                                                | `cancelled`                                    | false / none                                      |

`quota_exhausted` and `provider_rejected` are terminal provider errors, not
candidate assessments. A caller retry is a separate bounded policy decision;
`retryable=true` never restarts the same invocation automatically. Cancellation
takes priority over deadline expiry; both take priority over a late result.

Check provider completion status before parsing JSON: truncation/refusal/tool
output cannot become success even if some JSON is parseable. Validate exact
schema/version, enums, sizes and allowed identifiers. Stage/evidence/exposure
checks are also required in the consuming feature; schema validation alone
cannot prove that generated language is safe or correct.

## 5. Usage, cost and privacy

Return call ID, request/operation IDs, provider and configured/reported model,
operation/schema/prompt/evaluation versions, relevant caller version references,
attempt count, durations and final validation/error code. Preflight rejection,
disabled operations and saturation also produce one finalized result/summary,
with zero attempts; unavailable provider/version fields are null, and untrusted
operation names use a fixed `unknown` telemetry label. Keep per-attempt usage
when available, including reasoning/cached token categories without double
counting; totals must identify partial/unknown attempts.

Usage metadata contains per-attempt IDs, duration, outcome and normalized token
counts, plus aggregate known totals and explicit unknown/partial-attempt counts.
Reasoning and cached input remain included subtotals, not additional tokens.
If required aggregate totals cannot be represented as safe integers, keep those
totals null and mark aggregate completeness partial, even if each attempt is
complete. Per-attempt unknown/partial counters still describe the actual attempts.
`reservedCostUsd` is the conservative dispatch reservation; `estimatedCostUsd`
sums available attempt estimates with a separate completeness flag.
`modelCallLogFields` produces the flattened allowlisted logger projection.

Record `estimatedCostUsd`, rate-card version and completeness separately from
actual charge status (`unknown` unless independently established). Free access
does not justify recording unknown usage as zero. Before production dispatch,
require a reviewed rate card, conservative token reservation, and positive
per-call estimated-cost cap; reserve across both possible attempts. If a safe
upper bound cannot be established, reject the operation. Account spending needs
provider controls too; this is not a guaranteed billing cap.

Extend the existing allowlisted logger deliberately: `model_call_completed`
with bounded operation/provider/model/version labels, timing, attempts, numeric
usage and outcome. IDs belong in logs, not metric labels. Do not pass provider
exceptions, request/response bodies, candidate content or secrets to the logger.
No new database table: metadata returns to the caller for later canonical
turn/assessment/event records; no durable duplicate prompt/response store.

## 6. Consumers, lifecycle and contract impact

Stage 4 adds no OpenAPI route or asynchronous event producer/consumer. Existing
API errors and event payloads remain canonical. K-018/conversation,
approach-assessment, hints-variants and feedback will consume `public.ts`; K-029
owns audio consent/routes/limits and later audio adapter implementation.

The caller performs initial ownership/version checks, calls the gateway outside
a database transaction, then rechecks state/version before committing. Results
from stale operations are discarded. Caller idempotency prevents duplicate
session effects; provider requests are not promised exactly-once billing.

Use one outer failure/finalization boundary for every invocation. Each attempt
has its own cleanup before backoff or another dispatch: abort, cancel its reader,
detach signal listeners and clear its timer. Finalize metadata before constructing
the returned result. Cleanup/telemetry failures cannot expose raw errors, erase
the original outcome or leak an acquired slot/reservation.

Create the gateway through the existing runtime registry so HMR does not create
extra limiters or clients. Shutdown cancels active work. Keep health probes
uncached and free of provider inference/network calls; a disabled optional gateway
does not make unrelated identity/catalogue readiness fail.

Sources for adapter feasibility: [Groq compatibility](https://console.groq.com/docs/openai),
[structured outputs](https://console.groq.com/docs/structured-outputs),
[account limits](https://console.groq.com/docs/rate-limits), and
[OpenAI text/Responses guidance](https://developers.openai.com/api/docs/guides/text).
These establish documentation support, not executed account verification.
