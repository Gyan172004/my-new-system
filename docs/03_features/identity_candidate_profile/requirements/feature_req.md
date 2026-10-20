# Identity and Candidate Access — Requirements

**Status:** Approved scope; implementation authorized by owner on 2026-10-20.  
**Feature:** 2 in delivery order (Stage 1). **Kanban:** K-012.  
**Date:** 2026-10-20.

## 1. Problem and outcome

A candidate should sign in and return to their own interview work. Knowing a
session's URL must never give someone else access to it. The application needs
one stable internal identity per verified account, even across browser refreshes
and new sign-ins.

Clerk handles sign-in. Our backend decides which application data that person
can read or change. This follows ADR-016 and the existing API security contract.

## 2. Scope

Include sign-in/sign-out integration, server-side token verification, internal
user mapping, ownership checks and a development/test identity adapter. Support
the existing optional per-session experience and interview-language fields.

Persistent profiles, saved ratings/preferences, account linking, organizations,
admin permissions, account export/deletion workflows and interview/history pages
are outside this slice. Account-deletion timing remains a production privacy
gate in the domain architecture. This feature supplies access rules for later
session, submission, feedback, history and voice work.

## 3. Candidate journeys

| Journey                                | Expected result                                              | Acceptance scenario                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| US1 — Sign in and return               | The same verified account resolves to the same internal user | Given a signed-in candidate, when they refresh or sign in again, then their internal identity stays unchanged                             |
| US2 — Access private work              | Only the owner can read or change it                         | Given Alice's session, when Bob requests a read or mutation using its ID, then no data or side effect is returned                         |
| US3 — Recover from expiry or failure   | The candidate can sign in again or retry safely              | Given an expired token or unavailable identity dependency, when a private request arrives, then it fails without changing interview state |
| US4 — Develop without live credentials | Automated tests can use controlled identities                | Given a test identity configuration, when staging or production starts, then startup is rejected                                          |

## 4. Functional requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | Offer Google and email verification-code sign-in through Clerk's prebuilt component embedded in the application's `/sign-in` page, plus Clerk-managed sign-out. V1 excludes GitHub and email/password sign-in. Clear private client state on sign-out/account switch; redirect only to an allowlisted local destination.                            |
| FR-02 | Verify every protected request server-side. Reject missing, malformed, expired, premature, forged, wrong-issuer or disallowed-party tokens. Validate the configured audience when used. Incomplete sign-in must not grant access.                                                                                                                   |
| FR-03 | Map the verified provider identity to one stable internal user ID. Concurrent first requests must create at most one mapping. Never use a browser-supplied user ID or email as proof of identity.                                                                                                                                                   |
| FR-04 | Check ownership for every private read and mutation, including nested resources and idempotent response replay. Derive the owner of new records from the verified caller.                                                                                                                                                                           |
| FR-05 | Return the same not-found response for another user's private resource and an absent resource. Denied requests must not load private transcripts, invoke model/audio/execution providers, enqueue jobs or change interview/resource state. Trusted-key retrieval, admission bookkeeping and verified user mapping may occur before resource denial. |
| FR-06 | Enable test identities only in development/test with explicit configuration. Disabled identity grants no private access; staging/production may not serve private features with disabled or test identity.                                                                                                                                          |
| FR-07 | Keep experience context optional and per-session. Accept only the existing contract fields; self-reported experience is at most 2,000 characters. Treat it as untrusted context, never as authorization or a direct score multiplier.                                                                                                               |
| FR-08 | Keep passwords, tokens, authorization headers, provider subjects and candidate context out of application logs. Return safe errors with a request ID. Never share private response caches between users.                                                                                                                                            |
| FR-09 | Distinguish invalid credentials from unavailable admission/verification/storage. Fail closed in both cases; preserve interview state and allow a safe retry for dependency failures.                                                                                                                                                                |
| FR-10 | Preserve unauthenticated, uncached liveness/readiness endpoints and foundation startup/shutdown behavior.                                                                                                                                                                                                                                           |
| FR-11 | Bound authentication requests before expensive verification and again per verified identity before mapping/storage. Return 429 with Retry-After when throttled; unavailable admission returns retryable 503. Keep limiter memory bounded, omit raw tokens from keys/logs and preserve public health probes.                                         |

## 5. Acceptance and failure behavior

- AC-01: Both Google and email verification-code sign-in resolve a verified
  Clerk account to its internal ID. Sign-out and repeat sign-in to that same
  Clerk account preserve the ID; a different verified account gets another ID.
  GitHub and email/password options are absent. Invalid/expired email codes do
  not complete sign-in or create an application user mapping.
- AC-02: Concurrent first access produces one user row and the same ID for all
  successful requests. Database failure returns no provisional identity.
- AC-03: Every negative-token case in FR-02 is rejected before private work.
  Outside an admission rejection, invalid credentials return 401; a locally disabled account returns 403.
- AC-04: K-012 tests Alice/Bob reads and writes through the actual persisted
  session application service, with no private content or resource changes on
  denial. K-014/K-016 repeat those checks at HTTP/end-to-end boundaries and add
  command replay; child/list consumers add equivalent checks when introduced.
  Missing and foreign-owned resources return the same safe 404 shape.
- AC-05: Verifier/key-service or database outages return a retryable service
  error, never anonymous/test fallback. Existing signed tokens may be verified
  with a still-valid trusted key; expired tokens always fail.
- AC-06: Test/disabled adapters cannot expose private product routes in remote
  environments. Test headers cannot impersonate users in Clerk mode.
- AC-07: Optional context works when omitted, rejects unknown fields and
  overlength experience, and never changes ownership or scoring weights.
- AC-08: The application's `/sign-in` page embeds Clerk's prebuilt component
  using the selected methods and the retained wireframe's visual direction; it has labelled keyboard-accessible
  controls, pending/error states and a safe return path. Sign-out/account switch
  removes the previous user's private content from view and client caches.
- AC-09: Privacy canaries do not appear in logs, errors or other users' responses.
  Health endpoints keep their current public behavior.
- AC-10: Over-budget unauthenticated requests stop before verification, and
  over-budget verified identities stop before user mapping/storage. Both return
  429 with Retry-After and no interview work. Tests cover refill, bounded state,
  concurrent requests, limiter outage (503) and health-probe exemption.

These are required outcomes, not claims that tests have run. K-012 completion
requires real Clerk acceptance and cross-user application-service tests against
actual local PostgreSQL session persistence. Test doubles do not satisfy that
ownership gate. K-014/K-016 and later consumers own their route/end-to-end
regressions; they are not prerequisites for K-012. Sign-in/sign-out UI checks
belong here; private session-page account-switch checks belong to those pages.

## 6. Review decisions and dependencies

Owner selected Google plus email verification codes for V1. The retained preview
shows Google/GitHub and email; implement Google and email only, preserving its
visual direction and original export. Owner selected Clerk's prebuilt sign-in
component embedded in the application's `/sign-in` page. Adapt the wireframe's
illustrative "Clerk-hosted" copy to this selected presentation without modifying
the retained export. Google authentication may redirect to Google as part of
Clerk's managed flow. Owner subsequently authorized implementation, dependency installation, reviewed
group commits and task-issue export for this feature. Provider setup uses an
isolated development instance; production/cloud acceptance remains separate.

K-002 is Done. Storage work also relies on K-005's verified local migration/test
baseline. K-006 hosted CI and K-028 external environment acceptance remain open;
ADR-022 permits documented reliance on the local foundation. K-012's mapping
and persisted ownership acceptance also depend on K-005/K-011. Identity adapter
work can begin earlier. K-011's storage/state work has no K-012 prerequisite;
K-014 consumes completed K-012 authorization. Do not add K-014 as an upstream
identity completion gate or implement its endpoints in this feature.

## 7. Sources

- [Feature order](../../../02_build_sequencing/feature_implementation_order.md#stage-1--identity-and-candidate-access), [dependencies](../../../02_build_sequencing/build_dependency_graph.md) and [release gates](../../../02_build_sequencing/v1_scope_and_release_plan.md).
- [ADR register](../../../01_macro_architecture/05_architecture_decision_records.md): ADR-016, ADR-019, ADR-021 and ADR-022.
- [Domain architecture](../../../01_macro_architecture/03_data_and_domain_arch.md), [API contract](../../../../contracts/api/v1_openapi.yaml) and [Kanban](../../../../project_management/kanban_board.md).
- [Wireframe and reconciliations](../../../01_macro_architecture/frontend_wireframe/index.md), including the retained sign-in preview.

## Clarifications

### Session 2026-10-20

- Q: Which sign-in methods should V1 support? → A: Google plus email verification codes (option B).
- Q: Where should candidates complete sign-in? → A: Clerk's prebuilt component embedded in our `/sign-in` page (option A).

### Execution authorization — 2026-10-20

The owner authorized completing Feature 2 autonomously using plan → checklist →
tasks → analyze/remediate → taskstoissues → implement → coverage/converge. Each
task group ends with an explicit installed-stack-skill review and then a scoped
commit using the foundation's structured metadata. GitHub issues mirror the
canonical task IDs and Kanban cards; they do not replace Kanban or create another
status authority. Do not prompt for routine engineering choices. Mandatory tool
approvals and inaccessible external account controls remain real constraints.

### Implementation acceptance evidence — 2026-10-20

Local implementation, real PostgreSQL isolation and development Clerk email-code/token smoke are verified; see [observed commands and limitations](../../../runbooks/identity.md). The owner subsequently claimed the same development instance and selected-method configuration was applied and verified. The owner reported successful real Google and real-email sign-in; actual provider expired-code rejection and repeat email-code mapping are now verified. AC-01 remains partial pending the owner account’s server verification/mapping confirmation in the temporary acceptance app. AC-08's local shell/keyboard/account clearing/font behavior is verified, and its exact provider-method configuration is now verified in the claimed development instance; real sign-in acceptance remains open. K-012 remains In Progress in Kanban/CSV; implementation and test counts do not waive these gates.
