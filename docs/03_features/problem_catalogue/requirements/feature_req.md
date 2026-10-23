# Problem Catalogue and Immutable Problem Packs — Requirements

**Status:** Owner-approved design; implementation authorized on 2026-10-23. Acceptance evidence remains to be produced.  
**Feature:** 3 in delivery order (Stage 2). **Kanban:** K-007, K-008, K-009.  
**Date:** 2026-10-22.

**Revision:** 2026-10-23. Owner accepted the audit recommendations, including
configuration-based staff permissions. The owner subsequently authorized the
Spec Kit orchestration and implementation. This does not approve or publish the
seed; independent human content approval remains required.

## 1. What this module must achieve

A candidate must practise against a correct, reviewed problem. The interviewer
needs consistent material for clarifications, approaches, mistakes, hints and
follow-ups. Evaluation needs trusted tests. All of these must refer to the same
content version throughout an interview.

A **Problem Pack** is that complete interview kit for one problem. A **published
version** is a reviewed copy that can no longer be edited. Corrections create a
new version; an existing interview keeps its original version.

## 2. Scope and ownership

This feature defines the reusable pack format, validation, the minimum reviewed
seed publication path, authenticated catalogue reads and server-side version
resolution. Start with Two Sum. Adding another supported problem uses the same
format and validation process, without a new application branch for its title.
Problems needing a new input/output or evaluation capability still require a
reviewed contract extension.

The catalogue owns published content and version lookup. Content publishing owns
validation, approval, publication and withdrawal. Content ingestion remains
offline. The full authoring/admin interface and larger review workflow belong to
K-024; this does not postpone review or immutability for the seed pack.

Excluded: automatic LeetCode scraping, the proposed future agentic authoring flow,
LLM prompts/tools, live approach assessment, hint delivery, session HTTP commands,
candidate code execution, scoring, voice, and new candidate screens. Those
features consume this content later through their existing boundaries.

The small internal session creation seam needed to prove K-009 is included:
resolve the eligible version and persist its session snapshot/event in one
transaction. Full session HTTP commands, command idempotency and the complete
interview journey remain K-013/K-014/K-016.

## 3. What an author supplies

| Part               | Required content                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | Stable problem ID, slug, title, difficulty and topic tags                                                                                      |
| Candidate material | Independently written statement, input/output meaning, constraints, examples and explanations                                                  |
| Understanding      | Clarifications, assumptions, invariants and important edge cases                                                                               |
| Approaches         | Steps or pseudocode, preconditions, correctness reasoning, time/space complexity, trade-offs and matching features for each reference approach |
| Common mistakes    | Misconception, why it fails, a counterexample or reasoning, and the approach it relates to                                                     |
| Hints              | Ordered text, intended conceptual step, eligibility rule and whether paraphrasing is permitted                                                 |
| Follow-ups         | Question, skill tested, expected answer points, evaluation guidance and allowed-use rule                                                       |
| Variants           | Changed statement/constraints, skill tested, approach expectations and test references when executable                                         |
| Tests              | Case ID, category, visibility, input, expected output, rationale and validation evidence; immutable suite version                              |
| Provenance         | Source links, source type, retrieval date, authorship/transformation notes and rights-review outcome                                           |
| Review             | Named author, different technical reviewer, exact revision/checksum, review decisions and publication authority                                |

All sections must exist. Approaches, hints, examples and tests must contain usable
entries. A follow-up, variant or common-mistake section may be empty only with an
explicit reviewer-accepted reason; empty does not mean researched and complete.
Reference source code is optional at this phase; clear algorithms are required.
Python/C++/Java harnesses and toolchain qualification remain execution work.

## 4. User journeys

| Journey                              | Given / when / then                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US1 — Prepare content                | Given a pack in the agreed format, when an author validates it, then they receive precise field/reference errors or a content checksum; it is not published by validation |
| US2 — Publish reviewed content       | Given approval by a different authorized reviewer for the exact content, when an authorized publisher publishes, then the entire version becomes available atomically     |
| US3 — Discover a problem             | Given an authenticated candidate, when they list/open problems, then they receive only eligible published candidate material                                              |
| US4 — Keep an interview reproducible | Given an interview pinned to version A, when version B is published or A is withdrawn for new interviews, then the existing interview still reads A                       |

## 5. Functional requirements

| ID    | The module must                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | Accept a reusable, explicitly versioned Problem Pack containing the sections above. Keep problem identity separate from content version.                                                                                                                                                                                                                                                                                      |
| FR-02 | Reject unsupported schema versions, oversized content, missing fields, duplicate IDs/JSON keys, broken references, invalid hint order, unsupported numeric values, incompatible test metadata and invalid visibility before publication. Check every declared approach/test/source reference. Report paths and stable error codes without private content values. Bound error generation as well as the returned diagnostics. |
| FR-03 | Require recorded provenance and independent technical review of statement, approaches, correctness, complexity, hints, tests and rights. The reviewer must differ from the author; approval must identify the exact content revision. A content edit invalidates earlier approval.                                                                                                                                            |
| FR-04 | Publish only through an authorized operation. Commit the content, review/publication evidence and current-version selection together. Same version/same content retry returns the original publication; same version/different content is rejected. Published content and test material cannot be changed or deleted through application operations.                                                                          |
| FR-05 | Provide authenticated, bounded, cursor-paginated published-problem listing. Empty catalogue returns an empty list. Never list drafts, rejected packs or problems without a current eligible release.                                                                                                                                                                                                                          |
| FR-06 | Provide authenticated problem detail using only the canonical candidate-visible fields, including the exact returned pack version. Unknown or unavailable content must not reveal whether a private draft exists.                                                                                                                                                                                                             |
| FR-07 | Resolve the current eligible version through an internal session-owned operation and atomically persist that exact pin with the session snapshot/event. Browser input cannot select arbitrary versions for new sessions. Test real persistence, old-version retrieval and publication/withdrawal races before K-009 completion; full HTTP flow remains later work.                                                            |
| FR-08 | Separate candidate material, assessment/hint material, trusted test material and private review records. Hidden test inputs/outputs, test references and review notes must not reach candidate responses or conversational model context. Expected hidden outputs never enter a sandbox.                                                                                                                                      |
| FR-09 | Keep research/import preparation separate from live reads. Neither reads nor structural validation fetch external URLs, call an LLM or execute reference/candidate code inside the trusted application. Imported prose is untrusted data.                                                                                                                                                                                     |
| FR-10 | Fail safely on malformed input, permission denial, stale review, conflicting publication, cancellation and storage failure. A failed publication must expose no partial version. Reads must not silently substitute a different version when an exact pin is unavailable.                                                                                                                                                     |
| FR-11 | Record publication/withdrawal audit evidence and safe operational outcomes. Exclude content bodies, hidden cases, expected outputs, raw dependency errors and credentials from ordinary logs/traces.                                                                                                                                                                                                                          |
| FR-12 | Prepare Two Sum as the first seed candidate. Mark independently authored follow-ups, unverified discussion ideas and incomplete source research honestly. A draft is not a reviewed seed or a published catalogue entry.                                                                                                                                                                                                      |

Staff commands must verify the operator through the existing identity boundary,
then check an allowlist keyed by internal user ID in reviewed server
configuration. Default permissions are empty. A sign-in, submitted name or CLI
flag never grants staff authority. Permission changes require configuration
replacement/restart; independent author/reviewer separation still applies.

## 6. Content visibility and later LLM use

The full pack is stored as structured content; it is not pasted into candidate
chat. Later orchestration sends only the fields needed for a particular model
operation. Assessment can use selected reference/mistake guidance; a candidate
hint response receives only the next backend-approved hint. Do not send the full
reference solution or hint ladder to the candidate-facing generation operation.
This feature does not select function calling or expose an LLM retrieval tool.

The [LLM policy](../../interview_orchestration/specifications/technical/llm_interaction_policy.md),
[session state machine](../../interview_session/specifications/technical/session_state_machine.md),
[execution contract](../../code_execution/specifications/technical/execution_contract.md)
and [voice contract](../../voice_interaction_transcription/specifications/technical/voice_interaction_contract.md)
remain authoritative. Text and voice share the same content and session rules.

## 7. Acceptance criteria

| ID    | Evidence needed                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-01 | One independently reviewed seed passes validation, publication and retrieval; a second synthetic fixture uses the same shape without title-specific application logic                                       |
| SC-02 | Invalid, unauthorized, self-approved and stale-approved publications leave stored visibility unchanged                                                                                                      |
| SC-03 | Candidate responses and ordinary logs contain zero private canary values across success, failure and concurrency tests                                                                                      |
| SC-04 | Concurrent same-version publication/retry produces one immutable release; corrections and withdrawal preserve old-version retrieval                                                                         |
| SC-05 | Candidate API and identity error contract tests pass; pagination neither duplicates nor skips entries in a stable catalogue                                                                                 |
| SC-06 | Failure/cancellation tests show atomic publication and bounded recovery; K-009 tests real session/event pin persistence and new-pin/withdrawal races, followed by later HTTP regressions under K-014/K-016. |

Ordinary backend P95 below 500 ms remains the provisional ADR-014 target, not a
performance result. Deployment capacity and operational acceptance remain K-026.

## 8. Dependencies, clarifications and outstanding gates

K-007 depends on completed K-002; K-008 depends on K-007; K-009 depends on
K-005/K-007/K-008. Existing identity K-012 supplies authenticated API admission.
ADR-022 permits local work against the verified local configuration baseline;
T034/K-028 cloud evidence remains deferred and is not waived.

The owner's answers establish one initial problem, later reuse of the format,
and a future separate authoring flow. The supplied material has been adapted
into a structured Two Sum draft; it has not received independent human approval
or been published.

Before publication, assign actual author/reviewer/publisher identities and
approve source use and content correctness. The permission mechanism is selected
in ADR-023; actual allowlist assignments remain an operational gate. The
canonical catalogue operations declare `400` for malformed query/path input;
implementation must pass the corresponding contract and handler tests. The strict runtime schema and synthetic publication path have reviewed engineering
evidence in the engineering design. Genuine content approval remains pending;
executable checker/harness qualification belongs to the later execution gates.

### Clarifications — 2026-10-23

- Staff permissions: owner accepted the recommended reviewed configuration
  allowlist, with verified operator identity and replacement/restart for changes.
- Audit corrections: owner accepted preserving domain errors, actual internal
  pinning acceptance now, plural/reference validation, separate test-data bounds
  and explicit numeric/canonical encoding rules. The technical/engineering
  documents and pseudocode define the reconciled details.

Canonical inputs: [feature order](../../../02_build_sequencing/feature_implementation_order.md),
[dependency graph](../../../02_build_sequencing/build_dependency_graph.md),
[release scope](../../../02_build_sequencing/v1_scope_and_release_plan.md),
[Kanban](../../../../project_management/kanban_board.md),
[PRD §7](../../../01_macro_architecture/01_system_master_prd.md#7-content-strategy-and-quality),
[domain architecture](../../../01_macro_architecture/03_data_and_domain_arch.md),
and [ADR-006/020/021/022/023](../../../01_macro_architecture/05_architecture_decision_records.md).
