# Interview Orchestration and Conversation — Engineering Design

**Scope:** Planning-stage design for K-018 (2026-10-24). No implementation task
has started; this document records accepted design and the task breakdown, not
observed evidence. Follows the model_gateway eng_design precedent's format but
contains no execution-group evidence, since none has run yet.

## 1. Readiness and execution rules

K-018's hard prerequisite is K-017 (Model Gateway). Fixture-backed design and
tests can proceed against the gateway's fake adapter before K-017's external
OpenAI gate (T184) closes (ADR-022 local-dependency-satisfaction precedent);
this feature must not claim production readiness ahead of K-017.

Session APIs (K-014/K-016) own `currentStage` persistence and are a hard
dependency for the caller-integration task (`IO-06` below); the policy/prompt
layer (`IO-02`/`IO-03`) can be implemented and unit-tested independently of a
live session module by constructing the `AllowlistedContext`/transition inputs
directly in test fixtures. As of 2026-10-24, `project_management/kanban_board.md`
lists K-014 and K-016 under Backlog (not In Progress or Done), and
`src/modules/interview-session/public.ts` exports only `createSessionService`
with no guarded-commit mutation path yet. `IO-06` below is scoped to what is
actually verifiable today: fixture-constructed inputs proving a model-proposed
stage name alone cannot be written, not integration against a live session
mutation endpoint. Re-scope `IO-06` to real integration only once K-014/K-016
show observed acceptance evidence in the Kanban.

**Gateway dispatch is narrower than "registered" implies (found during the
2026-10-24 analyze pass; corrected here before Group 01 proceeds).** Reading
the actual K-017 implementation shows the Model Gateway's dispatch pipeline is
hardwired to the single literal operation `gateway_probe`, not generically
driven by its own registry: `EnabledOperation` and `OperationInput`/
`OperationOutput` in `src/modules/model-gateway/application/types.ts` are
single-value types (`'gateway_probe'` only); `operations.ts`'s
`definitionSchema` requires `name: z.literal('gateway_probe')` and
`createOperationRegistry`'s candidate filter accepts only an item named
`'gateway_probe'` (its own comment: "Stage 4 cannot enable business
operations"); and `invoke.ts` unconditionally parses input with the imported
`probeInputSchema` and hardcodes `operation: 'gateway_probe' as const` in the
adapter request, regardless of what operation was actually requested. This
matches K-017's own stated Stage 4 scope ("Register their operation names now;
enable them only when their schemas, context rules and evaluations are
defined" — model_gateway requirements §1): K-017 deliberately left "enabling"
a second operation as work for the consuming feature, not an oversight. **This
feature (K-018) must therefore do that generalization itself**, as a new task
`IO-00` (§4 below), before `interview_turn` can be dispatched through the
gateway at all. `IO-00` extends the registry/dispatch to be data-driven from
each definition's own already-present `inputSchema`/`outputSchema` fields
(these per-operation schema fields already exist in `EnabledDefinition` —
only `invoke.ts`'s hardcoded use of the `gateway_probe`-specific constants
needs to change to read them generically) and widens the `name`
literal/`EnabledOperation` union to cover `interview_turn` (and the two
deferred classification names, left disabled). `IO-00` must NOT touch
provider adapters, transport, budgets/limits enforcement, retry/backoff logic,
or usage/cost accounting — only the operation-identity/schema-selection
switch — and must add a regression test proving `gateway_probe`'s existing
behavior is byte-for-byte unchanged. This narrows, but does not remove, the
"does not modify the gateway's internal invocation/transport logic" claim in
§2 below: `IO-00` modifies the operation-dispatch selection, never the
transport/adapter/retry layer underneath it.

Use installed TDD, debugging, verification and review skills during
implementation: observe a failing test, implement the smallest change, run
focused checks, then refactor, matching the model_gateway and interview_session
features' established execution pattern.

## 2. Proposed files

```text
src/modules/interview-orchestration/
  public.ts
  application/{propose-turn,policy,fallback}.ts
  prompts/{intro,experienceContext,problemReadAndClarify,problemRestatement,
           sampleTrace,initialApproach,approachClarification,hints,code,
           testAndDebug,improveApproach,variantsAndFollowups,
           complexityAnalysis,feedback}.ts
tests/unit/interview-orchestration/        # policy, prompt assembly, fallback selection
tests/contract/interview-orchestration/    # proposeTurn against gateway fake adapter
tests/fixtures/interview-orchestration/    # ambiguity, injection, invalid-ID, hint-skip cases
```

`IO-00` extends `src/modules/model-gateway/application/{types,operations,invoke}.ts`
to generalize operation dispatch beyond the `gateway_probe` literal (see §1
above). `IO-01` then adds the (initially disabled) `interview_turn`,
`stage_classification`, and `intent_classification` operation declarations to
the now-generalized registry. Neither task modifies provider adapters,
transport, budget enforcement, or retry/usage/cost logic — only the
operation-identity/schema-selection switch that currently recognizes only
`gateway_probe`. The `stage_classification`/`intent_classification` contract's
own module (design in `tech_design.md` §6/`pseudo_code/logic_and_state.md` §5)
is **not** created in this stage's build — per FR-009, it is `IO-07`'s own
deliverable when that deferred task group runs; no file for it appears in the
layout above.

## 3. Time and space complexity

Let `K` be the bounded recent-turn context window (a fixed per-stage constant,
not the candidate's full history), `F` the pinned pack's declared
candidate-visible field count for the current stage (bounded by the pack
schema), `R` the pinned problem's allowed reference-approach ID count
(typically single-digit), `H` the hint ladder length (bounded, typically < 10),
`S` the fixed number of interview stages (constant, from the state machine —
16, of which 14 are prompt-bearing; `created` and `completed` never call the
model), and `C` the candidate's current-turn input length in bytes. All of `K`,
`F`, `R`, `H`, `S` are small constants fixed by product/content policy, not
inputs that grow with platform usage; this section expresses them symbolically
for clarity rather than claiming non-constant behavior. These are design
estimates, not measured performance; gateway network/provider latency is a
separate cost already bounded by the Model Gateway's own deadline (gateway
tech design §4). Per the owner's 2026-10-24 decision, the concrete values are
`K = 6` recent turns and `F = 8` candidate-visible pack fields; the Big-O
expressions below are unaffected and remain in terms of the symbols `K` and
`F`.

| Operation                                             | Time                | Extra space | Explanation                                                                                       |
| ------------------------------------------------------ | -------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| Build `AllowlistedContext` for current stage           | O(K + F)             | O(K + F)    | Bounded projection over the recent-turn window and the pack's allowlisted fields for this stage    |
| Render stage prompt                                    | O(K + F + C)         | O(K + F + C) | Pure string assembly over the context plus the current candidate input                             |
| Branch on gateway result (success vs. failure code)    | O(1)                 | O(1)        | Fixed, small discriminated-result check; the Model Gateway's own schema/output validation already ran before returning this result — this layer never re-validates already-validated success data |
| Reference-ID containment check                         | O(1) amortized       | O(R)        | `allowedReferenceApproachIds` held as a `Set`; one membership test; absent field (abstention) short-circuits with no lookup |
| Hint-ladder containment check                          | O(1)                 | O(1)        | Single integer comparison against `allowedHintIndex`                                                |
| Content-exposure scan against private pack fields       | O(F)                 | O(F)        | Compares returned text against the pack's bounded private-field value set, not free-text pattern matching |
| State-machine next-stage lookup                         | O(1)                 | O(S)        | Fixed hash-map transition table keyed by `(currentStage, guard)`; table size is the constant `S` (all 16 stages, including non-prompt-bearing ones) |
| Fallback-turn selection                                 | O(1)                 | O(1)        | Static per-stage lookup table sized to the 14 prompt-bearing stages, not the full `S`               |
| Deferred: stage/intent classification call (when implemented) | O(C)           | O(C)        | Single-utterance input only (no `K`/`F` context); bounded by the candidate's current input length  |

End-to-end `proposeTurn` (excluding the Model Gateway's own call latency, which
is bounded separately per its tech design §4) is `O(K + F + C)` time and space,
dominated by context assembly; policy checks after the gateway call add only
`O(F + R)` on top, since `R`, `H`, and `S` are small fixed constants. No step
scans the candidate's full session history or the full Problem Pack catalogue.

## 4. Task breakdown and traceability

All tasks belong to **K-018**. Markers below are unchecked; this is a design
artifact, not implementation evidence.

| Task  | Deliverable and failing-test target                                                                                                                                                                    | Requirements / depends on                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| IO-00 | Generalize the Model Gateway's operation dispatch beyond the `gateway_probe` literal: widen `EnabledOperation`/`OperationInput`/`OperationOutput` and `definitionSchema`'s `name` field to a closed set including `interview_turn`; make `createOperationRegistry`'s candidate filter and `invoke.ts`'s input/output-schema selection data-driven from each definition's own `inputSchema`/`outputSchema` instead of the hardcoded `probeInputSchema`/`'gateway_probe'` constants. The candidate filter widens by **name membership** in the closed `EnabledOperation` set, not by schema presence: the still-disabled stub entries (`approach_assessment`, `hint_support`, `feedback`, `transcription`, `speech`, and this feature's own `stage_classification`/`intent_classification`) carry no `inputSchema`/`outputSchema` and must keep failing `registry.resolve` with `operation_disabled`, exactly as today — only `gateway_probe` and the newly-enabled `interview_turn` reach schema validation. Regression test proves `gateway_probe`'s existing behavior (success, every error code, limits) is byte-for-byte unchanged, plus a disabled-stub case proving an un-enabled operation with no schema still resolves to `operation_disabled` rather than erroring on a missing schema field. No change to provider adapters, transport, or budget/retry/usage logic. | None (FR-002's prerequisite); depends on K-017's `gateway_probe` implementation as a baseline to regress against |
| IO-01 | Register `interview_turn` (and disabled `stage_classification`/`intent_classification`) operations in the Model Gateway registry with full schema/prompt/budget declarations; contract test rejects an incomplete declaration. | FR-002, FR-009; depends on IO-00                |
| IO-02 | Implement per-stage prompt modules and `AllowlistedContext` projection; unit tests prove no field outside each stage's allowlist reaches the rendered prompt, and candidate content is delimited as untrusted. | FR-001, FR-006                                  |
| IO-03 | Implement the policy layer (stage applicability, reference-ID containment, hint-ladder containment, content-exposure scan) and deterministic fallback selection; unit tests cover each rejection path independently. | FR-003–005, FR-007                              |
| IO-04 | Implement `proposeTurn` wiring prompt assembly → gateway call (via fake adapter in tests) → policy layer → `{proposal | fallback}` result, including the single bounded repair attempt on `invalid_output`/`refused`/`output_limit` gateway codes (FR-008). | FR-002, FR-004, FR-008; depends on IO-00/IO-01 (the fake adapter must actually be able to dispatch `interview_turn`) |
| IO-05 | Author the full regression fixture set — ambiguity, off-topic input, prompt injection, invalid reference ID, hint-skip, gateway timeout, abstention (no `matchedReferenceApproachId`), and each of the three FR-008 repairable gateway codes (`invalid_output`, `refused`, `output_limit`) — and the allowlisted telemetry fields for each call. | FR-010–011                                      |
| IO-06 | Wire `proposeTurn`'s result into the session module's existing guarded-commit path so only the state machine's transition table writes `currentStage`; integration test proves a model-proposed stage name alone never persists. | FR-004; depends on K-014/K-016 session commit path |
| IO-07 (deferred) | Implement `stage_classification`/`intent_classification` operations and their evaluation set, then enable them in the gateway registry; scheduled after IO-01–06 are accepted, per the owner's 2026-10-24 scoping decision. | FR-009; depends on IO-01, IO-03                 |

## 5. Verification plan

| Layer                | Required evidence                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                  | Prompt assembly allowlist enforcement; each policy rejection path independently; fallback selection coverage for all 14 prompt-bearing stages; hint/reference containment edge cases (empty sets, exact boundary index, absent ID for abstention). |
| Contract              | `proposeTurn` against the Model Gateway's fake adapter for the full regression fixture set (FR-011, including the abstention case and the FR-008 repair-attempt codes); schema validation agrees with the registered operation declaration. |
| Architecture/privacy  | Orchestration module imports only `model-gateway/public.ts` and the session module's `public.ts`; no direct provider adapter import; no hidden-pack-field value ever reaches a log or client-visible payload. |
| Integration            | A model-proposed stage name alone cannot mutate `currentStage`; a policy-rejected proposal leaves session version unchanged; a gateway timeout/refusal produces the canonical fallback turn without a candidate-evidence event. |
| Consumer end-to-end    | Stage 6 (K-019) and feedback (K-023) correctly reuse this feature's exported reference-ID/hint containment primitives rather than reimplementing them — verified when those features integrate. |

Ordinary CI must never dispatch a real provider call; all orchestration tests
run against the Model Gateway's fake adapter, consistent with the gateway's own
test-mode restriction.

The "no new route/event" claim (§6, `tech_design.md` §7) is verified by the
final group's existing `test:contract`/`verify:architecture` run producing
zero diff against `contracts/api/v1_openapi.yaml` and
`contracts/events/async_schemas.json` — this is the specific evidence that
run is expected to produce for this feature, not merely a generic suite pass.

## 6. Migration, rollout, and acceptance

No schema migration or public API/event change. Roll out
`interview_turn` disabled → enabled against fake adapter in tests → enabled
against OpenAI once K-017's T184 gate closes → business activation only after
Stage 5's own regression-evaluation gate (policy §10 of the LLM interaction
policy) passes. `stage_classification`/`intent_classification` stay disabled
until their deferred task group (IO-07) is separately accepted.

Rollback disables `interview_turn` in the gateway registry; the caller's
existing deterministic fallback path (already required by FR-007) means a
rollback degrades to canonical fallback turns rather than failing candidate
requests. No session state is rewound by a rollback.

K-018 completion needs this feature's own implementation/tests plus K-017's
production acceptance for any live-provider claim; fixture-only passage against
the fake adapter does not establish production readiness. Update Kanban/CSV
status only after observed criteria pass.

## 7. Observed orchestration evidence

### Group 00 — planning gate

Separate agents ran specify, clarify, plan, checklist, and tasks against
`.specify/work/interview_orchestration/`. Specify left two genuine
`[NEEDS CLARIFICATION]` markers (the `interview_turn` timeout/token budget,
and the `K`/`F` constants); the owner resolved both on 2026-10-24 (15s
total/6s attempt/1,024 tokens, reusing `gateway_probe`'s defaults; `K=6`,
`F=8`), and clarify propagated the concrete values into this document, the
requirements doc, and the technical design, in addition to `spec.md`.

The checklist stage found one genuine gap (`CHK010`): this document's own
IO-05 task text under-named the FR-011 fixture set (seven categories, no
abstention, three distinct codes compressed into "refusal"). Corrected here
directly; `CHK010` now reads Satisfied in
`.specify/work/interview_orchestration/checklists/orchestration.md`.

The first `$speckit-analyze`-equivalent pass found one **CRITICAL** finding
(`F1`): reading the actual K-017 implementation
(`src/modules/model-gateway/application/{types,operations,invoke}.ts`) showed
operation dispatch is hardwired to the single literal `gateway_probe` — not
generically registry-driven as earlier design text assumed — which would
have blocked `interview_turn` from ever being dispatchable. This is
consistent with K-017's own stated Stage 4 scope (model_gateway requirements
§1: "enable them only when their schemas, context rules and evaluations are
defined"), i.e. K-017 deliberately deferred this generalization to the
consuming feature rather than omitting it by oversight. Added as `FR-013`
and task `IO-00` above, narrowly scoped to the operation-identity/schema-
selection switch only (never provider adapters/transport/budget/retry/usage
logic), with a mandatory regression test proving `gateway_probe`'s existing
behavior is unchanged. Three lesser findings (`F2`: stale "existing
guarded-commit path" wording given K-014/K-016 are Backlog; `F3`: an
ambiguous `classification-contract.ts` reference, now removed from this
stage's file list — that module is `IO-07`'s own deliverable; `F4`: an
under-specific "no new route/event" verification claim) were also corrected
directly in this document and propagated into the Spec-Kit artifacts.

A second analyze pass independently re-verified every fix (re-reading the
gateway source files again, re-grepping the full task-ID sequence, re-reading
`kanban_board.md` directly rather than trusting the first pass's cached
claim) and found **zero CRITICAL/HIGH findings**. It surfaced one MEDIUM
(`checklists/requirements.md` still said "FR-001–FR-012", not updated for the
new `FR-013`, and `FR-013` had no Success Criterion of its own) and two LOW
observations (a non-defect wording note, and a soft spot in `IO-00`'s
disabled-stub-vs-schema-bearing-operation filter semantics). Root fixed the
MEDIUM (added `SC-009` to `spec.md`, updated the checklist's FR/SC ranges)
and the LOW task-specification gap (clarified that `IO-00`'s candidate filter
widens by name membership in the closed operation set, not by schema
presence, so still-disabled schema-less stubs keep failing closed) directly,
rather than running a third full analyze pass for non-blocking findings.

`tasks.md` ultimately defines 38 tasks, `T185`–`T222`, across Groups
00–07 (Group 01 is the new `IO-00` gateway-dispatch generalization, inserted
ahead of the original Group 01/`IO-01`, which shifted to Group 02; every
later group shifted accordingly). Root committed Group 00 as
`<US=shared, ID=T188, K=K-018, GROUP=00> docs(orchestration): record reviewed implementation tasks`
(commit `4bfdef1`), containing only this feature's four canonical documents
and `README.md` — `.specify/work/interview_orchestration/` is gitignored
(`.specify/.gitignore`), matching the K-017 precedent.

### Derived issue export

The taskstoissues agent deduplicated against all existing issues, created 38
derived mirrors titled `T<id>: <task text>` with full task/dependency/group
text in the body and an explicit "Acceptance evidence: not yet observed"
placeholder, and read every one back to confirm title/body integrity and zero
duplicates/skips. GitHub assigned `#190`–`#227` (not starting at `#189`,
which turned out to already be K-017's own PR). These mirrors do not replace
Kanban/CSV as the status authority.

| Task  | Issue | Task  | Issue | Task  | Issue | Task  | Issue |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| T185  | #190  | T195  | #200  | T205  | #210  | T215  | #220  |
| T186  | #191  | T196  | #201  | T206  | #211  | T216  | #221  |
| T187  | #192  | T197  | #202  | T207  | #212  | T217  | #222  |
| T188  | #193  | T198  | #203  | T208  | #213  | T218  | #223  |
| T189  | #194  | T199  | #204  | T209  | #214  | T219  | #224  |
| T190  | #195  | T200  | #205  | T210  | #215  | T220  | #225  |
| T191  | #196  | T201  | #206  | T211  | #216  | T221  | #226  |
| T192  | #197  | T202  | #207  | T212  | #217  | T222  | #227  |
| T193  | #198  | T203  | #208  | T213  | #218  |       |       |
| T194  | #199  | T204  | #209  | T214  | #219  |       |       |

### Group 01 — IO-00: generalize gateway operation dispatch

RED: baseline `tests/unit/model-gateway`+`tests/contract/model-gateway`+
`tests/integration/model-gateway` run confirmed 379/379 passing before any
change. Three new tests (second-operation dispatch, disabled-stub safety)
observed failing against the unmodified `gateway_probe`-only dispatch.

GREEN: widened `EnabledOperation`/`OperationInput`/`OperationOutput`
(`types.ts`) and `definitionSchema`'s `name` field (`operations.ts`) to a
closed set; generalized `createOperationRegistry`'s candidate selection to
any `enabled === true` item (previously hardcoded to `gateway_probe` only)
with a generic self-consistency check in place of the old probe-specific
object-identity check; replaced `invoke.ts`'s three hardcoded
`probeInputSchema`/`probeOutputSchema`/`'gateway_probe' as const` call sites
with the resolved definition's own schemas and the actual requested
operation, widening `invoke`'s signature to be generic over `K extends
EnabledOperation`. 382/382 passing (379 baseline + 3 new), typecheck/lint/
format clean, diff scoped to exactly `types.ts`/`operations.ts`/`invoke.ts`
plus their two test files — no adapter/transport/budget/metadata file
touched.

A dedicated independent reviewer (loading `mastering-typescript`, `vitest`,
`requesting-code-review`) found two **blocking** findings, each independently
reproduced before being reported: (1) the generalized registration loop
dropped the old single-operation code's implicit "ambiguous match registers
nothing" fail-closed property — two differently-configured candidates
sharing one name would silently last-write-win instead of both failing
closed (reviewer constructed and ran the exact colliding-name case to prove
it); (2) `EnabledOperation`/`definitionSchema`'s widened set omitted
`stage_classification`/`intent_classification`, which both this document's
§1 and `tasks.md` T190 explicitly required to be included (disabled). Root
resolved both: restored a generic fail-closed duplicate-name guard (count
validated candidates per name; register only names with exactly one
validated candidate) with its own RED/GREEN regression test, and widened the
type/enum to the full four-name set with a regression test confirming
`stage_classification`/`intent_classification` still resolve to
`operation_disabled` (behavior unchanged, only the type surface widened) and
that a fifth/unknown name is still rejected. Root independently reran the
full suite after both fixes: **19 files, 387 tests passing** (382 + 5 new),
typecheck/eslint/prettier clean, diff still scoped to the same five files.
`canonicalOperations`'s real `interview_turn` entry remains the disabled stub
— `IO-01` (Group 02) enables it next.

Committed as
`<US=US1, ID=T192, K=K-018, GROUP=01> feat(orchestration): generalize gateway operation dispatch`.

Groups 02–07 (remaining implementation) follow; this section will be
extended as each group's RED/GREEN/review/commit evidence is observed.
