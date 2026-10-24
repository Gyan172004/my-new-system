# Stage 6 — Approach Assessment and Hint Management: Engineering Design

**Date:** 2026-10-24. **Status:** Reviewed implementation planning; production slices remain planned.
Section9 records the owner-authorized branch execution boundary and supersedes
earlier blanket dependency sequencing where it permits independent local slices.
**Kanban:** K-019, M2, P1. The Kanban/CSV own status; this breakdown does not.
Inputs: [requirements](../../requirements/feature_req.md),
[technical design](../technical/tech_design.md),
[pseudocode](../../pseudo_code/logic_and_state.md).

## 1. Execution discipline and proposed code ownership

Use the repository's locked Node 24.22.0/npm 11.19.1, TypeScript, Next.js, Zod,
`pg`, migration runner, Vitest, AJV and Playwright. Follow existing development
configuration and isolated PostgreSQL test fixtures. No dependency upgrade or
provider/cloud provisioning is included in this design.

For each production slice, write/identify a test, observe its intended failure,
implement the smallest change, run relevant checks and refactor. Use systematic
debugging for failures, technical review for important changes, and observed
verification before completion. Existing tests are reused where they prove the
required behavior; passing unrelated tests is insufficient.

Proposed implementation paths (none created by this documentation task):

```text
src/modules/approach-assessment/
  public.ts
  domain/proposal.ts, classify.ts, evidence.ts, projection.ts
  application/service.ts, context.ts, profile.ts
  persistence/assessments.ts
src/modules/hints-variants/
  public.ts
  domain/next-hint.ts
  application/service.ts
  persistence/exposures.ts
src/modules/problem-catalogue/application/assessment-context.ts
src/modules/problem-catalogue/public.ts                # narrow trusted DTOs
src/modules/interview-session/application/             # existing command owner
src/modules/conversation/public.ts                    # owning evidence seam
src/modules/model-gateway/public.ts                   # operation registration seam
migrations/<next_ordered_revision>_approach_assessment_hints.sql
tests/unit/approach-assessment/, tests/unit/hints-variants/
tests/integration/approach-assessment/, tests/integration/hints-variants/
tests/contract/assessment-hints.test.ts
tests/e2e/assessment-hints.spec.ts
tests/fixtures/approach-assessment/                    # reviewed synthetic cases
```

Conversation/Gateway command paths must be aligned with their owning implemented
interfaces once accepted; do not create competing orchestration implementations
because those modules are incomplete in this checkout. Select the next migration
revision using the existing immutable ordering manifest; never renumber history.

## 2. Dependency and decision readiness

| Dependency                    | Evidence in this checkout / gate                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K-002/K-005/K-006             | Foundation acceptance recorded in Kanban/runbook; reuse boundaries, transaction scope, migrations and CI.                                                                                                                    |
| K-007/K-008/K-009             | Strict pack schema and local Two Sum publication/retrieval accepted. ADR-025's owner-review exception applies only to that seed. Add narrow trusted read interfaces; existing candidate DTOs are insufficient.               |
| K-010/K-011/K-013/K-014/K-016 | Full guarded session commands, events, replay and resume remain Backlog. Current code supports only the catalogue/identity prerequisite and created-to-intro. Minimum owning-service extensions may be independently verified; full applicable acceptance remains required for HTTP/journey integration. |
| K-017/K-018, W6/W7            | Gateway/orchestration sources imported in merge8f40e13; local checks recorded below, while real OpenAI and session-integration acceptance remain open. K-019 explicitly depends on K-018; do not mark readiness from speculative documents or another branch's status.   |
| K-012                         | Development authentication acceptance recorded; reuse active internal identity and authorization.                                                                                                                            |
| K-029                         | Voice is a sibling V1 feature, not a dependency for text-only mechanics. Accept its shared-transcript integration before claiming voice assessment.                                                                          |
| K-028/T034                    | ADR-022 permits only verified local configuration/privacy/isolation evidence from the foundation runbook; real environment isolation/secret injection remains deferred. K-026 retains cloud/release/load/recovery ownership. |

Readiness items to resolve at A-01, without inventing product decisions:

1. Review the owning K-014 candidate-response payload and canonical request
   hashing; fix interface drift jointly if present.
2. Confirm orchestration's bounded clarification/open-ended continuation policy.
   Stage 6 does not choose a cap or auto-advance from model confidence.
3. Review operation token/context/output, retry, deadline, admission and cost
   budgets with K-017/K-018. Limits must be finite and positive, retries bounded.
4. Review calibration dataset, `tau`, `delta`, evidence sufficiency, comparison
   rules and acceptable precision/coverage operating point before label enablement.
   A missing profile leaves labels disabled; sample `0.75` is not a default.

These are integration/enablement gates, not evidence that the documents are
missing. Material product choices still require the owner. The actual user
authorization for independent local slices is recorded in §9; writing this plan
alone does not waive full acceptance gates.

## 3. Ordered vertical slices and traceability

All steps map to K-019; dependencies on other cards retain their own ownership.
Section9 refines implementation grouping and permits actual internal services
before unavailable HTTP/journey acceptance; A-10/13 full-route coverage stays gated.
Paths below are relative to the proposed paths in §1. Each implementation step
requires the preceding red test; no checkbox here establishes project status.

| Step / story               | Deliverable and intended red-to-green evidence                                                                                                                                                                                                                                                                                                    | Requirements / criteria                          | Depends on                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| A-01 — readiness           | Reconcile these four docs, operation/payload seams, qualification inputs and custom checklist; record prerequisite evidence here. Read canonical contracts/ADRs again before code.                                                                                                                                                                | FR-01–FR-18; SC-01–SC-07                         | Named §2 dependencies and owner review |
| A-02 — foundation          | Write failing `tests/unit/approach-assessment/context.test.ts` for bounded private projections and wrong pin/owner; implement catalogue `application/assessment-context.ts` through public DTOs. Exclude full solutions, hints and hidden data from matcher context.                                                                              | FR-01/02/03/13; SC-03                            | A-01                                   |
| A-03 — foundation          | Write failing command integration cases in `tests/integration/approach-assessment/commands.test.ts` for replay ordering, lease fencing, atomic rollback and unchanged session on provider failure; adapt owning session/conversation seams and add the additive migration.                                                                        | FR-01/09/10/11/12/14; SC-02/04/05                | A-02; §9 owning-service foundation (HTTP remains gated)       |
| A-04 — US1                 | Write `tests/unit/approach-assessment/proposal.test.ts`, `evidence.test.ts` and `classify.test.ts`; demonstrate rejection of extra fields, invalid confidence/IDs/evidence and unsupported match. Implement strict proposal/evidence validation and single-pass classification. Include outcome/ref consistency and null candidate complexity.    | FR-03/04/05/11; SC-01/04                         | A-03                                   |
| A-05 — US1                 | Write `tests/integration/approach-assessment/assessment.test.ts` with fake Gateway, current-command reserved evidence and real PostgreSQL. Implement `application/service.ts`, `persistence/assessments.ts`, Gateway operation registration and safe `domain/projection.ts`; commit one event/version and safe turn.                              | FR-02/03/04/05/10/11/13/14; SC-01/03/04          | A-04                                   |
| A-06 — US2                 | Write `tests/unit/approach-assessment/clarification.test.ts` and integrated clarification/reassessment cases; implement ambiguous/low-confidence handling through owning orchestration. Cover equal scores, exact threshold/margin boundaries, contradictory/partial evidence, absent candidate complexity, configured cap and no automatic hint. | FR-04/05/06/07/12; SC-01/04/05                   | A-05                                   |
| A-07 — US3                 | Write `tests/unit/approach-assessment/novel.test.ts` and integration cases for interpretable unfamiliar reasoning, invalid reasoning, valid empty proposed matches and corrupt missing required references; implement open-ended/null-match behavior. Verify recognized suboptimal algorithms remain distinct from incorrect algorithms.                                                         | FR-03/04/05/06/16; SC-01/04/06                   | A-06                                   |
| A-08 — US4                 | Write `tests/unit/hints-variants/next-hint.test.ts`; then implement deterministic reviewed-routing selection, first-exposure ladder lock and ladder-local cursor/eligibility and canonical text in `domain/next-hint.ts`. Cover nonempty one/many hints, multiple ladders/approaches, missing reviewed default, corrupt empty ladder, stage/status denial and exhausted cursor.                                                                                                 | FR-02/07/08/09/13; SC-02/03                      | A-03                                   |
| A-09 — US4                 | Write `tests/integration/hints-variants/exposure.test.ts` and `races.test.ts`; implement `application/service.ts`, `persistence/exposures.ts` and session finalization. Fail after each write, race distinct/same keys, lose response after commit, reclaim lease, resume and reassess; exactly one exposure and no lost update.                  | FR-01/07/08/09/10/12/14; SC-02/04/05             | A-08                                   |
| A-10 — integration         | Write `tests/contract/assessment-hints.test.ts` against actual action adapter and canonical API/event validators. Add text/accepted-transcript parity and TTS-safe projection cases to owning voice tests when K-029 is available; mark unavailable coverage honestly. Check event metadata, ETag/errors and zero extra events per version.       | FR-01/07/10/13/15; SC-02/03/05                   | A-05–09; K-014; K-029 for voice        |
| A-11 — adversarial         | Extend unit/integration fixtures and `tests/architecture/` for injection, cross-user canaries, hidden output/reference/later-hint canaries, provider timeout/rate limit/schema failures, wrong evidence, context truncation, stale completion, account deactivation and error/log redaction. Prove expected planted violations fail.              | FR-01/02/03/10/11/12/13/14/15/16; SC-01/02/03/05 | A-10                                   |
| A-12 — evaluation          | Version reviewed synthetic/reviewer-authored datasets under `tests/fixtures/approach-assessment/`; run offline and real-provider evaluation through Gateway, select/approve profile using separate calibration/held-out splits, retain reproducible aggregate report and failure slices in this document.                                         | FR-04/11/16/18; SC-01/06                            | A-07/11; K-017/K-018 real-service gate |
| A-13 — journey/performance | Add `tests/e2e/assessment-hints.spec.ts`: explanation → uncertainty → clarification/open-ended path → eligible hint → retry → refresh/continue. Measure bounded-input policy CPU/heap, indexed database access and about 100 active sessions; verify load shedding and no unbounded provider concurrency.                                         | FR-01–FR-18; SC-01–SC-07                         | A-10/11; A-12 for provider claims      |
| A-14 — handoff             | Review all changed production/test paths, re-run relevant commands, use `$speckit-converge`, reconcile contracts/ADRs/four docs, record observed evidence here and only then update K-019 and aligned CSV if its criteria pass.                                                                                                                   | FR-01–FR-18; SC-01–SC-07                         | A-01–13                                |

US1 minimal slice is bounded assessment with a fake Gateway and atomic evidence;
US2 adds clarification, US3 unfamiliar reasoning, US4 ordered durable help. A-08
can follow A-03 independently of A-04–07, but shared session integration needs
coordination. This is a dependency option, not authorization to spawn agents.

## 4. Time and space complexity

These are algorithmic bounds for **platform assessment/hint processing**, distinct
from the candidate's algorithm complexity. Network/provider/database elapsed time
is measured separately, not hidden inside an `O(1)` claim.

Definitions: `B` = bytes of selected trusted pack projections; `A` = reference
count; `D` = ladder count; `H` = total hints over all ladders; `Hs` = selected ladder hint count; `E` = selected evidence text bytes; `R` = total evidence
references/spans; `J` = structured model output bytes; `M <= A` = proposed matches;
`V` = bytes of persisted assessment/response; `P` = normalized command bytes;
`N` = indexed database row count; `K` = rows returned in one history page;
`T_in/T_out` = provider input/output tokens. Pack input is bounded by the existing
2 MiB bundle/schema limits; operation profiles impose smaller context/output caps.
Do not truncate away a decisive precondition and claim full-context matching.

| Operation                                               | Time                                                                                      | Auxiliary memory / stored growth                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Validate/decode selected pack context; build ID maps    | `O(B + A + D + H)`                                                                            | `O(B + A + D + H)` when both projections are loaded; matcher loads no hint prose           |
| Canonicalize and hash new command                       | `O(P)`                                                                                    | `O(P)` with ordinary serialization; bounded by action input limits                     |
| Assemble bounded evidence, decode code-point boundaries | `O(E + R)` with one boundary index per selected turn                                      | `O(E + R)`; avoid rescanning a long turn for each span                                 |
| Validate proposal and evidence                          | Expected `O(J + R)` after maps and boundary indexes; includes summed excerpt bytes in `J` | `O(J + R)`; map lookup expected constant time, not a worst-case guarantee              |
| Choose top two / outcome                                | `O(M)`; no sort                                                                           | `O(1)` extra after validated input; retain `O(M)` proposal data already counted in `J` |
| Deterministic safe assessment projection                | `O(V)`                                                                                    | `O(V)`; bounded templates plus approved candidate excerpt                              |
| Select next hint from validated ordinal array           | `O(1)` lookup; `O(L)` copy for hint text length `L`                                       | `O(L)` output; existing ladder storage `O(B + D + H)` excluded from auxiliary lookup cost  |
| Ownership/replay/CAS/insert operations                  | Fixed number of indexed operations, each nominal B-tree `O(log N)` plus row/JSON bytes    | `O(V)` application result; WAL/index/storage costs and lock wait require measurement   |
| Resume current snapshot                                 | Indexed `O(log N)` plus bounded response/exposed-turn bytes                               | Response bytes; never replay all session events                                        |
| History page                                            | `O(log N + K + pageBytes)` with matching index/order                                      | `O(K + pageBytes)`; page size bounded                                                  |
| Durable per accepted assessment                         | `O(V + R)` write volume plus fixed metadata/index entries                                 | `O(V + R)` row/JSON growth, no full-pack copy                                          |
| Durable per exposed hint                                | `O(L)` turn plus fixed exposure/event/replay metadata                                     | `O(L)` plus fixed IDs; total hint turns at most `Hs` per pinned session                 |

End-to-end local work is expected `O(B + A + E + J + R + P + V)` for assessment,
plus a constant count of indexed database operations and bounded Gateway calls.
A cold hint request also pays `O(B + D + H)` ladder validation; a warm validated
immutable ladder permits constant index selection plus text/transaction cost.
No global unbounded pack cache is assumed. If caching is introduced, key by pin
and checksum, cap total bytes and evict; mutable session state remains in storage.

Provider inference is an external bounded operation: report wall latency, attempt
count, `T_in`, `T_out`, model/version and usage/cost. Do not invent its asymptotic
complexity from token counts. Total operation deadline includes queue/admission,
attempts and permitted repairs, and is bounded by K-017's profile.

For `C` concurrent operations, working memory grows approximately with the sum of
their bounded inputs/outputs: `O(C * maxPerOperationBytes)`; admission caps `C`.
Historical storage grows with accepted assessments/turns/exposures until retention
expiry. Database I/O, index depth, MVCC/WAL, disk and contention are additional
costs, not constant-time guarantees. Inspect representative `EXPLAIN` plans and
heap/latency at minimum/maximum fixtures; do not infer capacity from Big-O alone.

Candidate complexity evidence is separately stored as stated time/auxiliary-space
claims plus assumptions and citations. Examples in test fixtures may distinguish
a nested pair scan `O(n²)`/`O(1)` from a map approach's expected `O(n)`/`O(n)` under
its hashing assumptions; those are not platform bounds or proof that candidate
code implements either algorithm. No executable candidate code runs in Stage 6.

## 5. Test matrix and failure controls

| Layer                       | Required proof                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit/property               | All four outcomes, no-match/null invariants, exact score boundaries/ties, confidence NaN/infinity, evidence membership/ranges, complexity unstated versus wrong, hint order/cursor invariants; templates contain no private interpolation. |
| Real PostgreSQL integration | Atomic row/turn/event/snapshot/replay writes; uniqueness; same/different payload replay; cross-user denial; competing commands; fenced lease recovery; rollback before/after each write; deletion/expiry; bounded queries and connections. |
| Contract                    | Real route request/response/error/ETag conforms to OpenAPI; existing canonical event schema accepts actual metadata; typed internal operations remain compatible; no unapproved public assessment fields.                                  |
| Security/architecture       | Boundary import violations fail; private/hint/hidden-data canaries absent from browser DTOs and wrong Gateway contexts; fake provider injection cannot advance state, cause disclosure or invoke execution.                                |
| End-to-end                  | Authenticated text journey, clarification/open-ended continuation, hint request, duplicate action, refresh/resume and account/session separation. Voice parity needs the real owning feature seam.                                         |
| Operational/performance     | Provider timeout/rate limit/invalid output, DB outage and cancellation are neutral; load shedding bounded; stale results cannot commit; local CPU/heap and provider latency/cost measured separately.                                      |

Deliberate negative controls must include bypassing membership checks, accepting a
tied match, returning raw reference text, advancing cursor before commit and
skipping replay lookup. Apply mutations only in disposable fixtures/copies, then
observe the relevant tests fail; never corrupt actual source to collect evidence.

## 6. Evaluation and calibration protocol

Maintain reviewer-authored examples with consent/provenance and no production
transcripts or hidden tests. Cover each known approach and common misconception,
valid suboptimal methods, index-preservation errors, incomplete correctness
arguments, ambiguous hybrids, unfamiliar methods, paraphrases/communication styles,
missing complexity, prompt injection, requests for all hints and invalid IDs.
Keep paraphrases from a single source in one split to prevent leakage.

Separate calibration and held-out evaluation. Define reviewed expected permissible
outcomes/reference IDs, required evidence and clarification/failure categories;
ambiguous cases may have multiple allowed interpretations. Review disagreements
before treating model results as ground truth. Report counts as well as rates:

- Accepted-match precision = correct accepted labels / all accepted labels.
- Coverage = accepted labels / assessable examples; report zero denominators.
- Abstention and ambiguous rates, false accepted labels, novel false rejection,
  malformed-output rate and missing-evidence correctness separately.
- Per-slice results, confusion categories, latency P50/P95, retries, usage/cost and
  a dataset/report/model/prompt/profile fingerprint. Include repeated real-provider
  runs to expose variability; deterministic stubs do not qualify model quality.

Choose `tau`/`delta` and evidence rules on calibration only; the reviewer/owner
approves the precision/coverage operating point and evaluation sample adequacy
before enabling labels. Do not invent a universal accuracy percentage, claim
statistical confidence from tiny fixtures, or retune on the held-out set. Missing
profile or unacceptable results leaves labels disabled and the gate open.

## 7. Migration, rollout, rollback and verification

Use an additive migration for assessment/exposure records and bounded snapshot
fields. Default legacy sessions to zero only when existing persisted evidence
proves no exposures; otherwise reconcile/backfill from authoritative events before
enablement. Never silently erase historical hints. Test empty/repeated apply,
existing sessions, constraints and transactional failure through the existing
migration harness. No new database service, ORM, role or RLS model is introduced.

Enable in stages through owning orchestration policy: deterministic fake-provider
tests, local reviewed seed journey, real-provider evaluation, reviewed label
profile, then external readiness. Gate hint exposure independently so provider
outage cannot consume a hint. Turn off admission of new assessment/hint commands
on rollback; fence outstanding operations, retain committed evidence/replay and
read access, and use forward fixes. Do not drop evidence or reset cursors to roll
back. Expired leases/operations follow the existing recovery/retention policy.

Existing commands to run at implementation acceptance:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:contract
npm run verify:architecture
npm run build
npm run test:e2e -- tests/e2e/assessment-hints.spec.ts
```

The last test file and feature-specific fixtures do not exist yet. Real DB/browser
commands need the documented isolated runtime, authenticated test setup and service
configuration in `docs/development.md`; do not run against production. Evaluation
must use the owning Gateway harness once implemented; no fictional evaluation
script is presented as runnable. Record exact focused/evaluation commands,
environment/profile fingerprints, counts, failures, skips and unavailable checks
here when executed. Review and `$speckit-converge` follow verification; K-019 can
move only when its acceptance and applicable dependency/real-service gates pass.

## 8. Documentation review and evidence status

Spec Kit working directory:
`.specify/work/approach_assessment_hint_management/` (ignored, non-authoritative).
Specification, clarification scan, technical plan, quality checklist, task
decomposition and consistency analysis feed these four canonical files. Working
copies must match them or become link-only references after reconciliation.

This design records no implementation tests, model benchmark, provider smoke,
database migration run or feature completion. Custom requirements-quality review
remains reviewer-owned. The source/contract review reconciles approach-specific hint routing/locking
semantics, one event per command version, safe candidate output, text/voice policy
and isolated execution boundaries. Numerical qualification and missing upstream
acceptance remain the explicit gates in §2, not silently approved defaults.



Independent planning/checklist review on 2026-10-24 inspected the four canonical
documents, ADR026, full disposable artifacts, real seed/schema/grants, opaque
transaction runner, unique event-version constraint and API/event shapes. No
Critical/Important blocker remained after the nonexistent author permission was
removed. CHK001–032 were independently reviewed and satisfied. The six fixes and
reviewed default/first-exposure lock are coherent; the actual owning-session
PostgreSQL boundary is accepted. This is design evidence only: no implementation
runtime or feature completion is claimed; HTTP/browser/voice/provider/deployment
acceptance remains gated.

Planning gate verification — 2026-10-25: fresh read-only reanalysis found no remaining findings after reference-nullability, evaluator-authorization and operation-table naming remediation. All 18 functional requirements and seven success criteria map to the 42 accepted tasks; the independent custom checklist review satisfied 32/32 items. The verified 42-issue export is recorded in §11. T230/T231 are complete on that observed documentation/review evidence; this does not establish production behavior or K-019 completion. T232 remains pending until the separate documentation commit succeeds.

## 9. Authorized branch execution groups and dependency evidence

The owner authorized independent K-019 slices and minimum owning-session seams
on 2026-10-24. This updates the dependency execution boundary in §2/3; it does
not mark upstream features complete. Merge `8f40e13` retains catalogue seed
`8571cbf` and imports orchestration `a3e71df` plus its Gateway prerequisite.
Independent reconciliation review found no Critical/Important findings, all 29
CSV statuses matched the Kanban, and seed/catalogue source was preserved. Observed
pinned checks: `npm run typecheck` exited 0 and `APP_ENV=test npm test --
tests/unit/model-gateway tests/unit/interview-orchestration
 tests/contract/model-gateway tests/contract/interview-orchestration` passed
24 files / 545 tests. These establish branch compatibility only.

The following concrete groups refine A-01–14. Task decomposition assigns IDs
T230 onward; T229 is the prerequisite integration commit. Every group gets a
fresh implementation worker, independent stack-aware review, focused verification
and a separate commit task. Commit headers retain
`<US=..., ID=T..., K=K-019, GROUP=..>` and bodies contain Why/Changes/Review/
Validation/Limitations. Review/coverage does not close K-019 automatically.

| Group | Implementable scope and tests | Boundary / dependency |
| --- | --- | --- |
| 00 | Six audit fixes, ADR026, specify/clarify/plan/checklist/tasks/analyze and derived issue export. | Planning review before production changes; Kanban remains authoritative. |
| 01 | Catalogue exact-pin matcher/hint projections and strict routing selection; content-publishing routing review/install lifecycle with existing grants; additive routing storage. Unit + real PostgreSQL approval, wrong-pin, immutable revision, missing-default and multiple-ladder cases. | No real seed routing autoapproval; no candidate full-pack DTO. |
| 02 | Strict proposal/evidence/profile schemas, deterministic four-outcome classifier, canonical safe templates, Gateway approach operation and nonmutating synthetic evaluator. Failing invalid-ID/span/tie/threshold/injection tests then real fake-Gateway invocation tests. | No numeric profile autoqualification; evaluator is write-free even with labels disabled. |
| 03 | Minimal conversation scoped turn persistence, canonical session command reservation/replay/reclaim and assessment finalization with actual opaque transaction scopes. Add assessment/command/snapshot migration. Real DB race, rollback, deactivation, immutable retry-version and preserved event/version tests. | Owning interview-session implementation, no generic K014 HTTP adapter or whole K010 state-machine feature. |
| 04 | Hints preparation integrated through owning session command service; durable exposure, first-exposure ladder/routing lock, exact next local ordinal and preserved latest assessment. Real DB distinct/same-key races, stale worker/reclaim, response-loss replay and fail-after-each-write rollback. | Depends01/03; reassessment never changes existing lock/history. |
| 05 | Actual service composition/security and canonical event/DTO contract tests; synthetic dataset/evaluator report, meaningful coverage and architecture checks. | HTTP/browser/voice and real-provider tests recorded as unavailable until actual prerequisites exist; do not write passing proxy tests for them. |
| 06 | Fresh coverage worker, full applicable verification, independent final review, speckit-converge and canonical handoff; draft stacked PR. | K019 stays open if HTTP/journey/provider acceptance unavailable; no fake feature Done. |

Use `tests/helpers/catalogue-publication.ts` and isolated migrated test databases
for real pack setup. Existing catalogue pinning integration tests demonstrate
instrumented `PoolClient` rollback injection and `pg_blocking_pids` barriers for
proving lock races; reuse the technique against actual new services. Tests may
seed permitted active Stage 6 stages directly but must label that fixture setup
and cannot claim navigation/progression acceptance from it. Migration tests cover
empty/repeated apply, existing published pins, missing-pin fail-closed, bounded
JSON and uniqueness/check constraints. Recheck next migration ordering at edit.

Required local evidence includes failed tests before implementation; positive and
negative outcome paths; mutation controls that fail if membership/fence/CAS/replay
or privacy checks are removed; SQL rollback after every domain write; session
lock before operation lock; precisely one event/version/exposure; safe redacted
errors; and no model call or transaction leak on rejected commands. Record exact
observed commands/counts and coverage branches in this document during execution.

Open acceptance gates remain full K010/011/013/014/016 journey integration,
K017 OpenAI T184, K018 applicable policy/session gates, reviewed calibration
profile/report (including production budgets/clarification policy), K029 voice,
and K028/K026 deployment/load. Same-stage internal persistence does not satisfy
missing clarification/advance behavior. No UI work or wireframe change is planned.


## 10. Accepted task decomposition (K-019)

This is the canonical task/requirements/dependency mapping; disposable tasks.md
mirrors these IDs and execution details. Kanban/CSV alone own project status.
T229 records the committed prerequisite merge. Every task below remains planned
until its actual evidence is recorded; GATED tasks require their owning upstream
acceptance. Independent reviewed custom checklist:32/32. Read-only analyze and
issue export follow this decomposition before implementation.

## Phase 1 — Group 00: Setup and planning gate

**K-019; dependency:** prerequisite merge T229 (8f40e13), reviewed canonical spec/plan/checklist

- [x] T230 Reconcile six audit fixes, ADR026, specification/clarification/plan/checklist/tasks/analyze and exact working pointer in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md; FR01–18; independent checklist32/32 must be reviewed, not generator selfapproval.
- [x] T231 Review group00 independently against canonical contracts, pack-schema.ts, ADR023/026 and generated tasks; resolve Critical/Important findings in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md before code.
- [ ] T232 Commit reviewed group00 documentation using header <US=shared, ID=T232, K=K-019, GROUP=00> and Why/Changes/Review/Validation/Limitations body; stage only authorized canonical docs, ADR register and project_management/kanban_board.md plus CSV. Record the commit/review reference in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.

## Phase 2 — Group 01: Foundational exact-pin content and reviewed routing

**K-019; dependency:** group00 planning/analysis gate

- [ ] T233 Write and observe failing unit and real PostgreSQL tests in tests/unit/hints-variants/routing.test.ts and tests/integration/problem-catalogue/assessment-context.test.ts for exact pins, missing/corrupt required arrays, empty-default rejection, multiple ladders, grant failures, independent review and immutable revision.
- [ ] T234 Add next unused migration under migrations/ for routing approvals, immutable revisions and current pointer with exact checksum/hash binding, author/reviewer/publisher provenance and indexed FK paths; enforce "Immutable approval; no seed exception inheritance" from data-model.md.
- [ ] T235 Implement narrow trusted matcher/selected-ladder projections in src/modules/problem-catalogue/application/assessment-context.ts and public.ts; exclude tests, hint prose and full steps from matcher input, verify immutable exact release checksum/schema, fail closed on malformed required data.
- [ ] T236 Implement strict deterministic routing selection and authorized review/install through src/modules/content-publishing/application/hint-routing.ts and public.ts; identified author plus distinct review_content reviewer and publish_content publisher, explicit approach→ladder choices and default, no author_content grant or ADR025 autoapproval.
- [ ] T237 Run red-to-green tests, typecheck and architecture checks, then obtain independent TypeScript/Postgres review for group01 and resolve Important findings; record commands/results in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.
- [ ] T238 Commit reviewed group01 production/tests/docs with <US=shared, ID=T238, K=K-019, GROUP=01> and required structured body; verify exact staged paths and retain unavailable public journey gates. Record the commit/review reference in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.

## Phase 3 — Group 02: US1 evidence-linked interpretation; US2 uncertainty; US3 unfamiliar reasoning

**K-019; dependency:** group01 exact-pin projection

- [ ] T239 [US1] Write and observe failing tests in tests/unit/approach-assessment/proposal.test.ts, evidence.test.ts and classify.test.ts for strict schemas, duplicate/unknown IDs, Unicode spans, unsupported evidence, nonfinite confidence, exact threshold/margin boundaries, ties and null candidate complexity.
- [ ] T240 [US1] Implement bounded schemas/evidence validation/single-pass classification and safe deterministic projection in src/modules/approach-assessment/domain/; enforce "reference is nonnull iff outcome=matched; null otherwise", "finite confidence" and bounded private evidence; do not fabricate numeric qualification defaults.
- [ ] T241 [US2] Write and observe failing ambiguity cases in tests/unit/approach-assessment/clarification.test.ts; implement reason codes preserving uncertainty in src/modules/approach-assessment/domain/classify.ts without claiming missing orchestration transitions.
- [ ] T242 [US3] Write failing novel/unmatched tests in tests/unit/approach-assessment/novel.test.ts and preserve interpretable unfamiliar reasoning without correctness claims; register approach_assessment together in src/modules/model-gateway/application/operations.ts, types.ts and validation.ts and expose typed operation through public.ts; test real fake-adapter dispatch under bounded existing Gateway attempts/deadline in tests/contract/approach-assessment/gateway.test.ts.
- [ ] T243 [US1] Write and observe failing tests then implement authorized nonmutating evaluator in src/modules/approach-assessment/application/evaluate.ts; invocation permitted while labels disabled only after existing active operator verification plus review_content grant through a narrow public authorization seam; reject ordinary candidates, caller booleans and production transcript/session input; accept reviewed synthetic/reviewer-authored fixtures only, with no session/assessment/exposure/turn/event/replay writes or qualification changes; cover tests/unit/approach-assessment/evaluate.test.ts.
- [ ] T244 [US1] Run focused semantic/Gateway tests and independent stack-aware review of group02, including US2 ambiguity and US3 unmatched examples and privacy canaries; record observed results in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.
- [ ] T245 [US1] Commit reviewed group02 with <US=US1, ID=T245, K=K-019, GROUP=02> and required Why/Changes/Review/Validation/Limitations body, distinguishing synthetic mechanics from real-provider quality. Record the commit/review reference in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.

## Phase 4 — Group 03: US1 durable assessment via minimum owning command foundation

**K-019; dependency:** groups01/02 actual approved interfaces

- [ ] T246 [US1] Write and observe failing migration/service integration tests in tests/integration/approach-assessment/commands.test.ts and tests/integration/migrations.test.ts for owned session admission, original-version retry, same-key replay, lost-response recovery, deactivation, fence/lease races and atomic rollback.
- [ ] T247 [US1] Add next unused migration under migrations/ for session snapshot additions and canonical session_command_operations, conversation turns and assessments: "unique owner/session/key", "bounded immutable normalized payload/hash/source version/stage/pin/reserved IDs", "finite lease and increasing fence", "Replay immutable"; preserve legacy exact-pin fail-closed treatment and immutable identity.
- [ ] T248 [US1] Implement minimum conversation-owned scoped committed-turn persistence in src/modules/conversation/persistence/turns.ts and public.ts and assessment-owned scoped persistence in src/modules/approach-assessment/persistence/assessments.ts; enforce "Reserved IDs become rows only at final commit" and unique session/operation, indexed session/result version.
- [ ] T249 [US1] Implement canonical admission/reclaim/failure bookkeeping in src/modules/interview-session/application/assessment-commands.ts and persistence/commands.ts; lock session→operation, authenticate active owner, replay before version checks, retain original payload/version/evidence/profile/context IDs, increment fencing token without rebasing fresh If-Match.
- [ ] T250 [US1] Implement actual assessment preparation/finalization composition in src/modules/approach-assessment/application/service.ts and src/modules/interview-session/application/assessment-commands.ts; no provider transaction, lock session→operation, guard snapshot CAS by original version/current fence/database clock lease before all dependent inserts, one event/version and immutable safe replay.
- [ ] T251 [US1] Prove real PostgreSQL one-winner412 races, expired/reclaimed stale worker rejection, per-write rollback and no network transaction leak in tests/integration/approach-assessment/commands.test.ts; independently review group03 using Postgres/TypeScript skills and record evidence in canonical engineering doc.
- [ ] T252 [US1] Commit reviewed group03 with <US=US1, ID=T252, K=K-019, GROUP=03> and structured body; describe prepared eligible-session fixtures honestly, retain K010–16/HTTP gates. Record the commit/review reference in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.

## Phase 5 — Group 04: US4 progressive durable help

**K-019; dependency:** groups01/03; group02 for preserved assessment tests

- [ ] T253 [US4] Write and observe failing unit/integration cases in tests/unit/hints-variants/next-hint.test.ts and tests/integration/hints-variants/exposure.test.ts for backend routing/default, first-exposure lock, local ordinals, empty/corrupt ladder failures and consumed nonempty ladder exhaustion.
- [ ] T254 [US4] Add exposure schema migration under migrations/ and scoped persistence src/modules/hints-variants/persistence/exposures.ts with "unique session/operation and session/ladder/local ordinal" and exact pin/hint/routing/turn/policy/result version; immutable ordered assistance history.
- [ ] T255 [US4] Implement src/modules/hints-variants/domain/next-hint.ts and application/service.ts through actual owning session command finalization; atomically lock selected ladder/routing hash at first exposure, reveal only canonical next hint after commit, never reset/switch or clear latest assessment ID/version.
- [ ] T256 [US4] Exercise real PostgreSQL races, response loss replay, original-version retry, lease reclaim/expiry, fail-after-each-write rollback, resume/reassessment lock retention and preserved assessment in tests/integration/hints-variants/races.test.ts; assert one event/version/exposure and412 concurrent loser.
- [ ] T257 [US4] Obtain independent TypeScript/Postgres review of group04 and run focused passing tests plus typecheck/architecture; record exact commands and limitations in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.
- [ ] T258 [US4] Commit reviewed group04 with <US=US4, ID=T258, K=K-019, GROUP=04> and structured body, without unreviewed seed routing publication or unavailable HTTP claims. Record the commit/review reference in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.

## Phase 6 — Group 05: Cross-cutting composition, security and meaningful coverage

**K-019; dependency:** groups01–04

- [ ] T259 Add actual service composition and canonical event/safe-DTO validators in tests/contract/assessment-hints.test.ts plus architecture ownership tests; enforce 4KiB event metadata and exactly one event/session version, no candidate private IDs/raw provider prose/future hint leakage.
- [ ] T260 Version reviewed synthetic cases and reproducible aggregate evaluator tests under tests/fixtures/approach-assessment/ and tests/contract/approach-assessment/evaluation.test.ts; report precision/coverage/abstention denominators and failure slices, never claim real-provider qualification.
- [ ] T261 Add branch-meaningful coverage config vitest.assessment.config.ts, package.json coverage:assessment and CI target as appropriate; cover forged evidence, private canaries, invalid proposal/provider/context failures, cross-user/account-deactivation paths, missing routing and stale completion.
- [ ] T262 Run relevant unit/integration/contract/architecture checks, review negative controls which fail if fence/CAS/replay/evidence/privacy guards removed, then obtain independent group05 review and record observed evidence in canonical engineering doc.
- [ ] T263 Commit reviewed group05 with <US=shared, ID=T263, K=K-019, GROUP=05> and structured body; separate synthetic format/mechanics evidence from quality/runtime/public journey acceptance. Record the commit/review reference in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.

## Phase 7 — Group 06: Coverage, convergence and draft handoff

**K-019; dependency:** group05

- [ ] T264 Assign fresh coverage/verification worker to run pinned focused and applicable broad checks plus coverage:assessment; inspect uncovered meaningful branches and remediate with TDD in owning production/tests paths, documenting exact passed/failed/skipped/unavailable results in canonical engineering doc.
- [ ] T265 Run speckit-converge against accepted four documents; reconcile actual gaps/task IDs into docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md and canonical Kanban/CSV; reconcile working artifacts to canonical or link-only at handoff.
- [ ] T266 Obtain independent final stack-aware review of all Stage6 changes and coverage evidence; resolve Critical/Important issues in owning files and reverify, document acceptance boundaries in canonical engineering doc.
- [ ] T267 Commit final reviewed group06 with <US=shared, ID=T267, K=K-019, GROUP=06> and structured body; verify no secrets, disposable working files, unrelated untracked skills or unreviewed content included. Record the commit/review reference in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md.
- [ ] T268 Prepare draft stacked PR from feature/approach-assessment-hints into feature/interview-orchestration with actual diff/review/test evidence and exact remaining gates; record PR link in docs/03_features/approach_assessment_hint_management/specifications/engineering/eng_design.md, never merge or auto-close K019.

## Phase 8 — Group GATED: External acceptance retained on owning dependencies

**K-019; dependency:** owning upstream acceptance, not internal test substitutes

These remain open acceptance gates; no failed test or checkbox can waive their prerequisites.

- [ ] T269 GATED on K010/011/013/014/016: implement and verify canonical public actions adapter/full created→Stage6 assessment/hints/retry/refresh journey in owning session/API/E2E paths only after upstream plans/acceptance; existing internal prepared-session service tests do not satisfy this task. Reference tests/e2e/assessment-hints.spec.ts in canonical engineering design.
- [ ] T270 GATED on K017T184/K018 and reviewed dataset/profile/budgets: execute authorized real OpenAI calibration/held-out evaluation through Gateway and approve qualified profile before enabling candidate labels; record exact model/profile/dataset fingerprints and precision/coverage in canonical engineering design.
- [ ] T271 GATED on K029 and deployment owners K028/K026: verify accepted-transcript/text parity, consent and committed TTS; production isolation/load/retention/recovery acceptance remains with owning feature documents and tests, referenced in canonical engineering design.

## Dependency graph and incremental strategy

`T229 → group00 → group01 → group02 → group03 → group04 → group05 → group06`.
US1 achieves internal evidence-linked assessment after group03; US2/US3 semantic outcomes are independently unit-testable in group02 but actual clarification/advance orchestration remains gated. US4 reaches real durable hints after group04 using eligible prepared-session fixtures. No MVP milestone or K019 Done is inferred from partial stories.

Parallel opportunities are test fixture preparation for disjoint US1/US2/US3 unit tests after schemas agree, and independent review/read-only issue export alongside implementation. They are examples, not permission for shared-file writers. US4 unit tests can be developed after group01 while group03 progresses only in isolated worktrees/coordinated ownership; common migration/session/public paths remain sequential.

## Verification commands

Use `/tmp/catalogue-node-runtime/node-v24.22.0-linux-x64/bin` first on PATH and APP_ENV=test. Focused command paths become runnable when tests exist: `npm test -- tests/unit/approach-assessment tests/unit/hints-variants tests/integration/approach-assessment tests/integration/hints-variants tests/contract/assessment-hints.test.ts`. Run actual isolated PostgreSQL integration tests with documented service configuration (never print connection strings); no passing DB mocks substitute. Broaden to `npm run typecheck`, `npm run lint`, `npm run check:architecture`, appropriate existing tests, build and coverage after production changes. Exact observed output belongs in canonical engineering evidence.

No UI implementation or new skill/package installation. HTTP/browser/voice and provider qualification tasks stay unavailable until actual owning prerequisites exist. All GitHub issues are derived exports of this K019 plan, deduped by feature and ID; no automatic issue closure/status from checkboxes.


## 11. Derived GitHub task export — 2026-10-25

The owner explicitly requested `$speckit-taskstoissues` for this feature. After
the fresh consistency reanalysis reported no remaining findings, all 42 tasks
T230–T271 were exported only to the verified origin repository
`Gyan172004/my-new-system`. Fresh all-state deduplication found no existing
feature-scoped matches or task-ID collisions. Sequential structured GitHub API
creation completed with exit 0; the resulting ledger was checked for 42 unique
IDs/numbers, exact repository URLs and correspondence with the current canonical
task text, including the corrected T240 nullability and T243 operator restrictions.
No task or feature issue was closed. No status is maintained in this mapping:
the canonical Kanban and aligned CSV remain authoritative; T269–T271 retain their
external acceptance gates. No runtime or feature completion is established by
issue creation.

| Task | Derived issue | Task | Derived issue | Task | Derived issue |
| --- | --- | --- | --- | --- | --- |
| T230 | [#229](https://github.com/Gyan172004/my-new-system/issues/229) | T231 | [#230](https://github.com/Gyan172004/my-new-system/issues/230) | T232 | [#231](https://github.com/Gyan172004/my-new-system/issues/231) |
| T233 | [#232](https://github.com/Gyan172004/my-new-system/issues/232) | T234 | [#233](https://github.com/Gyan172004/my-new-system/issues/233) | T235 | [#234](https://github.com/Gyan172004/my-new-system/issues/234) |
| T236 | [#235](https://github.com/Gyan172004/my-new-system/issues/235) | T237 | [#236](https://github.com/Gyan172004/my-new-system/issues/236) | T238 | [#237](https://github.com/Gyan172004/my-new-system/issues/237) |
| T239 | [#238](https://github.com/Gyan172004/my-new-system/issues/238) | T240 | [#239](https://github.com/Gyan172004/my-new-system/issues/239) | T241 | [#240](https://github.com/Gyan172004/my-new-system/issues/240) |
| T242 | [#241](https://github.com/Gyan172004/my-new-system/issues/241) | T243 | [#242](https://github.com/Gyan172004/my-new-system/issues/242) | T244 | [#243](https://github.com/Gyan172004/my-new-system/issues/243) |
| T245 | [#244](https://github.com/Gyan172004/my-new-system/issues/244) | T246 | [#245](https://github.com/Gyan172004/my-new-system/issues/245) | T247 | [#246](https://github.com/Gyan172004/my-new-system/issues/246) |
| T248 | [#247](https://github.com/Gyan172004/my-new-system/issues/247) | T249 | [#248](https://github.com/Gyan172004/my-new-system/issues/248) | T250 | [#249](https://github.com/Gyan172004/my-new-system/issues/249) |
| T251 | [#250](https://github.com/Gyan172004/my-new-system/issues/250) | T252 | [#251](https://github.com/Gyan172004/my-new-system/issues/251) | T253 | [#252](https://github.com/Gyan172004/my-new-system/issues/252) |
| T254 | [#253](https://github.com/Gyan172004/my-new-system/issues/253) | T255 | [#254](https://github.com/Gyan172004/my-new-system/issues/254) | T256 | [#255](https://github.com/Gyan172004/my-new-system/issues/255) |
| T257 | [#256](https://github.com/Gyan172004/my-new-system/issues/256) | T258 | [#257](https://github.com/Gyan172004/my-new-system/issues/257) | T259 | [#258](https://github.com/Gyan172004/my-new-system/issues/258) |
| T260 | [#259](https://github.com/Gyan172004/my-new-system/issues/259) | T261 | [#260](https://github.com/Gyan172004/my-new-system/issues/260) | T262 | [#261](https://github.com/Gyan172004/my-new-system/issues/261) |
| T263 | [#262](https://github.com/Gyan172004/my-new-system/issues/262) | T264 | [#263](https://github.com/Gyan172004/my-new-system/issues/263) | T265 | [#264](https://github.com/Gyan172004/my-new-system/issues/264) |
| T266 | [#265](https://github.com/Gyan172004/my-new-system/issues/265) | T267 | [#266](https://github.com/Gyan172004/my-new-system/issues/266) | T268 | [#267](https://github.com/Gyan172004/my-new-system/issues/267) |
| T269 | [#268](https://github.com/Gyan172004/my-new-system/issues/268) | T270 | [#269](https://github.com/Gyan172004/my-new-system/issues/269) | T271 | [#270](https://github.com/Gyan172004/my-new-system/issues/270) |
