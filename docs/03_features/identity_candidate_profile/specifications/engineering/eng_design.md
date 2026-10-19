# Identity and Candidate Access — Engineering Specification

**Status:** Implementation authorized; tasks below require observed evidence.  
**Date:** 2026-10-20. **Kanban owner:** K-012.  
**Inputs:** [requirements](../../requirements/feature_req.md), [technical design](../technical/tech_design.md), [pseudocode](../../pseudo_code/logic_and_state.md).

## 1. Prerequisites and implementation limits

K-002 and K-005 are Done. Reuse the existing config validation, shared pool,
explicit migration runner, privacy-safe logs and isolated PostgreSQL test helper.
The foundation runbook records local verification; this planning session did not
rerun foundation acceptance. Under ADR-022, rely only on that verified local
K-028 baseline. External resource isolation/T034 and hosted CI/K-006 stay open.

Installed baseline: Node 24.22.0, npm 11.19.1, Next.js 16.4.2, TypeScript 6.0.3,
`pg` 8.23.1 and Vitest 5.0.5 as declared in `package.json`. Confirm actual runtime
versions before implementation. Clerk 7.9.17/backend 3.25.0, Playwright 1.64.1 and coverage-v8 5.0.5 are selected
and will be installed in Group 02 without upgrading the application stack.

Google plus email verification codes and Clerk's embedded prebuilt component
at `/sign-in` are selected. Validate the documented SDK/key strategy and verification/admission limits
before adapter implementation. Later ownership
integration uses the real session repository/application service from K-011.
K-012 does not wait for K-013/K-014 replay or HTTP endpoints. K-014/K-016 consume
completed identity/ownership services and own the later API/end-to-end evidence.
Test doubles cannot satisfy K-012's real persisted cross-user acceptance.

## 2. Ordered implementation slices

Each slice follows failing test → smallest change → relevant passing checks →
refactor. IDs below decompose K-012; they are not another status board.

| Slice | Deliverable and proposed paths                                                                                                                                                         | Evidence / requirements                                                                                                                                                                                                                                                                                                                                                    | Depends on                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| I-01  | Apply selected embedded presentation and Google/email-code methods; validate the selected SDK/key strategy and verification/admission limits; update design and `src/server/config.ts` | Config tests reject remote test mode and invalid settings; FR-02/06/09/10/11                                                                                                                                                                                                                                                                                               | Owner design review; K-002                   |
| I-02  | `src/modules/identity-profile/public.ts`, verification/admission ports, bounded admission policy and Clerk/test adapters                                                               | `tests/unit/identity-auth.test.ts`, `tests/unit/identity-admission.test.ts`: token matrix, limiter refill/cap/concurrency/outage, Retry-After, health exemption and no fallback; FR-02/06/09/11                                                                                                                                                                            | I-01                                         |
| I-03  | New ordered SQL migration in `migrations/`; mapping repository/application service in `identity-profile`                                                                               | `tests/integration/identity-mapping.test.ts`: empty DB, upgrade/no-op, concurrent first access, stable ID, disabled row, namespace isolation and DB outage; FR-03/09                                                                                                                                                                                                       | I-02; K-005                                  |
| I-04  | Ownership integration in `src/modules/interview-session/` using actual K-011 persistence                                                                                                       | `tests/integration/identity-ownership.test.ts`: Alice/Bob service reads/writes, indistinguishable missing/foreign result and unchanged protected records/events on denial; FR-04/05. Validate FR-07 request shape without implementing the session API                                                                                                                     | I-03; K-011 persistence only                 |
| I-05  | Sign-in route `src/app/sign-in/` with Clerk's prebuilt component, appearance integration and safe return/sign-out                                                                      | `tests/e2e/identity.spec.ts` (selected Playwright harness): embedded component rendering, Google redirects and email-code sign-in, invalid/expired code rejection, refresh/sign-out, absence of GitHub/password options, safe return and keyboard/error states; user-scoped UI fixtures test clearing/late responses without claiming real session-page coverage; FR-01/08 | I-03                                         |
| I-06  | Contract, privacy, admission, architecture and health regressions; update `docs/development.md`                                                                                        | Existing `tests/contract/identity-errors.test.ts` checks planned wire errors; future `tests/process/identity-privacy.test.ts` exercises identity service/process failures, allowed mapping effects and absent interview side effects; FR-08/09/10/11                                                                                                                       | I-04/I-05; no K-014 prerequisite             |
| I-07  | Review, convergence and bounded real Clerk smoke with authorized test accounts                                                                                                         | K-012 core acceptance below; record actual evidence, not completion from documents                                                                                                                                                                                                                                                                                         | I-06; provider access; K-006 hosted evidence |

US1 maps to I-01–03/I-05, US2 to I-04, US3 to I-02/I-06, US4 to I-01–02.
K-012 completes only after real identity mapping and persisted cross-user service
checks pass, plus sign-in UI, privacy/admission and live Clerk checks. K-011 is an
explicit acceptance dependency; its persistence/state work does not depend on
K-012. The ordered chain is K-005/K-010 → K-011 → K-012 → K-014 → K-016.
Identity adapter work may start before K-011, but does not establish completion.

Downstream obligations remain binding on their existing owners:

| Owner                                   | Evidence added after K-012                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| K-013                                   | Creation checks idempotency before insertion; atomic session/event/result commit; same-key payload conflict and concurrent duplicate protection |
| K-014/K-016                             | Actual HTTP and session-page Alice/Bob reads/writes, expiry, account switching, replay, context validation and unchanged state on auth failure  |
| Later history/submission/voice features | Owner-filtered lists, child/parent mismatch, safe replay and no downstream provider/job work on denial                                          |
| K-026                                   | Aggregate authentication admission across deployed replicas and operational thresholds                                                          |

These are downstream regression gates, not prerequisites for completing K-012.
No card is marked complete by planning. No session HTTP endpoint or full
interview orchestration is included. Group 04 implements only the documented
owning session persistence/guard prerequisite, with separate acceptance evidence.

## 3. Time and space complexity

Let `U` be mapped users, `S` sessions, `C` child records, `P` returned rows, `B`
token bytes and `L` live admission buckets. Assume bounded identifier lengths,
fixed signing algorithm/key size and B-tree indexes. Space below is application
working memory unless stated otherwise; database I/O and network latency are
separate costs. These are design estimates, not measured performance.

| Operation                                   | Time                             | Extra space                 | Explanation                                                                              |
| ------------------------------------------- | -------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| Parse and verify token using configured key | O(B) plus signature verification | O(B)                        | Work grows with token length; crypto cost depends on algorithm/key size                  |
| Look up mapped user                         | O(log U)                         | O(1)                        | Unique B-tree lookup returns one row                                                     |
| Insert first mapping / resolve conflict     | O(log U), excluding lock wait    | O(1)                        | Unique index prevents duplicates; contention still needs a timeout                       |
| Check session by ID and owner               | O(log S)                         | O(1)                        | Indexed ID fetch with owner predicate; no scan of a user's history                       |
| Resolve child and its owner                 | O(log C + log S)                 | O(1)                        | Indexed child lookup and parent ownership check                                          |
| Later owner-filtered history page           | O(log S + P)                     | O(P)                        | Requires owner + sort-key index and keyset pagination; deep OFFSET adds skipped-row work |
| Validate experience text                    | O(E)                             | O(E) including parsed input | `E` is capped at 2,000 characters by the existing contract                               |
| Store user mappings                         | O(U) durable storage             | —                           | Rows plus primary/unique indexes, with bounded fields                                    |

Admission uses average O(1) bucket lookup/refill and O(L) retained memory. Expiry
cleanup must be bounded per request; a full cleanup sweep is O(L), not O(1).

Bearer authentication plus mapping is O(B + log U), excluding cryptographic and
external lookup costs. Avoid calling Clerk's user-profile API per request and
avoid full table scans. Use `EXPLAIN (ANALYZE, BUFFERS)` on representative owned
test data for query shape; small tables may legitimately use a sequential scan.
Do not force an index or claim a latency SLO from Big O. Measure networkless
verification and mapping around the architecture's 100 simultaneous interviews;
final SLOs remain K-026 release work.

## 4. Verification plan

| Layer                | Required cases                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit                 | Token matrix; issuer/party/audience; test isolation; safe errors; disabled mode; redirect validation; optional context boundaries; admission refill/cap/concurrency/outage, Retry-After and pre-verification/per-identity rejection  |
| Integration          | Real PostgreSQL mapping races and rollback; disabled accounts; two-user service reads/writes; allowed mapping creation before resource denial; no protected-record changes; outage/recovery; no leaked connections                   |
| Contract             | Existing bearer scheme and `ApiError`; 401/403/429/503 on all protected operations; 404 owner hiding; Retry-After; strict context shape; public uncached health routes. Actual handlers are verified by their owning features        |
| Browser E2E          | Identity sign-in/refresh/sign-out, safe return and keyboard/focus/error states; UI fixture account-switch/late-response checks here; real private session-page behavior under K-014/K-016                                            |
| Privacy/architecture | Token/subject/context canaries absent from logs and builds; Clerk server SDK cannot reach client bundles; imports use `public.ts`                                                                                                    |
| Live provider        | Authorized Clerk instance: actual sign-in, token validation/refresh/expiry, wrong-origin rejection, sign-out/revocation window and stable mapping with two accounts; persisted owner service checks use the same internal identities |

Existing verification commands, to run after implementation:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run verify:architecture
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:process
npm run build
```

The E2E command must be added with the selected harness; it does not exist today.
Use the documented isolated test-database setup before integration tests. Ordinary
CI uses fixtures, never live credentials. Record commands, counts and unavailable
checks exactly. Run `$speckit-converge` after implementation and reconcile genuine
gaps with this design and the owning cards. Code review and real PostgreSQL
cross-user service tests are required for K-012 completion; fixture-only results
leave that acceptance open. Actual API/end-to-end acceptance stays with
K-014/K-016 and later consumers, without a reverse dependency on those cards.
For this contract-only reconciliation, run `npm run test:contract` and the explicit
four-document Prettier check (`--ignore-path /dev/null`); the default formatter
excludes canonical documents. Runtime authentication acceptance is still unbuilt.

## 5. Migration, failure handling and observability

Add an append-only migration for `users` and its constraints; never edit the
foundation migration. Runtime receives only required table privileges; migration
credentials remain separate. Test unique-conflict races, transaction rollback,
lock timeout and retry after recovery. No existing domain data needs backfill.
New session foreign keys arrive in the session feature.

Authentication admission runs before verification and per verified identity before
mapping. Its burst/refill/window, entry cap, trusted-source policy and per-process
budgets are pinned in technical §3 and validated in I-01. Unit tests cover refill/expiry, concurrent budget
consumption, cap rejection, unavailable admission (503), Retry-After and health
exemption. Expire only fully replenished buckets; never reset depleted budgets
by eviction. Local limits are not aggregate multi-replica acceptance.

Verification is networkless and input-bounded; there is no JWKS refresh work.
Check cancellation before/after verification. Reuse DB connect/statement limits,
stop database work on cancellation and release
connections. Invalid tokens get no retry loop. A transient failure may be retried
by the caller; mapping uniqueness makes that safe. Never retry interview commands
automatically outside their idempotency contract.

Track allowlisted auth outcomes, verification/mapping duration, verification
failure, admission rejection/cap/outage and mapping-conflict counts. Labels contain no user IDs, subjects or
tokens. Carry request IDs using foundation telemetry. Provider failure never
advances an interview or changes a candidate's score. Alert thresholds belong to
operational hardening.

## 6. Rollout and rollback

Start with isolated PostgreSQL and explicit test mode. Validate the real Clerk
adapter with authorized test accounts before making a provider-complete claim.
Deploy the additive schema before enabling identity code. Keep health probes
public and verify startup, HMR, shutdown and unavailable-dependency behavior.

Enable protected entry points only with configured Clerk and passed ownership
checks. If rollback is needed, disable private entry points or restore a compatible
application image; never enable test/anonymous fallback. Retain user mappings for
forward recovery. Do not drop identity rows after sessions reference them.

K-012 remains on the canonical Kanban until its acceptance passes. K-006 hosted
CI, T034/K-028 external evidence, K-026 operational gates and account-deletion
policy are not satisfied by these documents.

## 7. Authorized execution protocol

The owner authorized planning/reconciliation, task issues, implementation,
installation, bounded development-provider setup, tests, coverage and scoped group
commits. Task issues are a derived export, like the foundation's export. Kanban
remains authoritative. Latest user authorization takes precedence over earlier
draft-only and task-export restrictions for this feature.

Each group finishes with the numbered review task and commit task below. Review
uses the named installed stack skills, evidence-based engineering skills and an
independent reviewer; fix findings and re-review meaningful changes before commit.
Commit only that group's paths and required canonical updates; preserve unrelated
skill/workflow edits. Commit format: `<US=..., ID=Tnnn, K=..., GROUP=nn>` followed
by a conventional subject. No push/deployment is assumed from a local commit.

Coverage uses v8 over identity server/UI and supporting session code with all
files included. Require at least 90% lines/functions/statements and 85% branches
for the server identity slice, with uncovered failure paths assessed directly.
Do not inflate numbers with tests of mocks or exclusions of untested code. Browser
and real PostgreSQL checks supply integration evidence outside line coverage.
External access failures stay explicit unmet tasks, never synthetic passes.

## 8. Canonical execution tasks

Task IDs continue after foundation T048. Every group ends explicit review then commit. Kanban owns project status.

## Group 01 — Planning, analysis and issue export

**Map:** K-012. **Story:** shared. See canonical engineering §2/7 and technical specification.

- [x] T049 Freeze canonical identity plan/research, runtime/key/admission limits and dependency scope in `docs/03_features/identity_candidate_profile/` and owning session documents; FR-01–11/AC-01–10; run Spec Kit checklist/tasks/analyze and resolve material findings.
- [x] T050 Export deduplicated T049–T080 task issues to the origin repository only; mirror canonical IDs/dependencies and Kanban authority in issue bodies; record references in engineering design. Depends T049 and passing analysis.
- [x] T051 Review this group using `clerk`, `clerk-nextjs-patterns`, `mastering-typescript`, `supabase-postgres-best-practices`, `vitest`, `requesting-code-review` and `verification-before-completion`; inspect all planned contracts, prerequisites, task groups and checklists; resolve/re-review findings. Depends T050.
- [x] T052 Commit this reviewed group only: canonical identity/session planning, contract reconciliation/test, sequencing and Kanban/CSV. Message: `<US=shared, ID=T052, K=K-012, GROUP=01> docs(identity): approve execution plan and mirrored task issues`. Depends T051.

## Group 02 — Configuration and pinned dependencies

**Map:** K-012. **Story:** US1. See canonical engineering §2/7 and technical specification.

- [x] T053 [US1] Write/run failing config cases in `tests/unit/identity-config.test.ts` for Clerk required values/PEM/origins, disabled foundation compatibility, invalid settings and remote test rejection; FR-02/06/08/10.
- [x] T054 [US1] Implement validated runtime-only settings in `src/server/config.ts`, pin compatible Clerk/Playwright/coverage dependencies in package manifests, keep `.env.example` placeholders only; run focused config/type/build checks; update safe examples. Depends T053.
- [x] T055 [US1] Review this group using `mastering-typescript`, `clerk`, `clerk-nextjs-patterns`, `vitest` and `verification-before-completion`; independent review covers runtime/build secrecy, engine/peer compatibility and regression tests; fix/re-review findings. Depends T054.
- [x] T056 [US1] Commit this reviewed group with message `<US=US1, ID=T056, K=K-012, GROUP=02> feat(identity): validate Clerk runtime configuration and pin tooling`. Depends T055.

## Group 03 — Verification and bounded admission

**Map:** K-012. **Story:** US1. See canonical engineering §2/7 and technical specification.

- [x] T057 [US1] Write/run failing token/admission tests in `tests/unit/identity-auth.test.ts`, `tests/unit/identity-admission.test.ts`, `tests/helpers/identity-tokens.ts`; use actual ephemeral RSA signatures and SDK, not mocked crypto; FR-02/06/09/11.
- [x] T058 [US1] Implement `src/modules/identity-profile/{public.ts,application,adapters}` verification port, SDK public-key adapter, explicit local test adapter, safe result/error DTOs, redirect validation and bounded admission. Cover forged/expired/missing/wrong claims, caps/refill/concurrency and no network/fallback. Depends T054/T057.
- [x] T059 [US1] Review this group using `clerk`, `clerk-nextjs-patterns`, `mastering-typescript`, `vitest`, `requesting-code-review` and `verification-before-completion`; inspect claim/security/privacy/resource bounds; fix/re-review. Depends T058.
- [x] T060 [US1] Commit this reviewed group with message `<US=US1, ID=T060, K=K-012, GROUP=03> feat(identity): verify session tokens with bounded admission`. Depends T059.

## Group 04 — Real PostgreSQL identity and ownership prerequisite

**Map:** K-012|K-010|K-011. **Story:** US2. See canonical engineering §2/7 and technical specification.

- [x] T061 [US2] Write/run failing real database mapping/ownership tests in `tests/integration/identity-storage.test.ts` using canonical migrations and owned database helper; races, disabled users, namespace isolation, owner reads/writes, atomicity/version conflicts and outage; FR-03–05/07/09.
- [x] T062 [US2] Add users migration and mapping repository under `migrations/` and `src/modules/identity-profile/persistence/`; wire mapping after verified admission through application services with safe failures. Reuse bounded shared pool. Depends T061/T058.
- [x] T063 [US2] Deliver the documented minimum session-module persistence/guard prerequisite under `src/modules/interview-session/` and explicit migration; verify ownership with actual persisted snapshot/event records, immutability and atomic guarded writes. No catalogue/session HTTP endpoints or fake tables. Keep K-010/K-011 full acceptance honest. Depends T062; follow owning prerequisite docs.
- [x] T064 [US2] Review this group using `supabase-postgres-best-practices`, `mastering-typescript`, `vitest`, `requesting-code-review` and `verification-before-completion`; inspect SQL/indexes/FKs/pool ownership/transaction/denial behavior and test cleanup; fix/re-review. Depends T063.
- [ ] T065 [US2] Commit this reviewed group with message `<US=US2, ID=T065, K=K-012|K-010|K-011, GROUP=04> feat(identity): persist stable users and verify owned session storage`. Depends T064.

## Group 05 — Embedded sign-in and browser behavior

**Map:** K-012. **Story:** US1. See canonical engineering §2/7 and technical specification.

- [ ] T066 [US1] Write/run failing page/browser cases in `tests/e2e/identity.spec.ts` and Playwright harness for embedded sign-in entry, disabled availability, safe local returns, keyboard/error states and health/public boundary; inspect retained preview; FR-01/08/10.
- [ ] T067 [US1] Implement browser-safe `src/modules/identity-ui/public.ts`/adapters, `src/app/sign-in/[[...sign-in]]/page.tsx`, minimal identity entry/layout and `src/proxy.ts` plumbing; honor runtime keys, selected Google/email OTP only, safe redirects, no secret client imports. Keep domain bearer auth separate. Depends T066/T062.
- [ ] T068 [US1] Run actual custom-server browser acceptance and runtime introspection; test account clearing/late-response protection in user-scoped UI, actual disabled modes, no console secret leakage and production build without keys; real Clerk cases remain Group07. Depends T067.
- [ ] T069 [US1] Review this group using `clerk-nextjs-patterns`, `clerk-testing`, `vercel-react-best-practices`, `frontend-design`, `next-dev-loop` when prerequisites available, `vitest` and `verification-before-completion`; independent review of wireframe/accessibility/client-server/SDK lifecycle; fix/re-review. Depends T068.
- [ ] T070 [US1] Commit this reviewed group with message `<US=US1, ID=T070, K=K-012, GROUP=05> feat(identity): add embedded Google and email-code sign-in`. Depends T069.

## Group 06 — Integration, privacy and coverage

**Map:** K-012. **Story:** US3. See canonical engineering §2/7 and technical specification.

- [ ] T071 [US3] Write/run failing process/privacy/lifecycle cases in `tests/process/identity-privacy.test.ts` for source context, stable request IDs, canonical safe auth errors, allowed mapping bookkeeping and absent private downstream side effects; FR-05/08–11.
- [ ] T072 [US3] Complete runtime/public application-service integration in `src/server/`, identity module and contract tests; preserve shared lifecycle/health/HMR, no provider failure fallback and uncached protected replies. Depends T071/T063/T068.
- [ ] T073 [US3] Add `coverage:identity` and explicit all-files v8 scope/thresholds, run focused + full relevant unit/integration/contract/process/browser/build/security checks, inspect uncovered branches and add meaningful missing cases; record commands/results in `docs/runbooks/identity.md`; FR-01–11. Depends T072.
- [ ] T074 [US3] Review this group using `mastering-typescript`, `vitest`, `clerk-testing`, `vercel-react-best-practices`, `requesting-code-review` and `verification-before-completion`; inspect privacy, coverage honesty, regressions and CI changes; fix/re-review. Depends T073.
- [ ] T075 [US3] Commit this reviewed group with message `<US=US3, ID=T075, K=K-012, GROUP=06> test(identity): verify privacy integration and coverage gates`. Depends T074.

## Group 07 — Real provider acceptance and convergence

**Map:** K-012. **Story:** shared. See canonical engineering §2/7 and technical specification.

- [ ] T076 Set up/verify one authorized isolated Clerk development instance through secret-safe CLI/runtime handling; configure Google/email OTP only and run bounded real sign-in/token/mapping smoke. Use disposable scaffold for accountless init; preserve existing envs; never print values. Record unavailable Google/provider controls honestly in `docs/runbooks/identity.md`. Depends T075.
- [ ] T077 Run final actual provider/browser/storage/coverage checks; verify all ACs and K-010/K-011 readiness, run `$speckit-converge`, reconcile generated gaps into canonical engineering/Kanban/CSV and iterate implementation for actionable gaps; no fixture substitution. Depends T076.
- [ ] T078 Export any deduplicated convergence tasks with canonical mappings; finalize developer/recovery runbook and issue reference links, record real passed/failed/unavailable evidence and leave unmet acceptance explicit; synchronize canonical task execution marks from evidence. Depends T077.
- [ ] T079 Review this final group using all applicable Clerk/Next/React/TypeScript/PostgreSQL/testing stack skills plus `requesting-code-review` and `verification-before-completion`; resolve all blocking actionable findings and re-review. Depends T078.
- [ ] T080 Commit this reviewed group with message `<US=shared, ID=T080, K=K-012, GROUP=07> docs(identity): reconcile provider acceptance and verified handoff`. Depends T079.

## Dependencies and verification

Groups 01 → 02 → 03 → 04 → 05 → 06 → 07; task-specific prerequisites apply. No parallel marker overrides a dependency. SDK research and independent reviews may run separately; mutations/commits remain sequential.

Independent acceptance: US1 proves identity cryptography/mapping and selected sign-in; US2 proves actual persisted isolation; US3 proves expiry/outage/privacy; US4 restrictions are included in config/verifier groups. Full provider, prerequisite and hosted/cloud gates stay explicit.

Commands use pinned Node24 PATH. Targeted red/green tests first; then npm run lint/typecheck/test:unit/test:integration/test:contract/test:process/verify:architecture/build, browser and coverage scripts, scanners/container/full suite where applicable. No live credentials in ordinary CI.

## 9. Derived issue references

Issues mirror these task IDs; Kanban remains the status authority.

| Task | Issue                                                        |
| ---- | ------------------------------------------------------------ |
| T049 | [#51](https://github.com/Gyan172004/my-new-system/issues/51) |
| T050 | [#52](https://github.com/Gyan172004/my-new-system/issues/52) |
| T051 | [#53](https://github.com/Gyan172004/my-new-system/issues/53) |
| T052 | [#54](https://github.com/Gyan172004/my-new-system/issues/54) |
| T053 | [#55](https://github.com/Gyan172004/my-new-system/issues/55) |
| T054 | [#56](https://github.com/Gyan172004/my-new-system/issues/56) |
| T055 | [#57](https://github.com/Gyan172004/my-new-system/issues/57) |
| T056 | [#58](https://github.com/Gyan172004/my-new-system/issues/58) |
| T057 | [#59](https://github.com/Gyan172004/my-new-system/issues/59) |
| T058 | [#60](https://github.com/Gyan172004/my-new-system/issues/60) |
| T059 | [#61](https://github.com/Gyan172004/my-new-system/issues/61) |
| T060 | [#62](https://github.com/Gyan172004/my-new-system/issues/62) |
| T061 | [#63](https://github.com/Gyan172004/my-new-system/issues/63) |
| T062 | [#64](https://github.com/Gyan172004/my-new-system/issues/64) |
| T063 | [#65](https://github.com/Gyan172004/my-new-system/issues/65) |
| T064 | [#66](https://github.com/Gyan172004/my-new-system/issues/66) |
| T065 | [#67](https://github.com/Gyan172004/my-new-system/issues/67) |
| T066 | [#68](https://github.com/Gyan172004/my-new-system/issues/68) |
| T067 | [#69](https://github.com/Gyan172004/my-new-system/issues/69) |
| T068 | [#70](https://github.com/Gyan172004/my-new-system/issues/70) |
| T069 | [#71](https://github.com/Gyan172004/my-new-system/issues/71) |
| T070 | [#72](https://github.com/Gyan172004/my-new-system/issues/72) |
| T071 | [#73](https://github.com/Gyan172004/my-new-system/issues/73) |
| T072 | [#74](https://github.com/Gyan172004/my-new-system/issues/74) |
| T073 | [#75](https://github.com/Gyan172004/my-new-system/issues/75) |
| T074 | [#76](https://github.com/Gyan172004/my-new-system/issues/76) |
| T075 | [#77](https://github.com/Gyan172004/my-new-system/issues/77) |
| T076 | [#78](https://github.com/Gyan172004/my-new-system/issues/78) |
| T077 | [#79](https://github.com/Gyan172004/my-new-system/issues/79) |
| T078 | [#80](https://github.com/Gyan172004/my-new-system/issues/80) |
| T079 | [#81](https://github.com/Gyan172004/my-new-system/issues/81) |
| T080 | [#82](https://github.com/Gyan172004/my-new-system/issues/82) |
