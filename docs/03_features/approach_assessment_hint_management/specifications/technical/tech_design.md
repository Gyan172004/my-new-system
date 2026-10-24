# Stage 6 — Approach Assessment and Hint Management: Technical Design

**Date:** 2026-10-24. **Status:** Proposed implementation design; no feature code
or acceptance claimed. **Owner:** K-019, Stage 6 / W8.
Read [requirements](../../requirements/feature_req.md),
[engineering design](../engineering/eng_design.md), and
[pseudocode](../../pseudo_code/logic_and_state.md) together.

## 1. Architecture and constitution check

Use the existing trusted TypeScript/Next.js Node application, PostgreSQL/`pg`,
explicit migrations, Zod, immutable DTOs and `public.ts` module boundaries.
ADR-003–008 govern backend state, hybrid reasoning, versioned evidence and
abstention. ADR-012 governs provider routing; ADR-015/019 govern provenance and
retention. No service split, vector database, embedding search, direct provider
SDK, new queue or new scoring policy is needed for this bounded reference set.

The constitution check before and after design preserves canonical authority,
execution isolation, backend policy, ownership, contract integrity, test-first
engineering and Kanban ownership. Dependency and calibration gates stay explicit;
this document does not waive them. ADR-026 records the owner-approved default routing and exposure lock; earlier privacy/content-governance decisions remain binding.

```text
Existing action / accepted voice transcript adapter
  -> identity admission -> interview-session command owner
     -> conversation evidence / orchestration policy
     -> problem-catalogue trusted pinned-context interface
     -> approach-assessment -> model-gateway (outside transaction)
     -> hints-variants deterministic next-hint plan (no provider)
     -> guarded shared transaction via owning public interfaces
        snapshot + one command event + turns + assessment OR exposure + replay
  <- candidate-safe InterviewSession, ETag and committed latestTurn
```

`approach-assessment` validates and interprets proposals; `hints-variants` selects
the next eligible hint. Neither writes another module's repository, commits a
session transition independently, or selects a new pack. The existing
`interview-session` owner coordinates one transaction using
`src/server/transaction.ts` and opaque transaction scopes. Domain-owned write
services join that scope. Orchestration remains the policy owner; Stage 6 supplies
assessment/hint decisions and guard inputs, never an arbitrary `nextStage` setter.

## 2. Public HTTP and event compatibility

Keep `POST /api/v1/interview-sessions/{sessionId}/actions` with canonical
`SubmitActionRequest`, `Idempotency-Key`, quoted decimal `If-Match`, and the
`InterviewSession`/`ETag` response. Stage 6 adds no `/assess` or `/hints` endpoint.
The baseline defines paths relative to the `/api/v1` server prefix.

| Input/result                                         | Mapping                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `candidate_response`                                 | Existing conversation payload validator supplies bounded reasoning; candidate does not send assessment fields. Preserve the owning K-014 payload definition. |
| `request_hint`                                       | Payload `{}`; reject client-supplied index, ID, text, ladder, next state or confidence. Only active `hints` sessions with next eligible content admit it.    |
| `continue`, `retry_current_action`, `resume`         | Existing orchestration/session semantics; no bypass of stage, evidence, hint or ownership guards. A new key is a new action, not a replay.                   |
| Accepted command                                     | `200`, safe snapshot and quoted resulting version ETag; released hint is the persisted interviewer `latestTurn.text`.                                        |
| Malformed envelope / payload                         | Existing `400` / `422` distinction; no side effects.                                                                                                         |
| Authentication/ownership                             | Existing `401`/`403`/safe `404` mapping; check ownership before reading replay results.                                                                      |
| Wrong lifecycle/stage, hint exhaustion, key mismatch | `409`; session unchanged.                                                                                                                                    |
| New command with stale expected version              | `412`; no assessment/exposure commit.                                                                                                                        |
| Admission limit                                      | `429`; no provider invocation.                                                                                                                               |
| Dependency/provider failure                          | `503`; stage/version/cursor unchanged; safe same-key retry.                                                                                                  |

Canonical event types already include `interview.approach_assessed` and
`interview.hint.exposed`. Use the existing envelope/schema version and all required
`SessionEventPayload` fields (`sessionId`, internal `userId`, `sessionVersion`,
`problemId`, pinned `problemPackVersion`). Include safe stage/action/result/turn
metadata and IDs for the assessment or exposure, policy revision and hint ordinal
where applicable. No prose, reference solution or hidden data in these events.
The generic payload currently permits these extra metadata fields; this design
does not narrow its global schema or invent a new canonical event type.

The current session prerequisite has **unique `(session_id, session_version)`**.
Retain one event per accepted command: assessment or exposure is that event, with
transition and accepted-turn metadata included. Do not additionally append a
candidate-response or transition event at the same version. A future richer
event model requires coordinated K-011 design/migration, not a Stage 6 workaround.
Async publication is not required for the synchronous slice. If an actual async
consumer is added, commit an outbox entry in the same transaction under ADR-011.

Compatibility impact: action/voice adapters, session owner, conversation,
catalogue, Model Gateway, feedback/history and event consumers need matching
contract tests before implementation acceptance. No canonical API/event edits
are needed for the currently specified wire shape. Strict new externally consumed
payload schemas or additional fields/endpoints require an impact-reviewed
canonical contract change and producer/consumer tests together.

## 3. Trusted content and evidence interfaces

Proposed narrow immutable interfaces, to implement only after prerequisite review:

| Owning public interface                 | Input                                                               | Output / restrictions                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue `readPinnedAssessmentContext` | Authorized internal session context, exact problem/version/checksum | Reference IDs, names, bounded summaries, preconditions and matching features. Excludes full steps/correctness solutions, all hints, tests, expected outputs and review notes. |
| Catalogue `readPinnedHintLadder`        | Same trusted pin and selected ladder ID                                                    | Reviewed ordered hints with ID, ordinal, text, eligibility rule and paraphrase flag; backend only, never a browser DTO.                                                       |
| Conversation `readAssessmentEvidence`   | Owner-checked session and expected version/operation                | Bounded selected candidate turns and stage/modality metadata; excludes other users, future turns and unrelated personal/profile data.                                         |
| Assessment `prepareAssessment`          | Operation-bound evidence, private context, qualified profile        | Validated internal assessment proposal or typed dependency/validation failure; no state writes.                                                                               |
| Hints `prepareNextHint`                 | Snapshot cursor, pinned reviewed ladder, active stage/status        | Exactly one exposure plan or typed ineligible/exhausted failure; no model call.                                                                                               |
| Session `finalizeCommand`               | Owner, expected version, lease fencing token and internal decision  | Atomic owning-domain writes plus safe response/replay artifact.                                                                                                               |

These methods **do not exist yet** in this checkout. The current catalogue exposes
candidate list/detail, publication installation and resolution for new sessions;
those cannot substitute for a private pinned assessment/hint context. Add the
smallest backend-only projections in the catalogue owner; never export a full pack
getter, reach into content-publishing internals or repin through the new-session
resolver. Deprecation for new sessions does not invalidate an existing pin.

Pack schema v1 requires nonempty `approaches`, nonempty `hintLadders`, and
nonempty hints in every ladder. Each ladder has `{id, approachId, hints}`;
ordinals are local to that ladder. The published Two Sum seed has `hash-hints`
for `one-pass-hash` (4 hints) and `sorting-hints` for `sort-two-pointers` (3 hints).
Do not flatten these into a single cursor or add a pack-schema field silently.
Missing/empty required arrays, bad associations, checksum drift or malformed
hints are dependency failures. A valid proposal's empty `matches` array is
allowed and is distinct from corrupt required content.

A backend-only immutable reviewed routing manifest is keyed by exact
`(problemId, packVersion, packChecksum)` and its own revision/hash. It names one
`defaultLadderId` and explicit `approachId -> ladderId` selections for approaches
with ladders. Selections must belong to that approach; if multiple ladders exist,
an explicit reviewed choice is required, never iteration order. For an unmatched
assessment or a matched approach with no associated ladder, select the default.
Missing manifest/default, absent selection for an approach with ladders, or an
invalid target fails closed (`503`) without exposure. No new pack version is
inferred; the manifest references only existing reviewed ladders.

Treat routing as reviewed content configuration: an identified active author supplies provenance; a distinct active `review_content`
reviewer approves exact
checksum, all routes/default, provenance and revision/hash before installation
by `publish_content` staff under ADR-020/023. The seed self-review exception in
ADR-025 does not automatically approve this new routing artifact. Keep approval
and runtime route objects immutable and backend-only; no candidate write API or
private IDs/text in candidate DTOs. Revisions cannot alter a session's locked
selection; retain and load its original immutable routing revision/hash. See ADR-026 for the approved selection/lock semantics.

Evidence references resolve to canonical session turn IDs, optionally with
Unicode-code-point ranges `[start,end)` and an exact bounded excerpt. Validate
session, speaker=candidate, allowed stage, revision, range and excerpt equality.
The current command may use a reserved candidate turn ID in its operation; it
becomes a committed turn only in the successful finalization transaction. Model
claims cannot cite arbitrary or merely plausible IDs. Do not rerun a whole-session
scan; load the bounded evidence set by identifiers/version. Unresolvable or
discarded-turn evidence is invalid.

## 4. Model proposal and deterministic assessment

Register a versioned `approach_assessment` operation in the Model Gateway.
ADR-012's configured model mapping applies (`gpt-6.1-sol` in this baseline).
No automatic model upgrade/escalation is introduced. Provider/prompt/rubric
changes require a newly qualified profile, not a silent config edit.

Strict internal proposal fields:

- `schemaVersion`, operation name, bounded candidate summary.
- Zero or more bounded candidate matches `{referenceId, confidence,
evidenceRefs[]}`; IDs unique, confidence finite in `[0,1]`.
- `interpretation`: `understood`, `incomplete`, `conflicting`, or `uninterpretable`.
- Evidence-linked findings classified `plausible`, `gap`, `contradiction` or
  `unknown`; each has bounded claim and supporting source references.
- `missingEvidence[]`; candidate-stated time and auxiliary-space claims with
  their evidence, or null when unstated.

This refines the policy's illustrative example; it is an internal operation DTO,
not an API payload. Zod and allowlists reject unknown fields, wrong versions,
oversized arrays/prose, invalid IDs, evidence and nonfinite/out-of-range values.
Delimiter instructions do not make prompt injection safe; field selection,
output validation and deterministic projection enforce the boundary.

Compute the top two scores in one pass; no sorting or embedding search.
Let `tau` be the qualified minimum confidence and `delta` the qualified minimum
lead over the runner-up (score zero if absent). A reference label requires
`top >= tau`, `top - runnerUp >= delta`, `top > runnerUp`, sufficient verified
evidence, `understood` interpretation and no unresolved material contradiction.
Ties always abstain from labeling. An explicit zero-reference proposal cannot
become a match. Score arithmetic follows a documented fixed comparison policy in
the versioned profile and is tested exactly at boundaries.

| Evidence/proposal state                                                    | Persisted outcome and nullable match                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| All match gates pass                                                       | `matched`, top pinned reference ID                                       |
| Incomplete/conflicting interpretation, tie or insufficient lead            | `ambiguous`, null; targeted clarification                                |
| Understood reasoning, no proposed reference, valid evidence                | `novel`, null; open-ended reasoning assessment, no correctness guarantee |
| Low confidence, insufficient evidence, empty proposed candidates with insufficient interpretation, or unqualified policy | `abstained`, null with explicit reason                                   |
| Malformed, unsafe or unresolvable output                                   | Operation failure, **no successful assessment**                          |

Apply invalid-output checks before this outcome table. An unfamiliar but
understood explanation can be novel; an empty or unintelligible message cannot.
Store reported confidence separately from accepted labeling and reasoning quality.
A matched brute-force approach may be plausible but suboptimal; a matched family
can still contain a correctness gap. Candidate complexity claims remain claims;
do not infer a measured bound from a reference or hallucinate a proof.

The qualification profile contains immutable ID/hash, `tau`, `delta`, evidence
sufficiency rules, score comparison policy, reviewed dataset/report references,
model/prompt/rubric versions, positive context/output/token limits, total deadline,
attempt/repair limits and admission/cost budgets. K-017/K-018 own compatible runtime
budgets and clarification limit. No numeric threshold, margin or quality operating
point is approved here. A separate authorized evaluation entry point calls the real Gateway, validates and classifies against a candidate calibration profile without a session command or any domain writes, even while labels are disabled. It reports proposed labels/metrics only to restricted evaluation output and cannot alter production qualification. Candidate command paths remain guarded by label qualification. Missing qualification disables labels; invalid budget
configuration disables provider invocation. Retain deterministic clarification/
abstention in test mode; do not claim it qualifies semantic production assessment.

## 5. State and hint rules

| Stage/status                    | Stage 6 behavior                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active `initial_approach`       | Assess response; ambiguous reasoning proposes `approach_clarification`; sufficiently understood reasoning proceeds only under owning policy to `code` or hint discussion. Entry into `hints` alone exposes nothing. |
| Active `approach_clarification` | Assess new evidence; owning policy selects `initial_approach` or `code`, or bounded same-stage clarification. On reaching its cap, use open-ended policy; no forced match.                                          |
| Active `hints`                  | `request_hint` exposes next eligible ordinal; `candidate_response` discusses already exposed help; `continue` can go to `code` under owning policy. No implicit new hint.                                           |
| Active `improve_approach`       | Reassess revised explanation when owning policy enables it; never reset prior assistance.                                                                                                                           |
| Other stage/status              | No Stage 6 mutation; honor existing resume/cancel/terminal policy.                                                                                                                                                  |

Snapshot `selectedLadderId` is null until first committed exposure; `hintCount` starts at zero and represents committed exposures for
this session/pinned locked ladder. Select from the reviewed manifest using the latest committed assessment only while unlocked. Atomically lock ladder ID and routing revision/hash with the first exposure; later matches cannot change it. For the next
request require `0 <= hintCount < H`, select ordinal `hintCount + 1`, validate
exact pack rule and prepare canonical text. The accepted command commits one
exposure, one interviewer turn and `hintCount + 1`. Use canonical text even when
`paraphraseAllowed=true`; that permission does not require model paraphrasing.
There is no need to risk invented stronger hints. Never cache a shared mutable
cursor across sessions or trust a client-provided ordinal.

## 6. Persistence and atomic command protocol

Proposed data additions (design only; preserve the existing session schema owner):

| Record                     | Fields / constraints / access                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ApproachAssessment         | UUID identity consistent with existing records; session ID, reserved/committed candidate turn ID, command operation ID, source/result session versions, pack ID/version/checksum, nullable reference ID, outcome, reported confidence, bounded summary/findings/missing evidence/complexity claims, evidence references, evaluator/schema/policy/rubric/prompt/model/profile versions and timestamps. Match ID is nonnull iff outcome=`matched`; confidence null or finite `[0,1]`. Unique session/operation; index `(session_id, result_session_version)`. |
| HintExposure               | UUID ID, session ID, operation ID, pinned pack/version/checksum, ladder ID, hint ID/positive ladder-local ordinal, routing revision/hash, interviewer turn ID, committed version, timestamp and policy version. Unique `(session_id, operation_id)` and `(session_id, ladder_id, ordinal)`; index is usable for ordered reads.                                                                                                                                                                                                                                                                                        |
| Snapshot additions         | Nullable locked selected ladder ID and routing revision/hash, nonnegative local hint count, and latest assessment ID/version reference in the owning bounded state representation. No full pack, provider output or transcript duplication.                                                                                                                                                                                                                                                                                                                                                                                      |
| Planned canonical command operation | Owner/session/key, canonical request hash, original expected version, status, reserved evidence ID, context/profile hash, lease expiry, monotonically increasing fencing token, replay result/ETag. Implement the reusable mechanism in the session owner while K-013 is absent; later K-013 must reuse it, never create a second idempotency table.                                                                                                                                                                                                                                                                                 |

Use parameterized queries, bounded JSON payloads and explicit uniqueness/check
constraints. Foreign keys within the owning domain follow existing conventions;
cross-domain pack/turn references are validated through owning services and
atomic transaction scope. Do not mutate catalogue tables to add reference labels.
Reads retain owner/session predicates; possession of an assessment ID grants no
access. History reads page through indexed versions, never load all evidence.

Admission transaction: verify active owner, resolve existing key before checking
new-command If-Match, validate stage/status/payload and claim an operation lease.
No session version bump or candidate turn commit occurs for that reservation.
Same in-flight key joins/waits within request budget or returns safe retryable
unavailability; it never starts unlimited duplicate provider calls.

Release the transaction, assemble bounded context, call the gateway if needed,
validate and build an internal decision. Finalization opens a short transaction,
rechecks owner/activity, same key/hash, lease fencing token, original version,
stage, pin, context/profile hash and hint cursor. Recheck replay first.
All transactions lock the session row first, then its operation row (`FOR UPDATE`), including admission/reclaim/cancel/finalize; recheck fences and original source version under those locks. Perform the guarded snapshot CAS before dependent exposure/assessment inserts and require exactly one row. The CAS also predicates the current operation token/lease, with lease validity checked at its write linearization point using database clock time. Hold locks through commit; a reclaim cannot interleave after a fence check. Concurrent distinct-key losers acquire the session lock after the winner and return `412` before inserts; uniqueness is a backstop, not a `503` conflict policy. Then write one event,
turns and replay artifact, then commit. Return only the committed projection.
Neither provider latency nor external network calls hold database locks.

Expired operations retain original source version/stage/pin, normalized payload, reserved evidence ID and context/profile fingerprints. Retry headers never rebase them: compare current session to the stored original source version, not incoming If-Match. Reject stale original work with `412` even if retry presents a fresh version. Preserve fingerprints after preparation; changed inputs require a new logical key. Expired operation leases may be reclaimed under the same key/hash with a new
fencing token. An old completion cannot finalize after reclaim, cancellation or
a conflicting command. Crash before commit rolls back all domain effects; crash
after commit replays. A retryable `503` is not stored as a final successful replay;
the same logical command may retry safely. Preserve original request hashing and
version semantics, excluding transport/correlation-only data per K-013.

## 7. Candidate projection, privacy and recovery

Do not expose raw semantic summaries/findings directly: their free text may repeat
private matching context. Persist them with restricted evidence access and use
deterministic candidate-safe templates for uncertainty/gap questions and neutral
acknowledgment. Templates can quote only validated candidate-authored excerpts;
they never interpolate reference names, matching features, scores or private IDs.
Hint-only snapshot updates explicitly preserve `latestAssessmentId/version`; assessment commands alone replace them. Hints use only the single exposed canonical hint text. Any later model-worded
candidate output needs a separately reviewed disclosure validator/operation.

This sacrifices expressive automated feedback in the initial slice to make the
disclosure boundary testable. Detailed evidence-backed feedback remains K-023.
No public numeric confidence dashboard or penalty is created from the wireframe.

Use the existing voice contract: accepted transcript becomes candidate evidence;
transcription failure commits no reasoning assessment; speech reads committed
safe interviewer text, never trusted matcher context. Execution outcomes come
only from the trusted evaluator; Stage 6 never manufactures execution facts.

Assessment/exposure/operation artifacts follow session retention (365 days),
subject to existing deletion/backup-expiry rules. Do not keep raw provider blobs
or duplicate candidate prose in logs. Metrics use bounded reason codes, latency,
usage, retries, conflict/fallback counts and profile versions; no user/session ID
as a metric label. Correlation/operation IDs belong in restricted telemetry.

## 8. Integration and enablement gates

Before each authorized independent slice, review the four documents and custom
checklist and verify its concrete dependencies and bounded runtime limits. Full
HTTP/journey integration additionally requires the owning payload/transition and
clarification policy; independent same-stage persistence cannot waive those gates. Before enabling reference labels, complete the
reviewed calibration operating point/report. Before acceptance, pass the tests,
failure controls and real-provider evaluations in engineering §5–7. Before public
release, retain ADR-022's T034/K-028 and K-026 gates. No frontend, provider or cloud
acceptance is established by this design.


## 9. Branch-local implementation boundary and concrete seams

The owner authorized independent K-019 development after prerequisite merge
`8f40e13` (catalogue `8571cbf` + orchestration `a3e71df`). Existing Gateway
`ModelGateway.invoke` and orchestration `applyPolicy`/`proposeTurn` are available;
K-017/K-018 retain their OpenAI/session-integration gates. No generic session
command mechanism or conversation persistence exists yet. Implement the minimum
canonical mechanism in the owning modules; later K-013/K-014 reuse it rather than
create a second Stage 6 idempotency store. Do not expose a second command API.

- Catalogue adds backend-only exact-pin projections via its own read repository;
  read sealed `catalogue_releases.interview` with stored checksum, validate the
  required private projection and association rules, and reject checksum mismatch.
  Do not query the current-release pointer or require current new-session eligibility.
- Content publishing owns immutable routing reviews and publication commands.
  Reuse `PublishingIdentity`, `createOperatorVerifier` internally and configured
  `review_content`/`publish_content` grants. Author identity is provenance, not a
  new grant. Approval binds author/reviewer, exact pack checksum, routing hash and
  permission revision/digest. Reviewer must differ from author. The publisher
  rechecks active identities/grants and exact approved bytes in one transaction.
  Catalogue installs/reads immutable routing revisions and a checksum-scoped
  current revision pointer. No seed routing is silently preapproved.
- Gateway extends `EnabledOperation`, `OperationInput`, `OperationOutput`, strict
  definition enum, canonical registry and provider contract tests together for
  `approach_assessment`. Inherit existing bounded transport limits as a local
  runtime ceiling; this does not approve semantic thresholds or production budgets.
  Candidate labels remain disabled until a separately reviewed profile qualifies.
- Assessment owns strict private proposal/evidence validation, single-pass
  classification, safe templates, preparation and nonmutating evaluator. Its
  public persistence writer joins `TransactionScope`; it does not own commit.
- Hints owns deterministic route/ladder validation and one-hint preparation plus
  scoped exposure persistence. Its result is internal and cannot be returned
  before the session owner commits.
- A minimal conversation module owns bounded candidate/interviewer turn records,
  evidence reads and scoped insert service. Session commands reserve candidate
  turn IDs during admission; the turn commits only with the successful decision.
- Interview-session owns `admitAssessmentCommand`/`admitHintCommand`, fenced
  preparation binding, `finalizeAssessmentCommand`/`finalizeHintCommand` and replay.
  Trusted composition builds decisions through assessment/hint public services;
  callers cannot submit arbitrary next state, text, IDs or scores. No public
  arbitrary-finalize capability is exported. This bounded internal command seam
  supports existing permitted Stage 6 stages and same-stage persistence; generic
  progression, clarification cap and HTTP actions remain owning prerequisite work.

Use additive revision `1792800000000_assessment_hints.sql` if it remains the next
unused migration at implementation. New owning tables: `session_command_operations`,
`conversation_turns`, `approach_assessments`, `hint_exposures`,
`content_hint_routing_reviews`, `catalogue_hint_routing_revisions` and
`catalogue_hint_routing_current`. Table names are implementation ownership, not
new public contracts. Add typed snapshot columns for checksum, locked ladder,
routing hash, count and latest assessment ID/version; do not overload candidate
`context` JSON. Exact checksum is resolved from the immutable existing pin before
admission and preserved thereafter. Backfill only from authoritative sealed
releases and reject missing/ambiguous pins before enabling commands.

`session_command_operations` uniquely keys `(owner_id, session_id, idempotency_key)` and
preserves original normalized action payload/hash, source version/stage/pin,
reserved turn ID, context/profile binding and monotonic fence. Exclude If-Match
and transport correlation IDs from logical payload hash; If-Match is a new-command
precondition, never a retry rebasing input. Every command/reclaim/failure path
locks the session row then operation row. Successful replay is immutable.

Typed outcome failures use transaction-domain aborts so rollback preserves `412`
versus `409` versus dependency failure. The existing session repository's generic
catch-all transaction wrapper is unsuitable for these new commands; use the
existing `createTransactionRunner` and retain original APIs unchanged. Snapshot
CAS predicates operation ID/fence/lease with `clock_timestamp()` at the write,
then all assessment/exposure/turn/event/replay writes share the opaque scope.
No provider call occurs inside a scope. Cross-domain references validated through
owning scoped services must not introduce an immediate FK that makes CAS-before-
insert impossible; use a reviewed deferred constraint or explicit owning-service
validation for such references. Index all actual FK lookup paths and use unique
session/version event and session/ladder/ordinal exposure constraints as backstops.

Real PostgreSQL tests may construct already-active Stage 6 session fixtures;
this proves the actual command service, not transition journey acceptance. No
fixture-only commit function substitutes for production finalization. HTTP action
adapter, full state progression/resume browser flow, accepted voice transport,
reviewed real-provider calibration and deployment/load remain explicit unavailable
gates until their owners supply them. Pure orchestration cannot qualify those gates.

Evaluation authorization refinement: compose the isolated evaluator with the existing active verified operator and `review_content` grant through a narrow content-publishing public authorization seam. Authenticate and verify the configured grant on each invocation; a caller-supplied boolean/caller object never establishes authorization. Accept only reviewed synthetic/reviewer-authored fixture and exact pack context; reject ordinary candidates and production transcript/session input. Evaluation performs no candidate-session writes or qualification update.
