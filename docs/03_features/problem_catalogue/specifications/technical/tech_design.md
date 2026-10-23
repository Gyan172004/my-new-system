# Problem Catalogue and Immutable Problem Packs — Technical Design

**Status:** Reviewed implementation passes local code acceptance; genuine seed and external release gates remain pending.  
**Feature:** 3. **Kanban:** K-007–K-009. **Date:** 2026-10-22.
**Reconciled:** 2026-10-23 following owner acceptance of the audit recommendations.  
**Behavior:** [requirements](../../requirements/feature_req.md).

## 1. Design in one view

```text
Offline research → authored pack → validation → independent review
                                                ↓
                                  authorized seed publication
                                                ↓
                            immutable PostgreSQL release + audit/event
                                                ↓
                 candidate-safe catalogue reads / trusted exact-version reads
```

Use the existing TypeScript/Next.js modular monolith, `pg`, explicit SQL
migrations, shared database lifecycle and safe request telemetry. No new
framework, database platform, cloud resource, ORM or LLM dependency is needed.

| Owner                | Responsibility                                                                   |
| -------------------- | -------------------------------------------------------------------------------- |
| `problem-catalogue`  | Published release storage, candidate projections and version resolution          |
| `content-publishing` | Pack validation, revision-bound reviews, publication and withdrawal              |
| `content-pipeline`   | Future offline collection/enrichment; no runtime dependency now                  |
| `identity-profile`   | Existing verified caller identity; content staff grants follow ADR-023           |
| `interview-session`  | Owns actual internal pin creation now; command idempotency and HTTP follow later |

Cross-module imports target `public.ts` only. Public services return immutable
data objects, not repositories, connection pools or mutable storage records.
The publisher calls a narrow catalogue installation interface; it does not write
another module's tables directly.

## 2. Pack structure and validation

Use a data-only JSON authoring format. The proposal is a bundle with four
explicit sections: `candidate`, `interview`, `evaluation` and `provenance`, plus
identity, schema version and content version. Review records are separate from
the content they approve. Section names are authoring fields, not additions to
the public HTTP response.

| Section    | Main fields                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity   | `problemId`, `slug`, `version`, `schemaVersion`, `authorId`                                                                                       |
| Candidate  | `title`, `difficulty`, `topicTags`, `statement`, `constraints`, `examples`                                                                        |
| Interview  | Clarifications/invariants; reference approaches; mistakes; hint ladders; follow-ups; variants; versioned rubric and exposure rules                |
| Evaluation | Immutable suite ID/version; cases with category, visibility, input/expected-output data and validation evidence; named checker/reference metadata |
| Provenance | Source URLs/types/retrieval times, transformation notes and rights-review references                                                              |

Every nested object rejects unknown fields. K-007 implements the selected
schema profile below as a strict runtime schema. IDs are unique within their
entity collection; hint IDs are unique across all ladders in one pack. A
reference is resolved in its declared namespace, never by a global name guess.
Approach IDs are aids, not an exhaustive list of valid solutions. Hint ordinals
start at 1 and are contiguous within each ladder.

Selected version-1 field profile (the structured Two Sum draft illustrates the
shape; it is not itself a schema or an approved pack):

| Record             | Fields / rules                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top level          | Exactly `problemId`, `slug`, `version`, `schemaVersion`, `authorId`, `candidate`, `interview`, `evaluation`, `provenance`; published author ID is a verified internal UUID; null is a draft-only marker rejected by publication validation |
| Candidate          | Exactly title, difficulty, topicTags, statement, constraints, examples; examples have input/output strings and optional explanation; canonical difficulty enum applies                                                                     |
| Interview          | clarifications, invariants, approaches, mistakes, hintLadders, followups, variants, rubric, exposureRules; all required                                                                                                                    |
| Clarification      | id, question, answer                                                                                                                                                                                                                       |
| Approach           | id, name, summary, steps, preconditions, correctness, complexity (`time`, `extraSpace` strings), tradeoffs, matchingFeatures, requiredKnowledge                                                                                            |
| Mistake            | id, summary, whyIncorrect, `approachIds[]`, `testCaseIds[]`; validate every member of both reference arrays                                                                                                                                |
| Hint ladder / hint | Ladder: id, approachId, hints; hint: id, ordinal, text, intendedConcept, eligibilityRule, paraphraseAllowed                                                                                                                                |
| Follow-up          | id, question, skill, expectedAnswerPoints, evaluationGuidance, approachIds, eligibilityRule, sourceReferences, authorshipNote, reviewStatus (`pending` or `approved`)                                                                      |
| Variant            | id, changedContract, skill, approachIds, complexityGuidance, executable, reasoningOnlyReason, reviewStatus; version 1 requires executable=false and a nonempty reasoningOnlyReason                                                         |
| Rubric             | version, dimensions (id, strong, partial, incorrect), scoringPolicy; qualitative guidance only                                                                                                                                             |
| Exposure rules     | candidateFields (exact candidate-property allowlist), hints, followups, assessment; explanatory text cannot override backend policy                                                                                                        |
| Suite manifest     | suiteId, version, checkerId, inputProfileId, inputShape, outputShape, comparisonRule, caseIds, checkerImplementationStatus                                                                                                                 |
| Case               | id, category, visibility, input, expectedOutput, rationale, validationEvidence (dataCheck, checkedOn, sourceReferences, humanReviewStatus)                                                                                                 |
| Provenance         | sources (id, sourceType, name, receivedOn, sha256), externalReferences (url, relationship), transformationNotes, rightsReview (status, evidence), sourceCoverageStatus; URLs are references, never fetched during validation               |

All listed strings/arrays are required and bounded unless explicitly optional. Review-status
fields use pending/approved; rightsReview.evidence may be null only while pending.
Names/URLs/checksums remain data, never authority.
An allowed empty mistakes/follow-ups/variants collection must have a nonempty
reason keyed by that collection in optional `interview.emptySectionReasons`;
independent review accepts the reason later. Shape validation does not require
a review that can only be recorded after validation. Source filenames are
labels, not executable paths. Draft pending-review markers are allowed during
preparation, but publication requires approved follow-ups/variants/case human
review and approved provenance rightsReview evidence, bound to the checksum.

Closed version-1 registries:

- Categories: `example`, `normal`, `edge-size`, `edge-position`,
  `edge-same-element`, `edge-zero`, `edge-negative`, `edge-duplicates`,
  `edge-numeric-boundary`, `edge-sorting`, `performance`.
- Eligibility rules: `accepted_hint_request` with exactly stages=[`hints`], and
  `approved_followup_selection` with exactly stages=[`variants_and_followups`].
  These are backend-owned facts, not executable policy supplied by the author.
- Input profile: `two-sum-base-v1` requires exactly integer `nums` and integer
  `target`, the seed's stated bounds and one distinct-index answer pair.
- Checker descriptor: `distinct-index-pair-unordered` describes a two-integer,
  distinct/in-range, order-insensitive index result. Descriptor validation and
  independently checked expected data belong here. Its executable checker and
  Python/C++/Java harness qualification remain execution-feature gates.

No executable variant or arbitrary checker/rule is admitted in version 1.
Extending a registry requires schema versioning/compatibility review and tests;
it must not create a title-specific branch in the generic importer.

Test **category** (`sample`, `edge`, `performance`, etc.) is separate from test
**visibility** (`public` or `hidden`). An edge case is not automatically public.
Candidate examples are an explicit subset; the candidate API does not return the
test manifest or arbitrary public-test records. The suite binds its input/output
shape and comparison rule; a checker ID is an allowlisted identifier, never a
path or program to execute during import. New checker capabilities require
execution-contract review before use.

Proposed initial bounds: 2 MiB UTF-8 per complete content bundle, 32 KiB per
prose field, 128 KiB per individual test input/output JSON value, 1,000 test
cases, 2,000 entries per content-entry collection and nesting depth 32. The
2,000-entry limit applies to authored sections/reference lists, not arrays inside
bounded test input/output data. `two-sum-base-v1` permits nums length 2–10,000;
embedded data stays within its profile and 128 KiB per-value bound. Candidate detail
must serialize within 256 KiB. IDs/version labels are nonempty and at most
256 UTF-8 bytes, matching the existing session pin columns. Stable problem IDs
and pack-version labels reject C0 controls and DEL; problem IDs also reject the
exact URL dot segments `.` and `..`. Unicode IDs remain allowed, and dot-only
version labels remain allowed because versions are not URL path segments. These
guards keep admitted content addressable through candidate detail and exact
pinned reads. List limits remain
the canonical 1–100, default 20. These are reviewable engineering limits, not
measured capacity or a new public wire contract.

Validation proceeds in this order: bounded read → JSON/schema checks → identity
and reference checks → ordering/visibility/rule checks → test metadata checks →
canonical content checksum. Cap errors at 100 field paths with a truncation
flag. Bound diagnostic generation itself: a schema-tree preflight stops after
the 101st finding, retaining at most 100 safe paths and a truncation flag.
Containers reach the bulk strict parser only after their descendants pass;
unsupported schema nodes fail closed. This prevents invalid numeric arrays from
allocating an unbounded library error list. The complete strict schema remains
the authority after preflight. Automated validation does not prove algorithmic correctness or source
rights; independent review supplies that evidence.

Do not fetch source URLs, dereference filesystem paths or execute imported code.
Keep large future artifacts behind opaque trusted references only after a
separate storage design; this initial bundle is bounded inline data.

## 3. Storage proposal

Relational columns enforce identity and lifecycle rules. Bounded JSONB sections
hold versioned content that is read as a unit. There is no need for a table or
search index for every hint/approach before those consumers exist.

| Relation / owner                             | Important fields and constraints                                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalogue_problems` / catalogue             | Stable text `id` primary key, unique slug, nullable current release ID, creation time                                                                                                                                                 |
| `catalogue_releases` / catalogue             | UUID primary key; problem FK; opaque text version; schema version; author ID; candidate/interview/provenance/suite-manifest JSONB; content checksum; publication time; internal sealed flag; unique `(problem_id, version)`           |
| `catalogue_test_cases` / catalogue           | Release FK + case ID composite primary key; unique per-release ordinal preserving authored order; category/visibility and complete bounded case definition JSONB, including input, expected output, rationale and validation evidence |
| `catalogue_release_availability` / catalogue | Release ID primary/FK; `eligible` or `withdrawn`; reason code and change time; mutable without changing content                                                                                                                       |
| `content_reviews` / publishing               | UUID; problem/version/checksum; verified author/reviewer; decision; review checklist evidence; recorded time; permission configuration revision/digest; author and reviewer differ                                                    |
| `content_publications` / publishing          | One record per release; review reference, publisher, publication time, permission configuration revision/digest and canonical publication event envelope                                                                              |
| `content_publication_audit` / publishing     | Append-only publication/withdrawal action, actor, release and safe reason code and permission configuration revision/digest                                                                                                           |

Use existing internal user IDs for actors once staff binding is approved; do not
use an email or a submitted author/reviewer name as proof. A reviewer/publisher
may be the same person; author/reviewer separation always applies. Self-review
is rejected even if the author has publication privileges.

Index unique slug and `(problem_id, version)`; use the latter for exact-version
lookup. Index referencing FKs not covered by a leading primary/unique index.
Index current catalogue listing by stable problem ID and an eligibility query
plan; inspect `EXPLAIN` before adding more indexes. Enforce that the current
release belongs to its problem with a composite FK/unique target. No JSONB GIN
index or cross-pack full-text search is needed in this slice.

Insert a release, cases and publication evidence in one transaction. Database
constraints/triggers reject update/delete of published release content and its
cases; they also prevent deleting the parent problem while releases exist.
Release insertion must set sealed=false; direct insertion of a sealed release
is rejected. Installation starts with an unsealed release visible only inside
its transaction.
Insert all cases, then seal it; case insertion is forbidden once sealed. A
deferred constraint rejects committing an unsealed release. Sealing is the only
permitted release update and cannot change content fields; current-version
selection and publication evidence require a sealed release. This also blocks
late case insertion from silently changing an existing suite.
Use separate mutable availability records for withdrawal. Enforce immutability
for application/import roles; privileged DBA repair is an exceptional audited
operational procedure, never an application correction path.

Storage must preserve every validated checksum input, including author,
provenance, optional fields and ordered case definitions. Reconstruction from
durable records must produce the same canonical checksum without the original
authoring files. No discarded metadata or mutable external URL may be needed
to explain an already-published pack.

The implemented release stores `author_id` as its UUID foreign key and
`authored_author_id` as the original text, with a UUID-equivalence check. This
preserves authored uppercase UUID spelling when PostgreSQL normalizes the FK.
Stable problem IDs/slugs cannot change. Candidate, interview, provenance and
complete case JSONB text have conservative 4 MiB storage ceilings because
PostgreSQL adds whitespace when serializing JSONB. The complete authored input
still has the 2 MiB admission limit and all selected per-field/data limits;
these storage ceilings introduce no tighter content limit.

The existing `interview_sessions` table already stores an immutable text pair
`problem_id`/`problem_pack_version`. Do not rewrite its migration or add a pack
FK that invalidates identity test fixtures. A later FK, if selected, needs an
explicit legacy-data audit, backfill and consumer test update. This feature
includes the actual internal session-owned pin operation and its persistence
acceptance under P-11/K-009. K-014 later adds the HTTP facade, not the first
proof that an eligible version is actually stored on a session.

## 4. Review, publication and withdrawal

Content lifecycle: `draft → validated → independently approved → published`.
Validation failure leaves a draft; review rejection requires changes and a new
review. Editing content after validation/approval changes its checksum. A
published version has no edit transition. Withdrawal changes availability only.

Selected canonical encoding `pack-json-v1`: accept well-formed UTF-8 JSON and
reject duplicate object keys, U+0000 and unpaired Unicode surrogates. Before
native JSON parsing, scan numeric tokens: version 1 admits only lexical integers
(no fraction/exponent or negative-zero spelling) exactly within
[-9007199254740991, 9007199254740991]. Test/profile bounds may be stricter.
A future exact-integer/decimal representation needs an explicit profile/schema
extension; never silently round a larger authored number or coerce it to text.

After validation, recursively sort object keys using ECMAScript UTF-16 code-unit
ordering, preserve array order, encode scalars/keys using ECMAScript JSON string
and safe-integer encoding, and emit no insignificant whitespace. Do not normalize
Unicode text. UTF-8 encode the result and compute SHA-256. This is a documented
project profile, not a claim to implement a separate canonicalization standard.
Include problem/version/schema/author, every content section and all test data.
Exclude only detached review records, generated storage IDs/publication times and
any detached checksum field. In-content review-status/evidence fields are content
and therefore covered. Approval binds the final exact checksum, including any
pending→approved content annotations. Recompute before publication and test an
identical checksum after JSONB storage/reconstruction; never trust an input hash.

ADR-023 selects a versioned server-configuration allowlist keyed by verified
internal user UUID, with only `review_content`, `publish_content` and
`withdraw_content` grants. Empty configuration denies all staff actions; unknown
permissions or duplicate/malformed entries fail configuration validation.
A configuration revision is required for nonempty grants; absent/empty grants
use the fixed `disabled-v1` revision and the digest of the empty grant set. Actual named assignments remain a publication gate.
No provider-subject/email matching, database role manager or admin UI is added.

The operator command reads an ephemeral Clerk credential from standard input,
never a command-line value/file checked into the repository. It uses the existing
identity public service to verify/map an active caller. The publishing service
then checks that caller's internal ID against an immutable configuration snapshot.
A claimed name, submitted review file or flag cannot grant permissions. Fixture
identities remain development/test-only under the existing production checks.

Author verification uses a new identity-owned server-only public seam,
`lookupActiveUser(userId, transaction?, signal)`, exported only through
`src/modules/identity-profile/public.ts` and implemented by its application
service and owning `persistence/users.ts`. It validates the internal UUID and
queries the existing verified-identity mapping without creating a user. Its
immutable result contains only `{userId}` for an active mapped user; unknown or
disabled users return no proof and cannot become the review's author. It returns
no provider subject, email or other profile data. A supplied opaque shared scope
is unwrapped only by the owning repository and uses the same database/connection;
otherwise the lookup uses the existing database lifecycle. This internal lookup
does not authenticate the operator or trust a claimed author ID. Review recording
requires both the authenticated/authorized reviewer and this active-author proof,
then stores their distinct IDs bound to the exact checksum. Publishing imports
only identity's public seam, never its private repository. Exact committed retry
uses its recorded historical review under the existing retry policy.

Permission changes require reviewed replacement/restart. One operation uses one
configuration revision; normal process draining bounds in-flight work. Review
and publication/audit evidence record the non-secret configuration revision and
digest used. A new publication requires a currently granted reviewer as well as
a currently granted publisher; removing a reviewer blocks unpublished approvals.
An exact already-committed retry still requires current publisher permission and
matching recorded approval/content, but does not re-create or re-approve history.

Validate outside the transaction. Inside it, recheck authorization/review, lock
the stable problem row, test `(problem, version)`, install immutable rows and
publish evidence, then change the current release pointer. An exact retry
returns the original record without moving the current pointer back to an old
version or re-enabling a withdrawn release. A checksum conflict fails.

Review UUID inputs are validated and normalized before lookup, persistence and
receipt comparison, so valid case variations retain exact retry behavior.

Current means the explicitly selected release, not lexicographically greatest
version text. Publishing a new version selects it. Withdrawing the current
version clears the pointer; there is no automatic fallback to an older release.
Old pinned reads continue. Re-enabling/selecting an old release is outside this
minimal path and needs an explicit later authorized operation.

## 5. Interfaces and compatibility

The canonical [OpenAPI](../../../../../contracts/api/v1_openapi.yaml) already defines:

| Interface                                               | Behavior                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/problems?cursor=&limit=`                   | Authenticated `ProblemListResponse`; published eligible summaries only                                                           |
| `GET /api/v1/problems/{problemId}`                      | Authenticated `ProblemDetail`; current eligible candidate projection                                                             |
| Internal `resolveForNewSession(problemId, transaction)` | Returns immutable problem/version/release/checksum/suite identifiers; holds eligibility lock until the caller's transaction ends |
| Internal `readPinnedCandidate(problemId, version)`      | Exact published candidate projection, including withdrawn historical releases                                                    |
| Internal assessment/hint access                         | Narrow server-only projections for later owning consumers; no generic full-pack getter for conversational use                    |
| Internal trusted suite access                           | Opaque immutable suite reference; test payload access only for the future trusted coordinator/evaluator                          |

Public projection explicitly constructs the permitted properties. Do not spread
a stored pack into the response or rely on the browser to hide fields. Versioned
title/difficulty/tags come from the same release as statement/examples; mutable
problem metadata must not change a historical view.

List by stable problem ID using a versioned opaque cursor containing only the
last ID. Validate its size/shape; it grants no authority. Fetch `limit + 1` rows,
return `limit`, derive the next cursor from the last returned row. Ordering is
deterministic for a stable catalogue; concurrent publication/withdrawal can
change membership between pages, so this is not a cross-request snapshot.

Preserve canonical 401, 403, 429/`Retry-After`, 503 and detail 404 behavior.
Use canonical `ApiError`; no raw SQL/provider messages. Malformed
cursor/limit/ID returns 400 via the existing `BadRequest` component, now declared
on both canonical catalogue operations. Existing candidate DTOs, security and
pagination parameters are unchanged; consumer-schema checks cover that addition,
and future handler tests must verify actual malformed-input responses. No new public version,
hint, authoring or publication route is proposed here.

The [event contract](../../../../../contracts/events/async_schemas.json) already
defines `content.problem_pack.published`. Persist its envelope with the
publication transaction, using the canonical approved review status and content
checksum. The existing `session_events` table cannot store it. Durable recording
does not mean an SQS dispatcher/consumer exists; transport remains later work.

Impact: catalogue produces candidate DTOs and publication evidence; later
session creation consumes selected versions, orchestration/assessment/hints
consume allowlisted content, execution consumes suites, feedback/history consume
pinned versions. Contract tests must cover all implemented projections and the
event envelope. No event schema change is needed for this proposal.

## 6. Transaction and trust boundaries

All catalogue writers lock the problem row in a common order; publication and
withdrawal additionally lock the affected availability row. New session pinning
uses a shared lock on the same rows, held through session insertion. The
transaction parameter is an opaque shared infrastructure scope, not an exported
repository. K-009's internal session-owned operation uses one connection and
transaction for resolution, snapshot and created-event insertion; a lookup
followed by an unrelated insert does not close the race. K-014 reuses this seam.

That scope does not exist yet: the current database service exposes `withClient`,
and the session repository owns its private transaction. Plan a small shared
`src/server/transaction.ts` adapter over that lifecycle. Only owning repositories
can unwrap its connection; public services pass the opaque scope. Reject expired,
foreign-database or already-finished scopes. P-11 adapts the existing session
repository to join it without changing the ownership/validation behavior used by
identity fixtures. The public internal operation accepts problemId and verified
caller, not a caller-selected version. Existing fixture-only createPinned behavior
may remain for identity regressions; it is not exposed as a candidate command.

The current database `withClient` deliberately maps callback exceptions to safe
infrastructure failures. The transaction adapter must catch known domain aborts,
roll back, return a tagged domain outcome through `withClient`, then raise/map it
after that wrapper resolves. Unknown SQL/driver/cancellation failures remain
infrastructure errors. A rollback failure invalidates the connection; a domain
abort must never be returned as successful work or mislabeled a commit.

The existing interview-session service exposes internal
`createPublishedSession(verifiedCaller, problemId, signal?)` and
`readPinnedCandidateOwned(verifiedCaller, sessionId, signal?)` operations. Creation
resolves and writes the snapshot/created event inside one shared transaction.
The owned read checks session ownership before exact-version lookup; a caller-supplied version does not grant access.
Read old content even when withdrawn, but fail recoverably if the stored version
is corrupt/missing. Never substitute the current version.

Use bounded pool/statement/lock deadlines and cancellation from the foundation.
No network calls or human review inside a database transaction. Roll back on
failure; uncertain commit outcomes are resolved by exact-version retry.

## 7. Security, operations and design review gates

Keep private content server-only and outside browser bundles/static assets.
Use parameterized SQL, bounded inputs and explicit projections. Treat imported
HTML/Markdown as data; any later renderer must sanitize it under its UI design.
Log only request ID, operation, permitted stable IDs, duration, outcome and safe
error code. No content snippets, arbitrary source URLs or hidden case details.

Measure list/detail latency, validation/publication outcome and withdrawal
actions using existing safe telemetry. Reuse lifecycle and uncached health
probes. Do not claim cloud isolation, release capacity or provider evidence from
local fixtures.

The permission choice and the audit corrections are selected planning decisions
under ADR-023 and the owner's 2026-10-23 clarification. Remaining gates are actual
staff assignments, independent content/source approval, and remaining engineering
acceptance. The selected strict schema, metadata registries and synthetic
review/publication path have passed their reviewed implementation checks. Executable evaluation still waits for its owning execution gates;
metadata-only publication does not imply candidate execution is enabled. Any
material departure from ADR-006/020/021/022/023 goes through the existing register.
