# Stage 6 — Approach Assessment and Hint Management: Requirements

**Date:** 2026-10-24. **Scope:** Stage 6 / W8 / K-019, priority P1.
**Status:** Documentation design; implementation and release acceptance pending.

## 1. Problem and intended outcome

A candidate can describe the same algorithm in different words, omit an important
detail, make an actual reasoning error, or propose an approach absent from the
reference catalogue. The interviewer must distinguish those cases, preserve
evidence, and offer incremental help without inventing certainty or disclosing
the solution. Matching a reference is neither proof of correctness nor a condition
for accepting a valid unconventional approach.

Authoritative inputs: [Stage 6](../../../02_build_sequencing/feature_implementation_order.md#stage-6--approach-assessment-and-progressive-hints),
[domain architecture](../../../01_macro_architecture/03_data_and_domain_arch.md),
[ADR register](../../../01_macro_architecture/05_architecture_decision_records.md)
(ADR-003–008, 012, 015, 019, 020–022, 025–026),
[session state machine](../../interview_session/specifications/technical/session_state_machine.md),
[LLM policy](../../interview_orchestration/specifications/technical/llm_interaction_policy.md),
[OpenAPI](../../../../contracts/api/v1_openapi.yaml), and
[event schemas](../../../../contracts/events/async_schemas.json).
Related [technical design](../specifications/technical/tech_design.md),
[engineering design](../specifications/engineering/eng_design.md), and
[pseudocode](../pseudo_code/logic_and_state.md) define implementation detail.

## 2. Actors, scope and boundaries

The authenticated session owner submits reasoning, answers clarification, requests
a hint when permitted, and continues. The backend orchestrator authorizes commands,
owns transitions and exposure, and accepts or rejects model proposals. The Model
Gateway supplies bounded semantic interpretation. Catalogue services supply the
exact pinned, reviewed content. Feedback/history consume committed evidence later.

Included: approach summary/matching, explicit uncertainty, evidence-linked
qualitative assessment, candidate-stated complexity, clarification, one-at-a-time
curated hints, durable exposure, retry/resume, safe output and evaluation coverage.

Excluded: execution or proof of code correctness, final numerical scores, automatic
penalties for hints, variant selection, pack editing/publication, new authentication,
new voice transport, full history UI, automatic solution generation, and new APIs. Reviewed routing configuration references existing pack ladders and
does not edit or republish the pack. Stage 7 owns execution; Stage 8 owns feedback; Stage 10 owns variants.

## 3. User scenarios and acceptance

All journeys are P1; US1–US3 are incremental semantic-assessment slices, US4 is the
deterministic hint slice. US4 needs the common command foundation, not a successful
reference match.

| Story                               | Given / when                                                                         | Then / independent acceptance                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US1 — Understand my approach        | Active owned session at `initial_approach`; candidate explains an approach           | Store candidate evidence; produce an evidence-linked assessment; accept a reference label only after all validation/confidence gates pass. A plausible inefficient method stays plausible. |
| US2 — Clarify uncertainty           | Explanation is incomplete, contradictory, or supports multiple interpretations       | Ask a targeted question or abstain; do not assert an unsupported label, error or complexity; a later answer is reassessed against its own evidence/version.                                |
| US3 — Preserve unfamiliar reasoning | Sufficient explanation does not map to any reviewed reference                        | Record `novel` only as an interpretable unmatched explanation, not verified correctness; allow open-ended assessment and the policy-governed path to code.                                 |
| US4 — Receive progressive help      | Active owned session is in `hints`, with a next eligible hint; candidate requests it | Commit exactly the next approved hint/exposure and return its canonical text. Retrying the same action reveals no further hint; refresh does not reset exposure.                           |

Negative acceptance: cross-user commands have no side effects or provider calls;
stale versions cannot commit; provider failures are neutral; exhausted or
ineligible hints reveal nothing; a timeout/disconnect cannot lose a committed
exposure or cause duplicate exposure on retry.

## 4. Functional requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | Authorize every read, command, retry and resume against the authenticated internal owner. Never trust browser-supplied owner, reference ID, hint index, confidence, assessment or next stage.                                                                                                                                                     |
| FR-02 | Read only the session's immutable pinned pack, including its checksum/schema version. Never switch to latest content on reassessment or resume. Unavailable pinned content is a dependency failure, not a candidate error.                                                                                                                        |
| FR-03 | Assess only candidate reasoning captured by this command or already committed in this session and permitted by stage policy. Link every substantive qualitative finding to source evidence; distinguish absent evidence from incorrect reasoning.                                                                                                 |
| FR-04 | Support exactly the domain outcomes `matched`, `ambiguous`, `abstained`, `novel`. A match needs a supplied pinned reference ID, sufficient verified evidence, no unresolved contradiction, and a qualified confidence policy. Otherwise use a null match. Confidence is not a correctness score or calibrated probability.                        |
| FR-05 | Record correctness reasoning, assumptions, missing explanation and candidate-stated time/space complexity separately. Do not substitute reference complexity for an explanation the candidate did not provide. Execution facts remain authoritative and separate.                                                                                 |
| FR-06 | For material ambiguity, request bounded clarification; do not repeatedly force the candidate into references. Clarification limits and exhausted-limit continuation follow the reviewed owning orchestration policy; lack of a match alone must not block code forever.                                                                           |
| FR-07 | Apply existing stage/status guards. Assessment occurs in `initial_approach`, `approach_clarification` or `improve_approach` where enabled by orchestration. Only `hints` permits `request_hint` under the current pack rule. No automatic hint exposure merely from entering that stage or a low-confidence result.                               |
| FR-08 | On an accepted eligible hint request, reveal exactly one next hint from the backend-selected reviewed approach ladder or reviewed default ladder. Do not skip, invent, switch ladders, or reveal future hints. Exhaustion/ineligibility returns a conflict without advancing state or charging a hint.                                                                              |
| FR-09 | Persist selected ladder ID/local ordinal, hint ID, exact pack checksum/version, command, associated interviewer turn and exposure before returning text. Resume returns committed help only. Later reassessment never resets the cursor or erases assistance history. A hint-only command preserves the prior latest-assessment ID/version; only a committed assessment replaces them.                                                                                                                      |
| FR-10 | Resolve same-key/same-payload replay before its stale version precondition; return its original logical result. Different payload under the same key conflicts. Reclaiming expired work preserves its original logical payload, source version, evidence ID and fingerprints; fresh retry headers cannot rebase it. Concurrent new commands for one version have at most one winner; a loser receives `412` without partial writes. Snapshot, event, turns, assessment/exposure and idempotency result commit atomically, incrementing version once. |
| FR-11 | Treat structured model output as untrusted. Reject invalid IDs, evidence, schema, nonfinite confidence, unsupported claims and forbidden disclosure. Calls and retries are bounded through the Model Gateway. A stale result cannot overwrite a newer session.                                                                                    |
| FR-12 | On provider/schema/context/storage failure preserve the prior session stage/version and hint cursor. Offer safe retry; never record candidate failure or successful assessment/exposure. A valid low-confidence abstention is an accepted assessment, distinct from provider failure.                                                             |
| FR-13 | Candidate output contains only approved stage text, safe clarification, and hints already exposed. Never return private reference summaries/steps, hidden cases/outputs, evaluator notes, future hints or raw provider output. Plain canonical hint text is the default; no model call is required to release it.                                 |
| FR-14 | Retain pack, policy, evaluator/schema, rubric, prompt and configured model versions, evidence references, abstention reason and operation provenance. Keep provider failures separate. Apply the existing 365-day session/history retention and deletion policy; logs contain bounded metadata, not transcripts or private content.               |
| FR-15 | Apply identical assessment/hint policy to text and accepted voice transcripts. No durable raw audio; consent, transcription and TTS remain in the voice contract. Speech may read only committed candidate-visible text.                                                                                                                          |
| FR-16 | Qualify matching with reviewed correct, incomplete, incorrect, ambiguous, novel, paraphrased and adversarial fixtures. Evaluate precision and abstention/coverage separately. Version changes require regression evaluation; no threshold is selected from mock screen copy.                                                                      |

FR-17: Before first exposure, select a ladder using reviewed backend routing for the exact pinned checksum: a matched approach uses its explicit reviewed ladder choice; an unmatched approach or a matched approach lacking a ladder uses the reviewed default. Missing/invalid routing fails closed. At first committed exposure lock the ladder; later reassessment never switches it, resets its ordinal or removes history. Private ladder/approach metadata stays internal.

FR-18: Permit bounded nonmutating calibration/evaluation through the real Gateway while candidate reference labels remain disabled, restricted to an active verified operator with existing review_content grant and reviewed synthetic/reviewer-authored fixtures. Ordinary candidates and production transcript/session input are denied. Evaluation never writes session assessment, exposure, turns, events or replay results and cannot enable labels.

## 5. Key entities

`ApproachAssessment` references a session, candidate turn/evidence, optional pinned
reference, outcome, confidence, findings, missing evidence and evaluator versions.
`HintExposure` records a committed assistance action against a pack hint and turn.
The session snapshot owns hint progress and latest assessment references;
append-only events provide audit. The owning session operation/idempotency mechanism owns retry lifecycle. Its
minimum durable seam is planned in technical §9; Stage 6 does not introduce an
independent command framework.

## 6. Failure and boundary scenarios

| Condition                                             | Required observable outcome                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Empty/oversized input, client chooses reference/index | Validation error; no model call, mutation or disclosure                                     |
| Unknown/wrong-owner session                           | Existing safe authorization/not-found response; no content or replay result disclosed       |
| Paused, terminal, wrong stage, exhausted ladder       | Reject command using existing state policy; cursor/version unchanged                        |
| Same key repeated after response loss                 | Original response and ETag; exactly one exposure/assessment                                 |
| Expired same-key work retried with a newer If-Match     | Original source version still governs; stale original work returns `412`, never rebases    |
| Hint-only command after an accepted assessment         | Exposure advances once; prior latest-assessment ID/version remains unchanged               |
| Distinct keys with the same expected version          | One commit; loser receives precondition failure; no lost update                             |
| Missing/empty required reference set                   | Dependency failure; published schema requires references; never successful abstention      |
| Valid context; empty proposed match set                | Novel when understood with valid evidence; otherwise abstain/clarify                        |
| Pack/context missing or corrupt                       | Recoverable dependency failure, no success or candidate penalty                             |
| Invalid or leaking model output                       | Reject; bounded safe retry/fallback; no raw output returned                                 |
| Provider succeeds after another command wins          | Discard stale proposal; never update session from it                                        |
| Crash during transaction / after commit               | Roll back all changes / replay the committed result respectively                            |
| Different algorithm after receiving a hint            | New assessment; prior exposure remains and does not reset                                   |

## 7. Success criteria and evidence

| ID    | Criterion                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-01 | Every accepted reference label in deterministic fixtures has valid pinned membership and resolvable evidence. Every low-confidence, ambiguous or invalid proposal has no accepted reference label.                                                                                                                                                          |
| SC-02 | Retry, concurrency and crash tests demonstrate at most one hint exposure per logical action, strictly increasing ordinals without gaps, and zero partial snapshot/event/assessment/exposure commits.                                                                                                                                                        |
| SC-03 | Security/contract fixtures show zero private reference or future-hint disclosure in candidate responses, and zero hidden-test, secret or cross-user canary disclosure in responses, model context or ordinary logs. Matcher context contains only its approved private reference projection; conversational context contains no private reference material. |
| SC-04 | Every committed assessment retains its required evidence/version provenance; missing evidence is never represented as proven incorrectness in reviewed fixtures.                                                                                                                                                                                            |
| SC-05 | Provider timeout, malformed output, stale completion and database failure leave stage/version/exposure unchanged and introduce no candidate-failure evidence.                                                                                                                                                                                               |
| SC-06 | Local and real-provider evaluation reports identify dataset split/version, counts, precision, coverage/abstention, false matches, latency and usage. A reviewed calibration policy is required to enable reference labels.                                                                                                                                  |
| SC-07 | Load verification measures the existing provisional target of about 100 active interviews and live-turn P95 below 5 seconds where provider behavior permits. Report provider latency separately, plus local policy CPU/memory and query behavior; these are targets, not guarantees.                                                                        |

## 8. Clarifications, assumptions and readiness

Baseline resolves scope, ownership, abstention, hint order, privacy and API shape;
the owner approved reviewed default routing and first-committed-exposure ladder locking (ADR-026). The retained
[wireframe reconciliation](../../../01_macro_architecture/frontend_wireframe/index.md)
and source frames 17–19/22/24 were reviewed: its `0.75`, private-match display and
shared footer are illustrative. Allowed actions and safe projections govern them.
No screen implementation or new route is specified here.

Numerical calibration thresholds/margins, acceptable precision/coverage operating
point, per-operation budgets and clarification cap remain qualification inputs
owned jointly with K-017/K-018; they are not silently accepted by this document.
Unqualified configurations can exercise deterministic fixtures/abstention but
cannot enable reference-label decisions. See technical §4 and engineering §2/6.

K-019 stays Backlog in the canonical Kanban: K-008 has local seed acceptance,
while K-018 and full session/orchestration prerequisites remain unaccepted in this
checkout. Planning ahead does not establish dependency readiness. ADR-022 allows
verified local environment evidence only; production gates remain binding.

Clarification scan (2026-10-24): no new product questions were required. The
already-approved reviewed default ladder and first-committed-exposure lock remain
the accepted policy. Retry inputs/source versions and hint-only preservation of
the latest assessment are explicit observable requirements; calibration operating
points and full upstream integration remain enablement/acceptance gates.
