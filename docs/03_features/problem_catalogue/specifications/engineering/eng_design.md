# Problem Catalogue and Immutable Problem Packs — Engineering Design

**Status:** Owner-approved implementation plan; implementation authorized on 2026-10-23. Tests and acceptance remain pending.  
**Feature:** 3. **Kanban:** K-007–K-009. **Date:** 2026-10-22.
**Reconciled:** 2026-10-23; owner-accepted audit recommendations and ADR-023.  
**Inputs:** [requirements](../../requirements/feature_req.md),
[technical design](../technical/tech_design.md),
[pseudocode](../../pseudo_code/logic_and_state.md).

## 1. How to build it

Build small, verifiable slices. For each production behavior: write/identify the
test, run it and observe the intended failure, implement the smallest change,
run the relevant tests, then refactor. The owner authorized implementation;
complete the Spec Kit checklist, task review and consistency gates before code.
Real seed publication still requires the independent human approval below.

Use the existing lockfile/toolchain: Node 24.22.0, npm 11.19.1, TypeScript,
Next.js, Zod, `pg`, explicit SQL migrations, Vitest and existing contract tools.
Read [development instructions](../../../../development.md) before running the
application. Do not upgrade dependencies to satisfy a skill example.

Proposed source layout:

```text
src/modules/content-publishing/
  public.ts
  domain/pack-schema.ts, validate-pack.ts, checksum.ts
  application/operators.ts, review.ts, publish.ts, withdraw.ts
  persistence/reviews.ts, publications.ts
src/modules/problem-catalogue/
  public.ts
  application/read.ts, resolve.ts, projections.ts
  persistence/releases.ts, test-suites.ts
src/app/api/v1/problems/route.ts
src/app/api/v1/problems/[problemId]/route.ts
content/problem-packs/two-sum/       # authored input; never under public/
scripts/content-pack.ts             # proposed operator command, not present yet
src/server/transaction.ts           # proposed shared opaque transaction scope
src/modules/interview-session/      # adapt existing internal service/repository to join scope
migrations/<new_timestamp>_problem_catalogue.sql
tests/unit/problem-catalogue/
tests/integration/problem-catalogue/
tests/contract/problem-catalogue.test.ts
tests/contract/problem-publication-event.test.ts
```

ADR-023 selects the command adapter's authorization: verify an active operator
using the existing identity service, then check internal-user-ID grants in
reviewed server configuration. Plan `CONTENT_STAFF_GRANTS_JSON` (default `[]`)
and `CONTENT_STAFF_CONFIG_REVISION` (required when grants are nonempty; empty
grants use revision `disabled-v1` and an empty-set digest) in the existing config owner; no actual grants/credentials are introduced here. The
strict grants array contains only `{userId, permissions[]}` records. Parse into
an immutable lookup, reject duplicate IDs/unknown permissions and record its
revision/digest with operations. Changes require replacement/restart.
The command reads an ephemeral credential from stdin; no credential-valued CLI
argument, log or committed file. It may validate an unsigned local draft, but
may not accept a claimed identity/role or `approved=true` flag as publication
permission. Keep reusable
validation in the content-publishing owner; catalogue storage is installed
through its narrow public interface within the same transaction scope.

## 2. Dependency readiness

K-002 and K-005 have foundation acceptance. K-012 has development acceptance and
supplies candidate authentication. K-007 starts from K-002; K-008 follows K-007;
K-009 acceptance needs K-005/K-007/K-008. Synthetic packs can exercise storage
before the real seed is approved, but they do not complete K-008/K-009.
P-11 uses the minimal session snapshot/event storage already delivered for
K-012's persisted ownership acceptance; it does not declare full K-010/K-011
complete. It adapts that existing internal seam now so K-009 does not depend
backwards on its K-014 consumer.

Under ADR-022, rely only on K-028's verified local configuration/privacy/isolation
portion described in the [foundation runbook](../../../../runbooks/foundation.md).
T034/K-028 real environment acceptance remains deferred; K-026 owns deployment,
capacity, recovery and release evidence. This feature needs no paid provider.

## 3. Ordered work and acceptance mapping

These are execution steps under existing Kanban cards, not another task-status
board. None is marked complete by writing this document.

| Step | Owner / requirements  | Deliverable and failing-test target                                                                                                                                                                                                                                                                                                                                                                     | Depends on                                                                        |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P-01 | K-007; FR-01/02       | Define the selected version-1 strict pack schema/profile/registries in `domain/pack-schema.ts` and `tests/unit/problem-catalogue/schema.test.ts`; reject missing/unknown fields, schema/size/depth violations, wrong rule/checker/profile IDs and unsupported executable variants                                                                                                                       | Design review                                                                     |
| P-02 | K-007; FR-02/08/09    | Implement `domain/validate-pack.ts`; test all ID namespaces, plural mistake approach/test references, provenance references, separate 10,000-element test-data bounds, public-example linkage and exact raw numeric-token checks in `validation.test.ts`; import executes/fetches nothing                                                                                                               | P-01                                                                              |
| P-03 | K-007; FR-03/04       | Implement `domain/checksum.ts` using pack-json-v1; test UTF-16 key ordering, array order, duplicate-key/Unicode/NUL rejection, safe integer bounds and fraction/exponent/negative-zero rejection in `checksum.test.ts`                                                                                                                                                                                  | P-02                                                                              |
| P-04 | K-008; FR-03/12       | Author `content/problem-packs/two-sum/`; record research coverage, source use, approaches/mistakes/hints/tests and draft follow-ups; add fixture validation in `seed.test.ts`                                                                                                                                                                                                                           | P-01–03                                                                           |
| P-05 | K-008; FR-03/12       | Obtain independent human correctness/rights/test review for the exact seed; record evidence in that content directory without credentials                                                                                                                                                                                                                                                               | P-04; named roles                                                                 |
| P-06 | K-009; FR-04/07/10    | Add `src/server/transaction.ts` over existing `withClient`, new migration and catalogue repositories; test domain-code preservation after rollback, infrastructure/rollback failure mapping, same connection, expired/foreign scopes, migration/FKs, full JSONB checksum round trip and SQL immutability including late INSERT/unsealed commit in `tests/integration/problem-catalogue/storage.test.ts` | P-01–03; K-005                                                                    |
| P-07 | K-009; FR-03/04/11    | Implement `application/operators.ts`, review/publish services and command/config adapters; `publication.test.ts` and `operator-permissions.test.ts` cover verified identity, default-deny/config revision, unknown/duplicate grants, self/stale/unprivileged review, revoked reviewer before new publication, exact retry and durable canonical event evidence                                          | P-06 for synthetic code/tests; P-05 and named allowlist assignments for real seed |
| P-08 | K-009; FR-04/07/10    | Implement withdrawal/exact retry and locking in publishing/catalogue services; `concurrency.test.ts` covers duplicate/conflicting publishers, cancellation and old pins                                                                                                                                                                                                                                 | P-07                                                                              |
| P-09 | K-009; FR-05/06/08    | Implement `application/projections.ts`, `read.ts`, `resolve.ts`; `reads.test.ts` proves deterministic pages, exact versions and absence of private canaries                                                                                                                                                                                                                                             | P-06; real-seed acceptance P-05/07                                                |
| P-10 | K-009; FR-05/06/10    | Implement both problem routes against canonical 400/auth/detail contracts; `tests/contract/problem-catalogue.test.ts` verifies actual input/error/projection behavior. Existing `tests/contract/identity-errors.test.ts` guards the new 400 declaration; endpoint behavior remains unbuilt until this step                                                                                              | P-09; K-012                                                                       |
| P-11 | K-009; FR-07/08/10/11 | Adapt existing `src/modules/interview-session/application/service.ts` and owning repository to shared scope; test actual internal createPublishedSession, real snapshot/event pins, rollback and publication/withdrawal races in `tests/integration/problem-catalogue/pinning.test.ts`; preserve identity fixtures, add publication-envelope/privacy/architecture regressions                           | P-06–10                                                                           |
| P-12 | K-007–09; FR-01–12    | Document operator/recovery commands in `docs/runbooks/problem-catalogue.md`; run relevant verification/review/convergence and reconcile these four docs plus Kanban/CSV only when evidence qualifies                                                                                                                                                                                                    | P-01–11                                                                           |

Journey mapping: US1 → P-01–04; US2 → P-05–08; US3 → P-09/10; US4 →
P-08/09/11. P-12 reviews all acceptance criteria. P-06 storage fixtures and
P-04 content preparation may proceed independently after schema stability;
the owner has authorized orchestration, with task dependencies and reviews preserved.

## 3.1 Detailed execution groups and review/commit gates

#### Execution rules

Each production slice records RED output before implementation, then GREEN evidence and refactoring. Root owns all Git operations. Every group ends in a dedicated relevant-stack review agent, verified feedback/fix loop and commit; review must pass before dependent groups proceed. Read installed skill sources before use. No package upgrades or paid/cloud setup. Never stage unrelated existing skill/setup changes. New SQL filename uses the next unique forward timestamp under `migrations/`; applied SQL remains unchanged. All strict field/nullable/enum rules in technical §2 and schema constraints in §3 are binding, not implementation choices.

Issue mirrors requested by the owner derive from these tasks, retain canonical K IDs, and never become a separate authority. Missing GitHub access blocks external mirrors/push/PR only. Missing genuine human review blocks real seed publication/full K-008–09 acceptance only; it does not block synthetic fixture code/testing.

#### Group 00: Planning and consistency gate

**Traceability:** K-007|K-008|K-009; P-01–P-12; FR-01–12; SC-01–06.  
**Dependencies / independent acceptance:** No production code before T091; root owns branch and commits.

- [x] T087 Reconcile specify, clarify, plan and checklist outcomes with the four canonical documents in docs/03_features/problem_catalogue/; preserve ADR-023 and canonical API/event authority.
- [x] T088 Review all 23 requirements-quality items in .specify/work/problem_catalogue/checklists/implementation-readiness.md against canonical requirements/design; checked items mean planning quality only.
- [x] T089 Run $speckit-analyze across .specify/work/problem_catalogue/{spec.md,plan.md,tasks.md}; reconcile findings in docs/03_features/problem_catalogue/specifications/engineering/eng_design.md and loop tasks/analyze until zero unresolved blocking contradictions.
- [x] T090 Run $speckit-taskstoissues after analysis: create derived linked GitHub issue mirrors with T IDs, K IDs, dependencies and acceptance evidence; record issue links in docs/03_features/problem_catalogue/specifications/engineering/eng_design.md; Kanban/CSV remain authoritative.
- [x] T091 Dedicated review agent verifies planning, task coverage/dependencies and installed TypeScript/PostgreSQL/Vitest skill alignment; fix/review loop, verify scoped diff, then root commits approved planning files only using the group commit title below in docs/03_features/problem_catalogue/specifications/engineering/eng_design.md.

**Commit title:** `<US=shared, ID=T091, K=K-007|K-008|K-009, GROUP=00> docs(catalogue): record reviewed implementation tasks`

#### Group 01: US1 — Prepare bounded reusable content

**Traceability:** K-007|K-008; P-01–04; FR-01/02/03/08/09/12; SC-01/02.  
**Dependencies / independent acceptance:** Depends on T091. Independent acceptance: valid second problem fixture validates; invalid input returns bounded errors without execution or publication.

- [x] T092 [US1] RED: add tests/unit/problem-catalogue/schema.test.ts for exact nested field profiles/required fields in technical §2, closed categories/rules/checker/input profile, publication UUID author, pending draft markers, reasoned empty sections and reasoning-only variants; observe intended failures.
- [x] T093 [US1] Implement src/modules/content-publishing/domain/pack-schema.ts and public.ts using existing Zod; enforce "2 MiB UTF-8 per complete content bundle", "32 KiB per prose field", "128 KiB per individual test input/output JSON value", "1,000 test cases", "2,000 entries per content-entry collection", "nesting depth 32", "256 UTF-8 bytes" IDs/version and "256 KiB" candidate detail; run schema tests GREEN.
- [x] T094 [US1] RED: add tests/unit/problem-catalogue/validation.test.ts and checksum.test.ts for every ID/reference namespace (including plural approachIds/testCaseIds/sourceReferences), contiguous hints, examples/visibility, unique pair, nums "2–10,000", token/Unicode/key checks, checksum vectors and max "100 field paths with a truncation flag"; observe failures.
- [x] T095 [US1] Implement src/modules/content-publishing/domain/validate-pack.ts and checksum.ts: bounded raw-token scan before parse, pack-json-v1 safe lexical integers (no fraction/exponent/-0), duplicate keys/NUL/unpaired-surrogate rejection, UTF-16 key sort, no Unicode normalization, full content digest and separate embedded-data limits; run relevant unit tests GREEN.
- [x] T096 [US1] Add tests/unit/problem-catalogue/seed.test.ts and fixtures under tests/fixtures/problem-catalogue/ for the preserved owner draft and a second differently identified synthetic pack; validate original source hashes, corrected complexity/references, pending gates and no execution/fetch/path dereference; adapt content/problem-packs/two-sum/ only where canonical validation requires, never invent review.
- [x] T097 [US1] Dedicated review agent uses mastering-typescript, vitest, requesting-code-review and verification-before-completion to review schema/security/complexity/TDD evidence; root resolves findings with receiving-code-review and reruns focused tests; reconcile docs/03_features/problem_catalogue/ on accepted changes.
- [x] T098 [US1] Root verifies scoped diff and focused checks, then commits group 01 using the exact title below; include only schema/validator/checksum/fixture/content and reconciled docs paths in docs/03_features/problem_catalogue/specifications/engineering/eng_design.md.

**Commit title:** `<US=US1, ID=T098, K=K-007|K-008, GROUP=01> feat(catalogue): validate canonical problem packs`

#### Group 02: Shared transaction and sealed persistence prerequisites

**Traceability:** K-007|K-009; P-06; FR-04/07/10/11; SC-02/04/06.  
**Dependencies / independent acceptance:** Depends on T098. No requirement for actual human seed approval. Independent acceptance: real PostgreSQL rejects incomplete/mutable releases; transaction adapter preserves domain errors and rolls back safely.

- [x] T099 RED: add tests/unit/problem-catalogue/transaction.test.ts and tests/integration/problem-catalogue/storage.test.ts using real isolated PostgreSQL: known-domain rollback, unknown/driver/cancel/rollback failure sanitization, same connection, foreign/expired/completed scope rejection and no leaked clients; observe failures.
- [x] T100 Implement src/server/transaction.ts over existing src/server/database.ts with opaque scopes, owning-repository-only unwrap and tagged known-domain outcomes returned through withClient; bounded deadlines and failed rollback destroy connection; run transaction tests GREEN.
- [x] T101 RED: extend tests/integration/problem-catalogue/storage.test.ts for empty/identity-populated migrations, FKs/indexes, duplicate version/slug, full JSONB checksum reconstruction, initial sealed rejection, only sealing transition, missing/late/changed/deleted cases, deferred unsealed commit, wrong-problem current pointer and immutable audit/publication evidence; observe failures.
- [x] T102 Add migrations/<new_timestamp>_problem_catalogue.sql for seven canonical tables, indexed FKs, immutable release/case triggers and deferred completeness guard; preserve applied SQL and arbitrary identity fixture pins; implement owning repositories in src/modules/problem-catalogue/persistence/{releases.ts,test-suites.ts} plus narrow public.ts; run real PostgreSQL storage tests GREEN.
- [x] T103 Dedicated review agent applies supabase-postgres-best-practices, mastering-typescript and requesting-code-review to constraints, migration compatibility, SQL parameterization, lock order, transaction outcomes and cancellation; root fixes/reviews until clean and reruns affected tests; record evidence in docs/03_features/problem_catalogue/specifications/engineering/eng_design.md.
- [x] T104 Root verifies focused real-database/architecture checks and scoped diff, then commits group 02 using the title below; update docs/03_features/problem_catalogue/specifications/engineering/eng_design.md with observed results.

**Commit title:** `<US=shared, ID=T104, K=K-007|K-009, GROUP=02> feat(catalogue): persist sealed releases atomically`

#### Group 03: US2 — Review, publish and withdraw reviewed content

**Traceability:** K-008|K-009; P-05/07/08; FR-03/04/07/10/11/12; SC-01/02/04/06.  
**Dependencies / independent acceptance:** Depends on T104. Code/test fixtures proceed independently of external seed approval T132. Independent acceptance: authorized synthetic publication is atomic, repeatable, auditable and withdrawal preserves historical releases.

- [x] T105 [US2] RED: add tests/unit/problem-catalogue/operator-permissions.test.ts and tests/integration/problem-catalogue/publication.test.ts for verified existing identity, no claimed operator, default deny, malformed/duplicate/unknown grants, revision/digest/restart snapshot, independent exact-checksum review, rights/case/followup approval and revoked reviewer behavior; add tests/unit/problem-catalogue/author-verification.test.ts and tests/integration/problem-catalogue/author-verification.test.ts for identity-owned lookupActiveUser UUID validation, active mapped-user proof, unknown/disabled denial, no user creation/PII leakage and optional opaque same-database transaction joining; observe failures.
- [x] T106 [US2] Implement src/modules/content-publishing/application/{operators.ts,review.ts} and persistence/reviews.ts plus src/server/config.ts owner changes: CONTENT_STAFF_GRANTS_JSON defaults [] with exactly {userId,permissions[]}; nonempty requires CONTENT_STAFF_CONFIG_REVISION; empty uses disabled-v1 and empty-set digest; allow only review_content/publish_content/withdraw_content; add server-only lookupActiveUser(userId, transaction?, signal) in src/modules/identity-profile/application/service.ts, public.ts and owning persistence/users.ts, returning only immutable {userId} for an active existing verified mapping, rejecting absent/disabled author proof without trusting claimed IDs or cross-module private imports; bind distinct reviewer/author proof in review.ts; run tests GREEN.
- [x] T107 [US2] RED: extend tests/integration/problem-catalogue/publication.test.ts and concurrency.test.ts plus tests/contract/problem-publication-event.test.ts for rollback/no partial selection, exact-retry original receipt after withdrawal/reviewer removal, conflicting checksums, duplicate/conflicting publishers, safe audit fields and canonical durable publication envelope separate from session_events; observe failures.
- [x] T108 [US2] Implement src/modules/content-publishing/application/{publish.ts,withdraw.ts} and persistence/publications.ts with common problem→availability lock order, complete sealing and canonical event in one transaction; exact retries require current publisher authority without reselect/re-enable; withdrawal clears current without fallback; run publication/concurrency/contract tests GREEN.
- [x] T109 [US2] RED: add tests/unit/problem-catalogue/command.test.ts for scripts/content-pack.ts bounded file/stdin behavior, offline unsigned draft validation, ephemeral credential on stdin only, no identity/approval flags or imported code execution, safe errors/cancellation and no credential/content logs; observe failures.
- [x] T110 [US2] Implement scripts/content-pack.ts with validate/review/publish/withdraw adapters over narrow public services; add only required package.json scripts without dependency upgrades; document safe invocation and uncertain-commit exact retry in docs/runbooks/problem-catalogue.md; run command tests GREEN.
- [x] T111 [US2] Dedicated review agent applies mastering-typescript, vitest, supabase-postgres-best-practices and security/identity boundaries in requesting-code-review; root verifies feedback, fixes/reviews and reruns publication/operator/concurrency/command/contract checks; reconcile docs/03_features/problem_catalogue/.
- [x] T112 [US2] Root verifies scoped diff and tests then commits group 03 with the title below; real seed stays unpublished without T132 and K-008/K-009 remain gated in project_management/kanban_board.md.

**Commit title:** `<US=US2, ID=T112, K=K-008|K-009, GROUP=03> feat(catalogue): authorize reviewed publication and withdrawal`

#### Group 04: US3 — Authenticated safe catalogue discovery

**Traceability:** K-009; P-09/10; FR-05/06/08/09/10/11; SC-03/05.  
**Dependencies / independent acceptance:** Depends on T104 and T112 integration; pure projection tests may run alongside group 03 after schema/storage stability. Independent acceptance: actual authenticated HTTP returns bounded candidate-only current data and canonical failures.

- [x] T113 [P] [US3] RED: add tests/unit/problem-catalogue/projections.test.ts and tests/integration/problem-catalogue/reads.test.ts for exact candidate allowlist, private canaries, same-release metadata, empty listing, unavailable detail, exact withdrawn-version reads, stable ID pages, sparse eligibility and current-pointer updates; observe failures, then capture real PostgreSQL EXPLAIN evidence with sparse/inactive catalogue fixtures to verify indexed pagination and document inspected-row costs without an unsupported O(L) claim.
- [x] T114 [US3] Implement src/modules/problem-catalogue/application/{projections.ts,read.ts,resolve.ts} and narrow public DTOs; no generic conversational full-pack getter, no source fetch/execution, cursor bounded/versioned/last-ID only, "1–100, default 20", limit+1 and no snapshot promise across membership changes; run read/projection tests GREEN.
- [x] T115 [US3] RED: add tests/contract/problem-catalogue.test.ts and actual HTTP tests/integration/problem-catalogue/http.test.ts for list/detail schemas, malformed cursor/limit/ID 400, 401/403/429 Retry-After/503/404, storage failure distinct from empty and private-field/log canaries; preserve tests/contract/identity-errors.test.ts coverage; observe failures.
- [x] T116 [US3] Implement src/app/api/v1/problems/route.ts and src/app/api/v1/problems/[problemId]/route.ts using existing identity, lifecycle/cancellation and safe error/telemetry adapters; reconcile contracts/api/v1_openapi.yaml only where approved canonical changes require; run HTTP/contract tests GREEN against running application.
- [x] T117 [US3] Dedicated review agent applies mastering-typescript, vitest and relevant Next.js runtime skill prerequisites to actual route/runtime/security evidence; root fixes/reviews, reruns actual HTTP, contracts and architecture checks; record evidence in docs/03_features/problem_catalogue/specifications/engineering/eng_design.md.
- [x] T118 [US3] Root verifies scoped diff then commits group 04 using the title below; no new UI or session HTTP route is introduced in src/app/api/v1/problems/.

**Commit title:** `<US=US3, ID=T118, K=K-009, GROUP=04> feat(catalogue): serve authenticated candidate catalogue`

#### Group 05: US4 — Atomic session pin and historical reproducibility

**Traceability:** K-009; P-08/09/11; FR-04/07/08/10/11; SC-03/04/06.  
**Dependencies / independent acceptance:** Depends on T112 and T118. Independent acceptance: real session snapshot and created event select one eligible release atomically under publish/withdraw races; old pins remain exact.

- [x] T119 [US4] RED: add tests/integration/problem-catalogue/pinning.test.ts with real identity user/session/event storage for createPublishedSession verified caller+problemId only, same transaction, rollback between resolve/snapshot/event, cancellation and expired/foreign scope; observe failures.
- [x] T120 [US4] Adapt src/modules/interview-session/application/service.ts, public.ts and persistence/sessions.ts to createPublishedSession via opaque shared transaction and catalogue public resolver; retain owning validation and existing fixture-only createPinned behavior without new pack FK/backfill; run real session tests GREEN.
- [x] T121 [US4] RED: extend tests/integration/problem-catalogue/{pinning.test.ts,concurrency.test.ts} for publication/withdrawal/new-pin common lock races, no fallback when current withdrawn, original A after publish B, exact retries after uncertain responses, owner checks and missing/corrupt pin safe failures; observe failures.
- [x] T122 [US4] Implement necessary lock/pinned-read behavior in src/modules/problem-catalogue/application/resolve.ts and src/modules/interview-session/application/service.ts; verify actual persisted snapshot/event invariants and existing identity integration/architecture regressions GREEN.
- [x] T123 [US4] Dedicated review agent applies mastering-typescript, supabase-postgres-best-practices, vitest and requesting-code-review to same-connection atomicity, deadlock order, cancellation, privacy/ownership and compatibility; root fixes/reviews and reruns relevant real-PostgreSQL race/regression checks; reconcile docs/03_features/problem_catalogue/.
- [x] T124 [US4] Root verifies scoped diff then commits group 05 using the title below; docs/03_features/problem_catalogue/specifications/engineering/eng_design.md explicitly retains later K-013/K-014 HTTP/idempotency and K-016 journey ownership.

**Commit title:** `<US=US4, ID=T124, K=K-009, GROUP=05> feat(catalogue): pin published content with session creation`

#### Group 06: Coverage, acceptance, convergence and PR handoff

**Traceability:** K-007|K-008|K-009; P-12; FR-01–12; SC-01–06.  
**Dependencies / independent acceptance:** Depends on T124 for code acceptance; T132 separately gates real seed and full K-008/K-009 completion. Independent acceptance: fresh observed evidence, reviewed gap-free implementation and honest release limits.

- [ ] T125 Add vitest.catalogue.config.ts and package.json feature coverage script covering all new production modules, shared transaction, touched HTTP/command adapters and relevant session changes; require >=90% statements/lines/functions and >=85% branches unless existing stricter gates apply; do not exclude difficult behavior or count fixtures as production. Wire the catalogue coverage command into scripts/verify-ci.ts and prove its failure propagates with the existing CI negative-control tests.
- [ ] T126 Run pinned-runtime npm run format:check, lint, typecheck, check:architecture, test:architecture, test:unit, APP_ENV=test npm run test:integration, test:contract, npm test, npm run build and feature coverage; execute actual authenticated HTTP acceptance and applicable lifecycle/readiness/privacy regressions; record exact commands/results/failures/skips in docs/03_features/problem_catalogue/specifications/engineering/eng_design.md.
- [ ] T127 Run installed $speckit-converge against .specify/work/problem_catalogue/; reconcile actual gaps into docs/03_features/problem_catalogue/specifications/engineering/eng_design.md as new unique T tasks with K mappings; iterate implementation/TDD/review/coverage/analyze/converge until no unresolved code acceptance gaps.
- [ ] T128 Reconcile all four docs in docs/03_features/problem_catalogue/, ADR register and canonical contracts where accepted design changed; finish docs/runbooks/problem-catalogue.md with empty catalogue, safe staff config, author/reviewer review, publish/retry/withdraw/recovery and deployment least-privilege gates; preserve original content/problem-packs/two-sum/source/ bytes.
- [ ] T129 Dedicated final review agent applies requesting-code-review, verification-before-completion and relevant TypeScript/PostgreSQL/Vitest/Next.js skills to full requirement/test/privacy/ownership/error/logging coverage; root resolves findings technically, reruns affected checks and repeats convergence when changes warrant; record review evidence in docs/03_features/problem_catalogue/specifications/engineering/eng_design.md.
- [ ] T130 Update project_management/kanban_board.md and kanban_tasks.csv together only for demonstrated completion; preserve genuine seed gates, deferred K-028 cloud and deployment acceptance, record derived issue/PR links in canonical engineering design and concise handoff only where useful in docs/project_notes/.
- [ ] T131 Root verifies final scoped diff and observed test evidence, commits group 06 with the title below, pushes feature/problem-catalogue-immutable-packs and opens new linked PR against confirmed dependency branch/base; include tests and pending seed/release gates in PR and docs/03_features/problem_catalogue/specifications/engineering/eng_design.md.
- [ ] T132 EXTERNAL CONTENT GATE: obtain genuine verified author, distinct authorized human reviewer, source-rights evidence and exact finalized checksum approval for content/problem-packs/two-sum/; configure actual reviewed staff assignments outside committed secrets, then authorized review/publish and real-seed acceptance. Until supplied keep this task pending, seed unpublished and K-008/K-009 incomplete; synthetic code work and draft PR are independently reviewable.

**Commit title:** `<US=shared, ID=T131, K=K-007|K-008|K-009, GROUP=06> test(catalogue): verify catalogue acceptance and coverage`

#### Dependencies and safe parallel work

Group 00 → 01 → 02 → 03 → 04 → 05 → 06. Group 01 content/seed test preparation may proceed with group 02 only after schema/checksum review; files and fixture ownership must be assigned explicitly. Within US3, pure projection tests T113 may run with US2 after group 02, but routes/acceptance wait for publication integration. Never parallelize dependent mutation, migration, review or commits. Actual new-pin races intentionally use separate database connections coordinated by tests.

US1 independently proves bounded reusable validation; US2 synthetic fixtures prove admission/review/publication/withdrawal; US3 proves candidate-safe authenticated HTTP; US4 proves actual persisted immutable session/event pins. US2–US4 depend on the shared sealed-storage prerequisite, not on external human seed approval. Full seed acceptance remains T132. MVP is US1 plus sealed storage and synthetic publication; the owner authorized the complete feature, so continue through all code groups.

#### Verification and evidence

Use Node 24.22.0/npm 11.19.1 and isolated real PostgreSQL per existing development guide. Focused Vitest selectors use paths named in each task; final commands and coverage are specified by group 06 and canonical engineering §8. Run actual HTTP against the running application, not solely imported handlers. Record observed failures/skips/unavailable checks honestly. Review/converge/analyze loop on actual findings; there is no automatic acceptance by document generation or checkbox count.

## 4. Seed content and reference complexity

The seed candidate is [LeetCode Two Sum](https://leetcode.com/problems/two-sum/description/).
Use the owner's [supplied package, approaches and tests](../../../../../content/problem-packs/two-sum/README.md)
as P-04 input. Preserve the original files and resolve the intake findings before
normalization and independent approval; copied input is not a published pack.
The owner-authorized [structured content draft](../../../../../content/problem-packs/two-sum/pack.draft.json)
and [reading preview](../../../../../content/problem-packs/two-sum/pack-preview.md)
now adapt those inputs. Implement their selected fields/rule/profile IDs under K-007;
draft extraction does not establish independent seed approval or implementation.
Its independently written pack must specify indices rather than values, distinct
positions, duplicate-value handling, the unique-pair assumption and answer-order
equivalence. Include negative values, zero, minimum length, large magnitudes and
a late-discovered pair. Do not silently add no-solution/multiple-solution inputs
to the base problem; put them in explicitly changed variants.

For array length `n`, include these reference families with their preconditions:

| Approach                              | Time                                              | Extra memory                                            | Important correctness point                                           |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| Compare distinct pairs                | O(n²)                                             | O(1)                                                    | Iterate `j > i`; never pair an element with itself                    |
| Two-pass value→index map              | Expected O(n); generic collision worst case O(n²) | O(n)                                                    | A complement entry must have a different index; duplicates still work |
| One-pass value→index map              | Expected O(n); generic collision worst case O(n²) | O(n)                                                    | Look up the complement before inserting the current element           |
| Sort value/index pairs + two pointers | O(n log n)                                        | O(n) for retained original indices, plus sort workspace | Sorting values alone loses the original index mapping                 |

These are mathematical estimates for review, not executed benchmark results.
Hash-table guarantees depend on the chosen language implementation. Common
mistakes include returning values/sorted positions, reusing one index, mishandling
duplicates, assuming an unsorted array supports two-pointer elimination, and
claiming unconditional O(1) hash operations.

Multithreading is a proposed follow-up, not part of base acceptance. Separate
parallel fixed-array search from a concurrent `add`/`find` service. Each needs its
own semantics, correctness argument and tests. Independent partition searches
miss cross-partition pairs; thread-safe individual map calls do not make a
compound algorithm atomic. Do not claim a specific LeetCode discussion/comment
was read when its text was inaccessible. No concurrency implementation is added
to the seed automatically.

## 5. Module time and memory complexity

Let `B` be total validated content bytes, `E` the number of entries/references,
`K` the number of object keys, `P` total problems, `V` releases, `T` cases in one
suite, `L` page size, `D` candidate response bytes, `I` interview-section bytes and
`R` total stored release/case records.
Bounds below include application allocations; database disk/index storage is
separate. Serialization and network transfer are not free.

| Operation                                 | Time                                                                              | Application memory / persistent storage             |
| ----------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| Parse and structural validation           | O(B) with bounded depth                                                           | O(B)                                                |
| IDs, references, ordering and rule checks | Expected O(B + E) using maps/sets                                                 | O(B + E) including parsed input                     |
| Canonical serialization + hash            | O(B + K log K) upper bound for sorted keys                                        | O(B + K); hash stream itself O(1) state             |
| Publish one pack                          | O(B + K log K + E log R) conservative indexed-write estimate, plus lock/I/O waits | O(B + E); persistent O(B + E)                       |
| Exact version lookup                      | O(log V + D), or O(log V + I) for a bounded internal section                      | O(D) or O(I); never load all packs                  |
| List summaries                            | O(log P + L log V + returned bytes) with a suitable indexed eligible listing      | O(L + returned bytes); no private section reads     |
| Withdraw / select current                 | O(log P + log V) indexed row work, plus lock waits                                | O(1) excluding bounded audit records                |
| Trusted suite retrieval                   | O(log R + T + suite bytes)                                                        | O(T + suite bytes); later consumers can batch cases |

Listing may inspect more than `L` rows when eligibility is sparse. Validate the
query plan with inactive-content fixtures; do not promise O(L) if the actual plan
scans all problems. No unbounded cache of packs, discussions or hidden tests.
No new Redis/vector/search infrastructure. Keep statements/transactions within
foundation deadlines; bounded input does not replace timeout/cancellation tests.

## 6. Meaningful tests

| Layer                       | Required scenarios                                                                                                                                                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                        | Schema bounds; graph/reference errors; hash determinism; projection allowlists; cursor encode/decode and malformed input; exposure rules                                                                                                                                                                                         |
| Real PostgreSQL integration | Uniqueness/FKs; direct content/test update/delete and late case insertion blocked; unsealed commit rejected; checksum reconstructed without source files; rollback after each write stage; exact retry; conflicting/concurrent publish; stale review; withdrawal; old pin retrieval; pool/lock timeout and cancellation recovery |
| Contract                    | Both problem routes against canonical response/error schemas; event envelope; authentication 401/403/429/503; candidate cannot inject a version/private field                                                                                                                                                                    |
| Privacy/architecture        | Private canaries absent in bodies/errors/logs/client bundles; catalogue list never selects private sections; no cross-module repository imports; no model/network/code execution during validation                                                                                                                               |
| Local end-to-end            | Authenticated HTTP list → detail for the reviewed seed, empty/missing catalogue and pagination. No invented UI; full start/respond/resume flow remains K-014/K-016                                                                                                                                                               |
| Content review              | Human checks expected results, algorithms, mistakes, hint progression, rights and follow-ups; schema tests alone do not satisfy review                                                                                                                                                                                           |

Test the new-pin/withdrawal race through the actual internal session-owned
createPublishedSession operation, not a manually composed consumer fixture.
Assert the exact version in real session and created-event rows, atomic rollback
on either insertion failure, old pin reads after correction/withdrawal, and
unchanged identity fixture behavior. K-014 later adds the HTTP/idempotency
regressions; those are not a prerequisite for this service-level K-009 proof.
Before running reference/candidate programs, use the execution boundary and its
qualification gates; structural validation does not run them inside Next.js.

## 7. Migration, rollout and recovery

1. Add a new forward migration; never edit applied foundation/identity SQL.
2. Verify migration on empty storage and an identity-populated database. Keep
   existing session pins and identity test fixtures valid.
3. Verify safe-role grants and database immutability. Review application versus
   operator privileges; production least privilege stays a deployment gate.
4. Start with an empty catalogue; this is a valid read state. Schema readiness
   failure is a storage/readiness error, not a fabricated empty catalogue.
5. Import the reviewed seed through the authorized publication path. A repeat
   must be a no-op with the original publication identifiers.
6. On a bad seed, withdraw it for new sessions. Preserve old content; publish a
   corrected new version after independent review. Do not delete pinned content.
7. On an uncertain commit, retry exact problem/version/checksum. Never mint a
   second version solely because the first response was lost.
8. Prefer a forward fix. Any destructive downgrade/restore requires explicit
   operational review and preservation of existing pins and audit evidence.

## 8. Verification and completion

Planned commands, using the pinned runtime and dedicated local test database:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run check:architecture
npm run test:architecture
npm run test:unit
APP_ENV=test npm run test:integration
npm run test:contract
```

Add focused test selections as the named tests are implemented. Run the actual
HTTP acceptance against a running local app and record its exact command.
Repeat process/lifecycle checks if changes touch runtime initialization or
database readiness. The full session browser journey remains its owning feature.

After implementation, use the installed review/verification skills and
`$speckit-converge`. Reconcile findings with these documents and existing cards.
Record commands and observed results, including failures/skips/unavailable
checks. K-008 requires real human review. K-009 requires the reviewed seed,
candidate API privacy/contracts, and actual internal session/event pinning with
concurrency/rollback/historical-read evidence. A resolver-only fixture is not
sufficient and waiting for K-014 would create a backwards dependency. Only then update Kanban and CSV together. This
documentation task alone establishes neither completion nor release readiness.

## 9. Observed orchestration evidence

On 2026-10-23, separate specify, clarify, plan, checklist, tasks and analyze
agents reviewed this feature. Clarify found no new material questions. The
requirements-quality reviews passed 16 specification checks and 23 implementation
readiness checks. The first analysis covered all 18 FR/SC items and found three
gaps: explicit identity-owned author verification, sparse-listing query-plan
evidence and stale authorization wording. These were reconciled in the canonical
design/tasks. A second read-only analysis accepted the planning review with no
remaining blocking contradictions. These checks establish planning quality,
not implemented behavior or human seed approval.

Branch: `feature/problem-catalogue-immutable-packs`, based on identity commit
`ddcd8d2`. The identity PR remains open, so the feature PR targets
`feature/identity-candidate-access`.

The Node 24.22.0 archive was verified against its official SHA-256 manifest;
npm reports 11.19.1. With that runtime, the following baseline commands were
executed before production changes:

| Command                                                                               | Observed result                                                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `APP_ENV=test npm run db:test`                                                        | Passed against an allocated isolated PostgreSQL database       |
| `APP_ENV=test npm run test:unit`                                                      | 16 files, 202 tests passed                                     |
| `APP_ENV=test npm run test:integration`                                               | 6 files, 43 tests passed                                       |
| `APP_ENV=test npm run test:contract`                                                  | 2 files, 13 tests passed, including catalogue 400 declarations |
| Targeted Prettier check of feature documents, content draft and changed contract test | Passed                                                         |

The first restricted unit run had seven failures caused by `EPERM` for local
listeners/subprocesses; the approved unrestricted rerun passed without code
changes. The initial restricted database check also failed; the approved rerun
passed. Those failures were environment restrictions, not Feature 3 test results.
All new production behavior still requires its own observed RED/GREEN evidence.

### Derived issue mirrors

All 46 mirrors were created and checked for unique task IDs across open and closed issues. The canonical Kanban and CSV retain project status; issue closure requires observed task evidence.

| Task | Issue                                                          |
| ---- | -------------------------------------------------------------- |
| T087 | [#90](https://github.com/Gyan172004/my-new-system/issues/90)   |
| T088 | [#91](https://github.com/Gyan172004/my-new-system/issues/91)   |
| T089 | [#92](https://github.com/Gyan172004/my-new-system/issues/92)   |
| T090 | [#93](https://github.com/Gyan172004/my-new-system/issues/93)   |
| T091 | [#94](https://github.com/Gyan172004/my-new-system/issues/94)   |
| T092 | [#95](https://github.com/Gyan172004/my-new-system/issues/95)   |
| T093 | [#96](https://github.com/Gyan172004/my-new-system/issues/96)   |
| T094 | [#97](https://github.com/Gyan172004/my-new-system/issues/97)   |
| T095 | [#98](https://github.com/Gyan172004/my-new-system/issues/98)   |
| T096 | [#99](https://github.com/Gyan172004/my-new-system/issues/99)   |
| T097 | [#100](https://github.com/Gyan172004/my-new-system/issues/100) |
| T098 | [#101](https://github.com/Gyan172004/my-new-system/issues/101) |
| T099 | [#102](https://github.com/Gyan172004/my-new-system/issues/102) |
| T100 | [#103](https://github.com/Gyan172004/my-new-system/issues/103) |
| T101 | [#104](https://github.com/Gyan172004/my-new-system/issues/104) |
| T102 | [#105](https://github.com/Gyan172004/my-new-system/issues/105) |
| T103 | [#106](https://github.com/Gyan172004/my-new-system/issues/106) |
| T104 | [#107](https://github.com/Gyan172004/my-new-system/issues/107) |
| T105 | [#108](https://github.com/Gyan172004/my-new-system/issues/108) |
| T106 | [#109](https://github.com/Gyan172004/my-new-system/issues/109) |
| T107 | [#110](https://github.com/Gyan172004/my-new-system/issues/110) |
| T108 | [#111](https://github.com/Gyan172004/my-new-system/issues/111) |
| T109 | [#112](https://github.com/Gyan172004/my-new-system/issues/112) |
| T110 | [#113](https://github.com/Gyan172004/my-new-system/issues/113) |
| T111 | [#114](https://github.com/Gyan172004/my-new-system/issues/114) |
| T112 | [#115](https://github.com/Gyan172004/my-new-system/issues/115) |
| T113 | [#116](https://github.com/Gyan172004/my-new-system/issues/116) |
| T114 | [#117](https://github.com/Gyan172004/my-new-system/issues/117) |
| T115 | [#118](https://github.com/Gyan172004/my-new-system/issues/118) |
| T116 | [#119](https://github.com/Gyan172004/my-new-system/issues/119) |
| T117 | [#120](https://github.com/Gyan172004/my-new-system/issues/120) |
| T118 | [#121](https://github.com/Gyan172004/my-new-system/issues/121) |
| T119 | [#122](https://github.com/Gyan172004/my-new-system/issues/122) |
| T120 | [#123](https://github.com/Gyan172004/my-new-system/issues/123) |
| T121 | [#124](https://github.com/Gyan172004/my-new-system/issues/124) |
| T122 | [#125](https://github.com/Gyan172004/my-new-system/issues/125) |
| T123 | [#126](https://github.com/Gyan172004/my-new-system/issues/126) |
| T124 | [#127](https://github.com/Gyan172004/my-new-system/issues/127) |
| T125 | [#128](https://github.com/Gyan172004/my-new-system/issues/128) |
| T126 | [#129](https://github.com/Gyan172004/my-new-system/issues/129) |
| T127 | [#130](https://github.com/Gyan172004/my-new-system/issues/130) |
| T128 | [#131](https://github.com/Gyan172004/my-new-system/issues/131) |
| T129 | [#132](https://github.com/Gyan172004/my-new-system/issues/132) |
| T130 | [#133](https://github.com/Gyan172004/my-new-system/issues/133) |
| T131 | [#134](https://github.com/Gyan172004/my-new-system/issues/134) |
| T132 | [#135](https://github.com/Gyan172004/my-new-system/issues/135) |

### Group 01 — observed validation acceptance

T092–T098 implemented and reviewed the strict schema, raw JSON admission,
reference/data validation, canonical checksums and immutable validation results.
Schema tests first exposed 15 failures against the permissive stub; semantic
validation first exposed 28 failures. Review then reproduced excessive schema
error allocation, added a failing real-process regression and fixed it with
bounded schema preflight. The adversarial 512 KiB input dropped from roughly
100 MiB extra heap to about 7 MiB while retaining 100 safe errors and truncation.
The second independent review accepted the fix without weakening validation.

Fresh pinned-runtime commands observed after the fix:

- `APP_ENV=test npm run test:unit`: 20 files, 295 tests passed, including all 93
  catalogue tests and the real-process memory regression.
- `APP_ENV=test npm run check:architecture`: passed, zero violations.
- Scoped ESLint and `npm run typecheck`: passed.
- Reviewer independently ran all 93 focused tests and the adversarial probe.

A pre-fix `APP_ENV=test npm test` run was deliberately interrupted with SIGINT
(exit 130) to apply the review fix; it produced no acceptance result. Full-suite,
container, HTTP and final coverage evidence remain Group 06 work.

The owner's draft validates all 37 cases, including the 10,000-element inputs;
original source hashes are unchanged. Its metadata still blocks publication.
K-007 schema acceptance is met; K-008/K-009 require genuine seed approval and
subsequent implementation evidence. Synthetic approval markers prove no human
review or production authority.

### Group 02 — observed transaction and storage acceptance

T099–T104 added the opaque shared transaction adapter, migration
`1792713600000_problem_catalogue.sql`, seven relations and narrow catalogue
installer. Known domain aborts survive rollback outside the sanitizing database
wrapper. Tests observe backend reuse for known aborts, backend replacement after
unknown SQL failures, immediate canceled-scope invalidation and recovery.

Independent review found and reproduced a valid large case rejected by the
original 256 KiB storage ceiling. A failing regression drove conservative 4 MiB
JSONB text ceilings, retaining the 2 MiB authored input limit. The original UUID
spelling survives full checksum reconstruction. Review also strengthened the
otherwise-valid late-insert and coordinated sealing-race evidence. Removing the
case guard made the regression fail; restoring it returned all 22 focused tests
to green. Genuine review/publication/audit rows reject update/delete, and
identity-populated migration and arbitrary legacy session pins remain valid.

Fresh root verification with the pinned runtime:

- `APP_ENV=test npm test -- tests/unit/problem-catalogue/transaction.test.ts tests/integration/problem-catalogue/storage.test.ts tests/integration/migrations.test.ts tests/integration/readiness.test.ts`: four files, 39 tests passed.
- The independent reviewer separately passed 22 transaction/storage tests and
  11 migration tests, with no remaining blocking finding.
- Typecheck, scoped ESLint and architecture checks passed.

The accepted migration-chain fixture, table-list expectation and future-unknown
migration fixture were reconciled for the fourth revision; earlier migrations
and bespoke partial-migration counts were preserved. A broad pre-fix full run
was interrupted (exit 130); final full-suite/process/container acceptance remains
T126. Publication, candidate HTTP and actual session pins are still later groups.

Hosted Foundation CI also passed for both reviewed heads: [Group 01 `b1ecf03`](https://github.com/Gyan172004/my-new-system/actions/runs/39868321203) and [Group 02 `cfe5736`](https://github.com/Gyan172004/my-new-system/actions/runs/39869557301). These runs cover those commits only; subsequent changes require fresh acceptance.

### Interrupted Group 03/04 checkpoint — 2026-10-23

The agent platform stopped the publication, catalogue-read and dedicated T111
review agents with a usage-limit error. This is an execution interruption, not
approval or acceptance. Group 03/04 code and runbook changes remain uncommitted;
T105 onward remain unchecked pending their review/commit gates. No new PR exists.
The last committed head is `cfe5736` on
`feature/problem-catalogue-immutable-packs`; both committed groups passed hosted
CI as linked above. Preserve unrelated pre-existing skill/setup changes.

Root's latest `APP_ENV=test npm run test:unit` passed **26 files / 324 tests**.
Root separately passed **24 tests** across transaction, storage and the new
availability-lock integration file. A mixed focused run initially hit the CLI
subprocess test's 5-second test budget (25 passed / 1 timed out); the publisher
subsequently adjusted that process-test budget and the fresh full unit run above
passed. T111's reviewer reported 37 focused tests passing before the platform
interruption, but did not complete its review. This is not T111 sign-off.

Resume with dedicated publication review, including the installer availability
lock and identity/public-barrel boundaries, then root verification and T112
commit. The read agent added routes, transport/contract tests and a real Next
HTTP fixture; its actual HTTP result is not yet accepted. Finish T115–T118 and
Next MCP/browser verification before session pinning T119–T124. T125 must enforce
catalogue coverage in CI and keep the existing identity/session coverage gate
passing when session production code expands. Continue convergence/final review
and the stacked PR against `feature/identity-candidate-access`. T132 remains a
genuine independent human content gate; the real Two Sum seed stays unpublished.

### Group 03 — observed review and publication acceptance

T105–T112 implement immutable staff configuration, identity-owned active-author
lookup, approved/rejected checksum-bound review, atomic publication and
idempotent withdrawal. The credential-safe command runs offline validation or
verified operations with bounded stdin/files and runtime cleanup. The real seed
remains unpublished; synthetic fixture evidence does not satisfy T132.

Root's focused nine-file command across operator/author/command unit tests,
author/publication/concurrency/availability/command integration tests and the
publication event contract passed 39 tests. Typecheck, global ESLint and the
source architecture check passed. The dedicated reviewer independently passed
73 tests including architecture and identified a valid uppercase review UUID
whose first receipt differed from its retry. Root observed the regression fail,
normalized the validated UUID once and passed all 14 publication tests; the
reviewer independently reran those 14 tests and accepted T111 without outstanding
findings. Review also drove an equivalent lint-safe control-character check.
The earlier CLI process timeout is resolved by its explicit process-test budget.

`lockAvailability` is a catalogue-owned narrow write port returning only a frozen
status DTO; its real two-connection test proves FOR UPDATE exclusion and release
on commit. Withdrawal locks problem then availability, preserves the first
reason/audit on retry and clears current selection without fallback. New
publication checks the reviewer's current grant; historical retry checks current
publisher authority and recorded approval without reselecting or re-enabling.
Commands and safe recovery are documented in the operations runbook.

### Group 04 — candidate catalogue verification

Candidate summary/detail reads select only candidate material and construct
frozen allowlisted DTOs. Current detail and its metadata come from one selected
eligible release; exact historical candidate reads ignore later withdrawal.
Keyset cursors are bounded, versioned, canonical base64url and carry only the
last stable ID. Limits remain 1–100, default 20. A real sparse PostgreSQL fixture
with 1,200 inactive records and three eligible matches inspected eight release
and availability records, made six indexed current-pointer probes, sorted three
matches and used 15 shared-hit blocks / zero disk reads (one local execution:
0.344 ms). This is fixture evidence, not a capacity target or O(page-size) bound;
query cost depends on inspected eligibility/current-pointer records.

Review found URL dot-segment problem IDs and control-bearing problem/version
labels could validate but fail retrieval. Failing tests drove narrowly scoped
admission guards: reject C0/DEL for stable problem IDs and pack versions, and
exact `.`/`..` only for problem IDs. Unicode IDs and ordinary version labels
remain supported. Root observed four version-control failures before the fix,
then passed all 104 schema/validation/checksum/seed tests; the reviewer separately
passed the final 46 validation cases.

Actual Next HTTP tests cover candidate-only list/detail, malformed input,
authentication/disabled users, throttling/Retry-After, storage failure versus
empty data, recovery and log canaries. Review exposed malformed percent/UTF-8
pathnames rejected by Next before the handler as HTML, then a cross-bundle error
class mismatch in the first fix. The final transport maps only malformed encoded
GET detail paths to a valid encoded invalid-ID path and delegates the original
Next handler. This preserves its identity graph, headers, source context and
cancellation while returning canonical API errors. No structural exception
matching was relaxed.

The production process fixture now copies test fixtures needed by the new
publication helper. Both implementation and independent review observed all five
privacy/shutdown tests passing after the original build failure; the helper
correction was included in Group 03 because that helper introduced the dependency.
Root's latest full unit command passed 26 files / 337 tests and typecheck passed.

A separate owned Next 16.4.2 Turbopack fixture exposed both catalogue routes;
MCP `get_compilation_issues` returned no issues. A real agent-browser session
asserted list/detail 200, exact candidate fields and coherent versions,
unauthenticated 401 and invalid limit 400. Its browser was closed and the fixture
disposed. MCP `get_errors` reported no connected browser session despite the
active browser; no zero-runtime-error claim is based on that unavailable probe.
The independent final HTTP/transport rerun passed seven tests in 44 seconds;
T117 is accepted with no remaining blocking findings.

Hosted Foundation CI passed the reviewed Group 03 head [`ea926c6`](https://github.com/Gyan172004/my-new-system/actions/runs/39899625362). Group 04 and later heads require their own observed CI results.

The first Group 04 hosted run ([`1c7a963`](https://github.com/Gyan172004/my-new-system/actions/runs/39900364053)) failed at formatting of `admission.test.ts`; later checks did not run. Root reproduced the formatter failure and applied its formatting-only correction in `b1a0d8a`, then observed the scoped format check pass. Fresh hosted/final acceptance remains required for the corrected head; no functional pass is inferred from that failed run.

### Group 05 — observed atomic session pin acceptance

T119–T124 add internal published-session creation and owner-first historical
candidate lookup through the existing session service. New creation accepts the
verified caller and problem ID, resolves the eligible version and inserts its
snapshot/created event through one opaque shared scope. The owning repository
joins that connection without a nested transaction. Existing fixture creation,
owned reads/start behavior and arbitrary legacy fixture pins remain compatible;
no new session-pack foreign key, HTTP endpoint or replay policy was introduced.

The first test run observed seven missing-operation failures. The implementation
then passed real PostgreSQL checks for one backend PID/transaction ID, rollback
after resolve/snapshot/event writes, expired/foreign scopes and safe domain codes.
Final coverage adds all three cancellation points with released-lock proof,
owner-before-content lookup, missing/physically corrupted history without
fallback, A preserved after B publication/withdrawal, and both commit orders of
publication/withdrawal races coordinated with real blocking evidence. Exact
publication retry after a lost commit response cannot change a stored pin.

Root freshly ran `APP_ENV=test npx vitest run tests/integration/problem-catalogue/pinning.test.ts tests/integration/identity-storage.test.ts`:
two files / 29 tests passed, including all 20 final pinning tests. Typecheck passed.
The dedicated reviewer independently passed the same 29 tests, scoped ESLint,
typecheck and architecture, and accepted T123 with no actionable findings. Its
earlier architecture-inclusive check passed 61 tests. K-013/K-014 still own HTTP
command idempotency and K-016 owns the full candidate journey; real seed approval
remains T132.
