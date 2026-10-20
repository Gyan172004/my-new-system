# Identity and Candidate Access — Technical Specification

**Status:** Approved scope; implementation authorized by owner on 2026-10-20.  
**Date:** 2026-10-20. **Task:** K-012.  
**Behavior:** [Requirements](../../requirements/feature_req.md).

## 1. Request path and ownership

```text
Browser → Next.js HTTP adapter → identity-profile public service
                                  ├─ Clerk verification adapter
                                  └─ PostgreSQL user mapping
        → owning module's application service → owner-scoped repository
```

The identity module answers “who is calling?” The interview/history/submission
module answers “does this caller own this resource?” Each owning service checks
access even when invoked outside an HTTP route. UI visibility and middleware
are conveniences; neither replaces those checks.

Use the existing TypeScript/Next.js modular monolith, Node.js Route Handlers,
`pg`, explicit SQL migrations and shared runtime pool. Domain Clerk verification belongs in `src/modules/identity-profile/adapters/`; browser middleware uses `src/modules/identity-browser/adapters/`.
Browser Clerk components live in a separate `identity-ui` module with its own
browser-safe `public.ts`; callers import only each module's public interface.
This preserves the existing public.ts boundary without exposing server identity
repositories/configuration to client bundles.
No ORM, new auth provider or separate service is needed.

## 2. Internal interfaces

These are proposed server-only application interfaces, not new REST endpoints:

| Interface                                             | Result and responsibility                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `authenticate(requestCredentials)`                    | Verify credentials, resolve mapping and return immutable `AuthenticatedCaller { userId }`, or a typed safe failure |
| `verifySessionToken(token)`                           | Adapter returns verified issuer/subject/session status only; no raw token leaves the adapter                       |
| `resolveUser(verifiedIdentity)`                       | Find or create the stable mapping and return stored status; authenticate rejects a disabled user                   |
| Owning service `read/update(caller, resourceId, ...)` | Fetch and mutate only records owned by `caller.userId`                                                             |

Only the authentication boundary constructs a caller. Resource IDs, `userId`
headers and request bodies never construct one. Server Components/Actions, if
introduced, use the same verification and ownership services.

## 3. Token verification and configuration

The canonical `/api/v1` contract uses `Authorization: Bearer <Clerk session
token>`. Keep this transport for domain APIs; do not silently add cookie-only
authentication. Clerk's UI/session plumbing may use its own cookies. Browser API
calls obtain a current token from Clerk rather than persisting copies themselves.

Use the official Clerk server SDK behind the adapter. Verify signature and
expected algorithm, exact configured issuer, expiry/not-before, subject and
authorized parties; check audience when configured. Accept completed session
tokens only. Never follow token-provided key URLs or fall back to another
adapter on failure. See Clerk's [verification guide](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
and [token API](https://clerk.com/docs/reference/backend/verify-token).

Runtime settings: `CLERK_ISSUER` (exact HTTPS origin),
`CLERK_AUTHORIZED_PARTIES` (comma-separated exact permitted origins), optional
`CLERK_AUDIENCE`, `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_KEY` (PEM public key), and server-only `CLERK_SECRET_KEY` (required by the pinned browser middleware). Domain bearer verification still uses only the public key. Never serialize the private key into browser props.
These settings are required/validated only in Clerk mode and never needed by a
production build. Keep private settings outside browser serialization; pass only
the publishable key and selected presentation props into the browser provider.

Pin `@clerk/nextjs` 7.9.17 and `@clerk/backend` 3.25.0. Use networkless SDK
verification with the configured public key, so there is no request-time JWKS
fetch, unbounded network work or ineffective cancellation wrapper. The pinned SDK requires RSA-2048 with exponent 65537; validate these parameters and normalize a single public PEM (SPKI or PKCS1) to SPKI at startup. A rotated key
requires reviewed configuration replacement/restart; invalid signatures fail
closed during mismatch. Automated JWKS refresh is deferred rather than implied.

Reject credentials over 8,192 UTF-8 bytes, non-RS256/non-JWT headers, missing
integer exp/nbf/iat, wrong exact issuer/party, empty or oversized sub/sid, expired
or premature tokens, configured audience absence/mismatch, and pending/unknown
session status. Missing status is allowed for Clerk instances without that claim;
only missing or active status is eligible. Use zero clock skew. Bound both subject and session ID to
256 ASCII identifier characters each and issuer to 512 bytes to bound mapping indexes.
Never call Clerk profile APIs during request authentication or log SDK errors.

Authentication admission checks a process-wide budget (burst 120, refill
120/minute) and server-observed source budget (burst 30, refill 30/minute) before
verification. Check a separate verified-identity budget (burst 60, refill
60/minute) before user mapping. Use monotonic time, maximum 2,048 source/identity
buckets, bounded per-request expiry work and no depleted-bucket eviction.
Raw tokens never become keys or labels. Source comes from the Node socket context,
not client-controlled forwarding headers. Public health probes are exempt.

Budget exhaustion returns 429 with integer Retry-After rounded up to refill or
safe bucket expiry; admission failure returns retryable 503. The limits are
initial per-process guardrails, not a production throughput promise. K-026 must
verify aggregate protection across actual replicas; no distributed cache or
cloud infrastructure is introduced. The key refresh limiter is unnecessary for
the selected networkless adapter.

The foundation originally rejected Clerk mode. Group 02 enables it only with
complete validated settings; foundation-only disabled operation remains valid. Keep the stricter existing
ban on test identity in both staging and production. Disabled identity remains
available for foundation-only operation, with every private entry point denied.

Local verification cannot promise immediate provider-side revocation: a copied
valid token may remain usable until its expiry. Reverify each request, refresh
through Clerk, and document the observed revocation window during live acceptance.
An immediate-revocation requirement would need a reviewed design change.

## 4. Proposed data model and concurrency

Use one `users` table for the V1 mapping. A separate profile table is unnecessary.

| Column                     | Proposed type | Rule                                                       |
| -------------------------- | ------------- | ---------------------------------------------------------- |
| `id`                       | UUID          | Primary key, generated server-side; stable domain owner ID |
| `identity_provider`        | text          | `clerk` or explicitly isolated `test` namespace            |
| `identity_issuer`          | text          | Exact trusted issuer/environment namespace                 |
| `identity_subject`         | text          | Verified subject; never an email-based lookup              |
| `account_status`           | text          | Checked enum: `active`, `disabled`; default active         |
| `created_at`, `updated_at` | timestamptz   | Server-controlled timestamps                               |

All columns are non-null. Add a unique B-tree index on
`(identity_provider, identity_issuer, identity_subject)`. Issuer scoping prevents
different Clerk instances from colliding. No passwords, token copies, email,
ratings or unnecessary provider profile fields are persisted.

For first access, insert with conflict handling, then select the existing row
in a subsequent statement under PostgreSQL READ COMMITTED. The unique constraint
resolves concurrent first requests. Never overwrite status on conflict or create
a new ID for a disabled account. Bound lock/statement time through foundation
settings. Do not keep a transaction open across external calls.

Later sessions reference `users.id`. Their owner indexes and migrations belong
to the interview feature. Account enable/disable management and deletion are
separate workflows; reads enforce the stored status on every request.

## 5. Authorization and contract compatibility

Use a parameterized predicate containing both resource ID and owner ID. Resolve
child resources through their owning session, checking both child and parent
identifiers. List queries filter by the caller before pagination. Mutations
retain the owner predicate inside their transaction and preserve session version
guards. Authorize before returning any idempotent cached result; scope replay
keys by owner/resource/operation in K-013.

| Situation                                     | HTTP behavior                          |
| --------------------------------------------- | -------------------------------------- |
| Missing/invalid credentials                   | 401, safe `ApiError`                   |
| Verified identity with disabled local account | 403                                    |
| Absent or foreign-owned private resource      | 404, same public shape                 |
| Admission budget exhausted                    | 429 with Retry-After and safe ApiError |
| Admission/verification/storage unavailable    | Retryable 503 with safe ApiError       |

Use the existing `ApiError` fields: `code`, `message`, `requestId`, optional
`retryable`. No raw SDK/database errors or identity details. Protected responses
use `Cache-Control: private, no-store`; do not place caller data in shared Next.js
caches. Validate local return URLs to prevent open redirects.

The canonical OpenAPI is reconciled now: every protected operation declares
401/403/429/503 and uses the existing ApiError shape. 403 covers a disabled local
account; foreign-owned session resources still return 404. Admission may reject
before token verification; otherwise invalid credentials return 401. No event
schema or success payload changes. Health keeps `security: []` and stays uncached.

| Producer / owning task                                | Contract additions                                                                                           | Consumers and verification                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Catalogue reads — K-009                               | List: 403/503; detail: 403/429/503                                                                           | Catalogue browser clients and contract fixtures must handle denied, throttled and retryable unavailable states |
| Session create/read — K-014                           | Create: 403/503; read: 429/503                                                                               | Session clients preserve command keys on retry; K-014/K-016 verify actual HTTP behavior                        |
| Voice consent — K-029                                 | 503                                                                                                          | Consent UI preserves the original command key and does not claim success on failure                            |
| Session actions, voice turns and speech — K-014/K-029 | Existing statuses retained; common identity errors apply, voice outage descriptions include identity/storage | Orchestration and voice clients do no downstream work after identity rejection                                 |

`tests/contract/identity-errors.test.ts` checks all eight protected operations and
consumer error-schema compatibility now. It does not prove unbuilt handlers.
Their owning feature tests must execute the same error cases when implemented.
History/submission/profile APIs are not added by this reconciliation.

## 6. Cross-feature boundaries and privacy

- Denial side effects: pre-admission may update limiter bookkeeping; verification
  may fetch trusted keys; a verified first-time identity may create a user mapping
  before a resource-level 404. Invalid credentials never create that mapping.
  None of these steps authorizes loading private content or changing interview
  resources, events, idempotency results, hints or jobs after denial.
- Session state machine: ownership precedes every read/change; identity cannot
  advance a stage or change idempotency/concurrency semantics.
- LLM interaction policy: client context and model text cannot establish identity,
  ownership or roles. Map the caller before loading model context.
- Execution contract: authorize submission access before enqueueing; keep identity
  credentials out of sandbox payloads.
- Voice contract: authorize the session and interviewer turn before consent,
  transcription or speech generation. Identity adds no consent bypass.
- Experience context follows `CreateSessionRequest.clientContext` exactly;
  validation/storage belong to the session service. No persistent profile API.
- Emit allowlisted outcome categories, duration and request ID. Do not log raw
  identities, tokens, cookies or candidate context. Security/audit retention is
  90 days under ADR-019; deletion/backup handling remains a launch gate.

## 7. Design review gates

Selected methods are Google and email verification codes, managed by Clerk.
Disable GitHub and email/password in the V1 sign-in configuration. Clerk owns
code delivery/verification; our application maps only a completed verified
session and does not implement its own email-code service.

Selected presentation: embed Clerk's prebuilt sign-in component in the
application's `/sign-in` page, rather than the hosted Account Portal or a custom
authentication form. Apply appearance options around the managed component;
Clerk owns provider redirects, email-code validation and session issuance.
Follow the [retained sign-in frame](../../../../01_macro_architecture/frontend_wireframe/previews/02-sign-in.png).
Preserve its dark visual system, centered form and accessible form semantics;
omit the illustrative GitHub button, update its "Clerk-hosted" copy for the
embedded experience, and do not offer email/password sign-in. Preserve the
original export. Google's provider redirect remains part of managed OAuth.
Protect return navigation and show a recoverable sign-in error without losing
persisted interview progress.

This design applies ADR-016/019/021/022 without changing them. Significant changes
must use the [existing ADR register](../../../../01_macro_architecture/05_architecture_decision_records.md).
Contract authority remains [OpenAPI](../../../../../contracts/api/v1_openapi.yaml)
and [events](../../../../../contracts/events/async_schemas.json).

## 8. Execution decisions and sources

Use Playwright 1.64.1 and Vitest coverage-v8 5.0.5. Browser verification covers the
actual embedded component and unavailable/disabled states; synthetic cryptographic
fixtures and local UI fixtures never establish actual Clerk/Google acceptance.
Live development-instance tests use real Clerk SDK/browser traffic and safe test
identities. Accountless setup, if needed, runs in an isolated temporary project
because Clerk init scaffolds files; transfer credentials locally without printing
them. Never run init over the reviewed custom-server workspace.

Minimum persisted ownership acceptance uses session-module snapshot/event storage,
not a test-only replacement table. Its owning four documents specify the narrow
prerequisite slice. Catalogue/session APIs and full conversation orchestration
stay on their existing cards. K-010/K-011 status follows their own acceptance.

Sources checked: official Clerk Next quickstart, verifyToken documentation and
published npm engine/peer metadata. The SDK's default clock skew and missing-aud
behavior require explicit adapter checks. No stack/provider choices are reopened.

Browser SDK middleware lives in `identity-browser/public.ts`; client components live in `identity-ui/public.ts`. This keeps the allowed public entry convention without a server import reachable from a client barrel. Browser pages are dynamic; only the publishable key reaches the provider. Every sign-in and sign-up completion uses a validated local force redirect, overriding untrusted SDK query destinations. No private feature pages are added here.

Account UI is keyed by verified Clerk user/session. `AccountStateBoundary` remounts local state on a change and exposes `useAccountSignal()` for aborting user-scoped requests. It renews its controller after React StrictMode effect replay. Consumers must use the signal and never persist bearer tokens or use shared private caches. Fixture-only browser pages prove clearing/cancellation; actual session-page integration remains K-014/K-016.

`withCandidate(request, work)` is the shared Node route adapter. It passes the
immutable caller and combined transport/request abort signal to owning services.
It requires active trusted socket context, uses the same runtime-owned verifier,
limiter and database pool across HMR, and sanitizes safe correlated failures before
Next can serialize them. Protected responses use private/no-store and vary by
Authorization. Health handlers do not call it.

### Convergence reconciliation

Browser middleware uses the startup-validated `CLERK_SECRET_KEY` from its server environment. It does not pass a dynamic `secretKey` option, which would require Clerk request-data encryption configuration. The domain verifier still uses only the validated public PEM and has no network fallback. The wireframe fonts are pinned, licensed local IBM Plex Sans/Mono assets in `src/app/fonts`; `next/font/local` supplies shared CSS variables to the shell and embedded component without build-time font fetching. Session context follows the owning session validation limits, counting Unicode characters rather than UTF-16 units.
