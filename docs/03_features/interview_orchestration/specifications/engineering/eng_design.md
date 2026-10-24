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

### Group 02 — IO-01: register `interview_turn` in the Model Gateway registry

RED: baseline 387/387 confirmed. Four new contract-test cases observed
failing against the still-disabled `interview_turn` stub (resolve success
with the pinned schema/limits; incomplete-declaration rejection; wrong-shaped
limits rejection; `stage_classification`/`intent_classification` unchanged).

GREEN: `interview_turn` enabled in `canonicalOperations` with the exact
input/output Zod schemas pinned in `tech_design.md` §2 (added to
`validation.ts`, reusing the existing `reference` schema for
`matchedReferenceApproachId` rather than redefining it), `limits` identical
to `probe.limits`, and a `prompt.body` that is strictly generic/stage-
agnostic (operation contract, untrusted-data boundary, structured-output
requirement — zero stage-specific content, verified by the reviewer reading
the actual registered string). 391/391 passing, scope held to
`operations.ts`/`validation.ts`/two test files; a pre-existing test
assertion that expected `interview_turn` to stay `operation_disabled` was
correctly updated (the other six disabled-operation cases in that same test
loop were left intact — reviewer confirmed no coverage was quietly dropped).

The dedicated reviewer found two issues: (1) **blocking** — `types.ts`'s
`OperationInput['interview_turn']`/`OperationOutput['interview_turn']` were
left as the `Record<string, unknown>` placeholders from Group 01, even
though Group 01's own comment explicitly deferred their real typing to this
group; callers got zero compile-time shape checking despite `IO-01` claiming
completion. (2) non-blocking follow-up — `src/server/logger.ts`'s
`model_call_completed` field-redaction allowlist only permitted
`gateway_probe`'s `evaluationVersion` value (`'synthetic-probe-v1'`), so any
real `interview_turn` call's true `evaluationVersion`
(`'interview-turn-v1'`) would silently log as redacted/null — a genuine
observability gap newly exposed by enabling this operation, found by the
reviewer's explicit hunt for other code assuming `interview_turn` stays
permanently disabled. Root fixed both directly: `types.ts` now derives
`OperationInput`/`OperationOutput`'s `interview_turn` entries via
`z.infer<typeof interviewTurnInputSchema/interviewTurnOutputSchema>` instead
of a placeholder; `logger.ts`'s `evaluationVersion` allowlist now includes
`'interview-turn-v1'`. Reran the full suite after both fixes: **20 files,
393 tests passing** (391 + 2 — `tests/unit/logger.test.ts` included in this
run), `tsc --noEmit`/eslint/prettier all clean.

Committed as
`<US=US1, ID=T196, K=K-018, GROUP=02> feat(orchestration): register interview_turn operation`.

### Group 03 — IO-02: per-stage prompt modules and `AllowlistedContext`

RED: `src/modules/interview-orchestration/` did not exist; new test files
failed to collect (`Cannot find module`). Baseline before this group:
393/393 (20 files).

GREEN: created the module — `application/allowlisted-context.ts`
(`buildAllowlistedContext`, `STAGE_FIELD_ALLOWLIST` for all 14 prompt-bearing
stages, `K=6`/`F=8`, `UntrustedText`/`wrapUntrusted`, a runtime
`isPromptBearingStage` guard that throws for `created`/`completed` and for
any stage name smuggled past the type system), 14 pure prompt modules
matching `session_state_machine.md` §2's stage names exactly, and
`public.ts`. 469/469 passing (393 + 76 new), scope held to only new files —
`src/modules/model-gateway/` untouched (confirmed by empty `git diff
--stat`).

The dedicated reviewer (loading `mastering-typescript`/`vitest`/
`requesting-code-review`) reproduced two **blocking** issues directly,
not just by inspection: (1) the untrusted-content delimiter had no
self-escaping — a candidate string containing the literal
`<<<CANDIDATE_INPUT>>>` delimiter could forge a closing/reopening pair and
inject text that would read as outside the untrusted block to a downstream
reader, defeating policy §7's delimiting requirement; the reviewer's
reproduction produced 4 delimiter occurrences instead of 2. (2) realistic
max-size input (full `K=6` turns, `F`-scale pack fields, a long candidate
string) rendered to ~26,680 characters for the worst-case stage, failing the
Model Gateway's registered 8,192-character input bound — nothing in this
layer bounded component sizes before concatenation, so the overflow would
only ever surface later at the gateway, defeating this layer's stated
purpose of producing an already-bounded `text` field.

Root fixed both directly: `wrapUntrusted` now neutralizes every literal
occurrence of the delimiter sequence inside candidate text (replacing it
with a non-matching placeholder whose edge characters can't reconstitute the
delimiter) before embedding, guaranteeing exactly 2 delimiter occurrences in
any rendered output regardless of candidate content; `renderContextFields`/
`renderRecentTurns`/`wrapUntrusted` now apply fixed per-component character
caps (250 chars/pack-field value, 250 chars/recent-turn text, 1,800 chars
candidate input, each with a visible `…[truncated]` marker) sized so the
worst-case stage's combined output (~6,417 chars, arithmetic verified) stays
comfortably under the gateway's 8,192-char bound with margin. Both fixes
shipped with their own RED (reproducing the reviewer's exact failure modes)
→ GREEN regression tests. Reran the full suite after both fixes: **23
files, 487 tests passing** (469 + 18 new), typecheck/eslint/prettier clean,
gateway module still untouched.

Committed as
`<US=US1, ID=T200, K=K-018, GROUP=03> feat(orchestration): build allowlisted context and stage prompts`.

### Group 04 — IO-03: policy layer and deterministic fallback selection

RED: `application/{policy,fallback}.ts` did not exist; new tests failed to
collect. Baseline before this group (`npm run test:unit`): 623/623 (41
files).

GREEN: implemented `applyPolicy`'s five ordered steps (stage applicability,
reference-ID containment, hint-ladder containment, content-exposure,
transition authority) exactly matching `tech_design.md` §4's order, and
`selectFallback`/`FALLBACK_TURN` for all 14 prompt-bearing stages, reusing
Group 03's `isPromptBearingStage` guard rather than duplicating it.
`OperationOutput['interview_turn']` is imported through the Model Gateway's
`public.ts` only. 642/642 passing (623 + 19 new).

The hint-ladder-containment step has no real signal to check against yet —
the registered `interviewTurnOutputSchema` carries no hint-index field (that
belongs to Stage 6/K-019's own design). Rather than fabricate a free-text
heuristic (which `tech_design.md` §4 step 4 explicitly rejects for the
*different* content-exposure check, and would be equally wrong here),
`impliedHintIndex` is implemented as a documented placeholder returning `0`,
wired into a real, executing comparison against `allowedHintIndex` — proven
live by a test asserting rejection at `allowedHintIndex: -1` (which only
fails because the comparison genuinely runs). A reviewer independently
confirmed this is honestly wired, not faked.

The dedicated reviewer (`mastering-typescript`/`vitest`/
`requesting-code-review`) returned **APPROVE WITH FOLLOW-UPS** — nothing
blocking, three items: (1) abstention was proven only for `initial_approach`
in the original tests, not the other two approach-discussion stages
(`approach_clarification`/`improve_approach`), even though the shared code
path made correctness not actually in doubt; (2) `containsPrivateFieldValue`
does exact-literal substring containment with no case/whitespace
normalization — a real but *documented, design-intended* residual gap per
tech_design.md §4 step 4's own "containment check against known restricted
values, not a heuristic classifier" framing, tracked here rather than fixed
now since normalizing risks false positives without a reviewed normalization
rule; (3) the handoff's test-file count was off by two (43, not 41 — pass
count was correct). Root added the missing per-stage abstention tests
(`approach_clarification`/`improve_approach`) directly: 115/115 passing in
the scoped `tests/unit/interview-orchestration` suite, typecheck/eslint/
prettier clean. Item (2) remains an open, explicitly tracked follow-up for a
future hardening pass (likely alongside K-019, which owns the real
approach-assessment confidence/evidence logic this containment check is a
coarse backstop for).

Committed as
`<US=US2, ID=T204, K=K-018, GROUP=04> feat(orchestration): enforce policy layer and deterministic fallback`.

### Group 05 — IO-04: `proposeTurn` wiring and bounded repair

RED: `application/propose-turn.ts` did not exist; all 9 new contract tests
failed (`proposeTurn is not a function`). Baseline before this group:
`test:contract` 198/198 (8 files), `test:unit` 644/644 (43 files).

GREEN: implemented `proposeTurn` exactly per `logic_and_state.md` §2 —
`operationId = "interview_turn:" + turnId + ":" + attempt` (literal, unique
per attempt); repair triggers only on `invalid_output`/`refused`/
`output_limit` and only on attempt 1; any other code, or a repeat of those
three on attempt 2, goes straight to fallback; a successful gateway result
is never re-validated at this layer. `STAGE_PROMPT` was moved from
`public.ts` to a new `application/stage-prompt.ts` (a pure, byte-identical
relocation, to avoid a `public.ts` ↔ `application/` circular import) —
`test:contract` 207/207 (+9, zero regressions).

The timeout test case required a documented, verified deviation: hanging
inside the adapter's `send()` cannot deterministically produce the real
`timeout` code with zero `send()` calls, because the gateway's own internal
retry loop (confirmed by reading `invoke.ts` directly) dispatches `send()`
a second time before the 15s total deadline elapses. Hanging inside
`prepare()` instead produces the real `attempts:0`/`outcome:'timeout'`
deterministically; the test asserts `proposeTurn` issued exactly one
logical gateway call (`timeout` is not in `REPAIRABLE_GATEWAY_CODES`),
which is the actual FR-008 property under test, not a weaker substitute —
the dedicated reviewer independently re-read `invoke.ts`'s retry condition
to confirm this claim rather than taking it on faith, and confirmed
`propose-turn.ts` has no branch sensitive to *where* inside the gateway a
timeout originates, so no real gap is left untested.

The dedicated reviewer specifically hunted for a `refused`/`invalid_output`
mapping swap (tech_design.md §2: `output_limit`/`invalid_output` both map to
`gateway_invalid_output`, but `refused` has its own distinct
`gateway_refused` value) — confirmed correct, no swap. Also verified: the
`applyPolicy` call matches Group 04's real signature (no structural-
coincidence typing), context fields thread correctly on every attempt
(only `operationId` varies), and the `STAGE_PROMPT` move changed nothing
behaviorally (Groups 03/04's own tests all still pass unchanged). Returned
**APPROVE WITH FOLLOW-UPS**: (1) `applyPolicy`'s rejected `failedStep` has
no path out of `proposeTurn` today, since `tech_design.md` §2's return type
has no field for it — correctly out of this group's scope (FR-010
telemetry is `IO-05`'s job), but `IO-05` needs either a telemetry side-
channel or a signature addition to actually capture it; (2) a cheap type-
tightening nit (`mapGatewayFailure`'s parameter was bare `string` instead of
the closed `GatewayErrorCode` union, losing compiler-enforced exhaustiveness
against future gateway codes). Root applied (2) directly (now
`GatewayErrorCode`-typed, `REPAIRABLE_GATEWAY_CODES` too); (1) is carried
forward as a Group 06 dependency note. Reran the full suite after the type
fix: **26 files, 517 tests passing**, typecheck/eslint/prettier clean,
gateway module still untouched.

Committed as
`<US=shared, ID=T208, K=K-018, GROUP=05> feat(orchestration): wire proposeTurn with bounded repair`.

### Group 06 — IO-05/IO-06: regression fixtures, telemetry, guarded-commit boundary (fixture-only)

**Part A — IO-05 (`T209`/`T210`).**

RED: `tests/fixtures/interview-orchestration/regression-fixtures.ts` and
`tests/contract/interview-orchestration/regression-fixtures.test.ts` were
authored first, exercising the not-yet-existing `onCallRecorded` request
field. Confirmed RED by temporarily stashing the `propose-turn.ts`/
`public.ts` production changes and running the new test file alone: all 13
cases failed with `expected [] to have a length of 1 but got +0` (the
telemetry callback was never invoked because the field did not exist and
was silently ignored as an unknown object key) — not a crash, the honest
failure mode for an additive optional field that the implementation does
not yet read.

GREEN: restored the production changes. `propose-turn.ts` gained:
- `TelemetryRecord` (new exported type): `sessionId`, `turnId`,
  `currentStage`, `outcome: 'proposal' | FallbackReason`, optional
  `failedStep?: PolicyFailedStep` (present only when `outcome ===
  'policy_rejected'`), and `callMetadata: GatewayCallMetadata | null` — no
  new gateway-side fields invented; `callMetadata` is exactly what
  `GatewayMetadata` already exposes (operation/provider/model/prompt/schema
  versions, `callId`/`operationId`/`requestId` correlation).
- `ProposeTurnRequest.onCallRecorded?: (record: TelemetryRecord) => void`
  — purely additive (optional, ignored if absent); invoked exactly once per
  `proposeTurn` call, at each of its three return points (gateway failure,
  policy rejection, accepted proposal), never once per internal repair
  attempt.
- This closes the Group 05 reviewer's follow-up: `applyPolicy`'s rejected
  `decision.failedStep` is now surfaced via the telemetry side-channel
  (`TelemetryRecord.failedStep`) rather than widening
  `ProposeTurnResult`'s own shape, exactly as the follow-up anticipated.

The eight FR-011 fixture categories, each as data entries in
`regression-fixtures.ts` (plain objects, no adapter mocks in the fixture
file itself) consumed by a parameterized `it.each` contract test:
ambiguous candidate input, out-of-scope/off-topic input, prompt-injection
attempts, invalid reference ID (outside the pinned pack), hint-skip attempt
(reusing `policy.test.ts`'s own `allowedHintIndex: -1` boundary technique),
abstention (no `matchedReferenceApproachId`, accepted as a normal
proposal), and each of the three FR-008 repairable codes
(`invalid_output`/`refused`/`output_limit`) individually in both directions
(repair succeeds / repair recurs to fallback). The gateway-timeout category
is a dedicated non-parameterized test reusing Group 05's established
fake-timer + hung-`prepare()` technique, since it cannot be expressed as a
canned `adapterResults` list.

Every fixture's exercising test asserts: the correct `ProposeTurnResult`
outcome; `onCallRecorded` fired exactly once; the recorded
`TelemetryRecord`'s `sessionId`/`turnId`/`currentStage`/`outcome`/
`failedStep` (where applicable); and — the FR-010 privacy requirement —
that the record's JSON serialization contains neither the fixture's own
candidate text nor its canary private-field value, and that the record has
no `responseText`/`candidateInput` property at all. `test:contract`:
220/220 (10 files) project-wide after this group (was 207/207 before);
`test:unit` unaffected at 644/644 (43 files).

**Part B — IO-06 (fixture-only, per `eng_design.md` §1's explicit scoping and this group's `T211`/`T212`).**

`tests/integration/interview-orchestration/guarded-commit.test.ts` does
**not** import, construct, or touch anything under
`src/modules/interview-session/` — confirmed by re-reading that module's
`public.ts` (still only `createSessionService`) immediately before writing
this file. `project_management/kanban_board.md` confirmed again on
2026-10-24: K-014 and K-016 remain under `## Backlog`. The test is
explicitly commented as a fixture-only design proof, not live integration.

It constructs, entirely in the test file: a minimal test-local
`TRANSITION_TABLE` (keyed by `InterviewStage`, each entry a `resolve`
guard — a deliberately partial stand-in for
`session_state_machine.md`'s §4 full table, enough rows to exercise the
boundary) and a test-local `applyGuardedCommit(session, proposalResult)`
handler. Four tests prove the intended invariant structurally, not
tautologically:

1. `suggestedTransitionSignal`'s three values (`'ready_to_advance'`,
   `'needs_clarification'`, `'none'`) are asserted, by direct membership
   check against the real `InterviewStage` domain (built from the
   orchestration module's own exported `PROMPT_BEARING_STAGES` constant
   plus `'created'`/`'completed'`), to be disjoint from every valid stage
   name. This is the structural fact that makes "simplify the handler to
   `currentStage = proposal.suggestedTransitionSignal`" a failing change,
   not a style nitpick: the right-hand side would never be a legal stage
   value in the first place.
2. A `{kind: 'proposal'}` result (produced by actually calling the real
   `proposeTurn` against a fake adapter, not a hand-typed
   `GatewayMetadata` literal, to stay honest against the real
   `callMetadata` shape) is passed through `applyGuardedCommit`; the
   resulting `currentStage` is asserted to be a real stage returned by
   `TRANSITION_TABLE[...].resolve(...)` AND explicitly asserted `not.toBe`
   the raw signal string.
3. A second case at the same `from` stage with a different signal
   (`'ready_to_advance'`) resolves to a different, also-real destination
   stage via the same table — proving the table's guard, not the signal
   value, picks the destination.
4. A `{kind: 'fallback'}` result (a real `policy_rejected` fallback,
   produced the same way) leaves `currentStage`/`version` completely
   unchanged.

`tests/integration/interview-orchestration/guarded-commit.test.ts`: 4/4
passing. Real end-to-end integration against K-014/K-016's actual
guarded-commit mutation path remains explicitly pending those cards'
observed Kanban acceptance; nothing in this group claims that integration
has happened.

**Verification.** `npx tsc --noEmit`: clean. `eslint` (scoped to the
touched orchestration src/test/fixture paths, `--max-warnings 0`): clean.
`prettier --check` on every touched/added file: clean after one
`--write` pass. Scoped run
(`tests/unit/interview-orchestration tests/contract/interview-orchestration
tests/unit/model-gateway tests/contract/model-gateway
tests/integration/model-gateway tests/unit/logger.test.ts`): **27 files,
530 tests passing** (Group 05 baseline was 26 files/517 tests; +1 file/+13
tests, the new `regression-fixtures.test.ts` — `guarded-commit.test.ts`
lives under `tests/integration/interview-orchestration`, outside this
scoped run's path list). Project-wide `test:unit`: 43 files/644 tests,
unchanged from Group 05's baseline. Project-wide `test:contract`: 10
files/220 tests (was 9 files/207 before this group's `+13`). Group 05's
original 9 `propose-turn.test.ts` tests re-ran unchanged and still pass:
`onCallRecorded` is optional and those tests never pass it, confirming the
signature extension is genuinely additive. `test:integration` was also
run project-wide: 19 pre-existing failures across
`database.test.ts`/`migrations.test.ts`/`readiness.test.ts`/
`problem-catalogue/*`/`identity-*`/`test-isolation.test.ts`, all failing at
`allocateTestDatabase` (no reachable test database in this environment) —
none under `tests/integration/interview-orchestration`, none caused by
this group; `guarded-commit.test.ts` itself passed 4/4 in that same run.

The dedicated reviewer (`mastering-typescript`/`vitest`/
`requesting-code-review`) independently reproduced the leakage check with
their own adversarial markers (a distinctive candidate string and a
distinctive model-response string, captured via `onCallRecorded` and
`JSON.stringify`'d) and found neither leaked — confirmed at both the type
level (`GatewayMetadata` has no content-bearing field) and by live repro.
They confirmed `failedStep` is populated from the real `applyPolicy`
rejection value, not a placeholder; confirmed all 8 FR-011 categories are
genuinely distinct (6 separate fixtures for the three FR-008 codes
individually, not one generic case); and specifically scrutinized the
guarded-commit test for tautology, confirming the disjoint-value-domain
assertion is a real structural proof, not a trivially-true comparison — one
informational note: the "commit" logic it drives is necessarily a
test-local stand-in, since no real session-commit code exists yet, which
the test's own comments and this section already disclose rather than
overstate. **Verdict: APPROVE**, no changes required.

Committed as
`<US=shared, ID=T214, K=K-018, GROUP=06> test(orchestration): verify regression fixtures and guarded-commit boundary`.

### Second-opinion review pass (2026-10-24, after proper `mastering-typescript`/`vitest`/`requesting-code-review`/`speckit-*` skill symlinks were installed)

Groups 01-06's original review tasks were conducted by agents instructed to
apply those skills before the symlinks existed, so the skill content itself
was not actually loadable at the time. After the symlinks were fixed, each
group was re-reviewed fresh — one dedicated reviewer per group, using the
real `requesting-code-review` skill's `code-reviewer.md` template verbatim,
exact commit-range SHAs, and genuinely loaded `mastering-typescript`/
`vitest` skill content — specifically briefed to find anything the original
pass might have missed, not to rubber-stamp.

**Results:** Groups 01, 04, and 06 returned clean approvals (no blocking or
important findings; Group 01's reviewer additionally reran the full
repo-wide suite from an isolated worktree at the exact commit and confirmed
zero collateral breakage). Groups 02, 03, and 05 each surfaced one or more
real findings, all fixed directly by root:

- **Group 03 (the most significant finding):** `renderRecentTurns` embedded
  `speaker: 'candidate'` turn text — candidate-origin text by the module's
  own type definition — without the same delimiter-neutralization applied
  to the current turn's `candidateInput`. The reviewer demonstrated a live
  bypass: a forged delimiter pair planted in one past turn survived
  unneutralized into every subsequent stage's prompt for as long as that
  turn stayed in the K=6 window (4 delimiter occurrences instead of the
  expected 2). Fixed by applying `neutralizeDelimiterOccurrences`
  uniformly inside both `renderRecentTurns` and `renderContextFields`
  (allowlisted pack fields), rather than treating `candidateInput` as the
  only defended field — closes the same bypass class for any text blob
  interpolated into a rendered prompt, not just the one call site already
  fixed. Added `tests/unit/interview-orchestration/security-hardening.test.ts`
  "Finding 3": RED confirmed via `git stash` (4 occurrences, matching the
  reviewer's reproduction exactly) before the fix, GREEN after.
- **Group 02:** the `logger.ts` `evaluationVersion` allowlist fix (from the
  original review cycle) shipped with no regression test proving it
  actually works — a future accidental revert would pass silently. Added
  two cases to `tests/unit/model-gateway/logger.test.ts`; RED confirmed by
  temporarily reverting the allowlist to one value and observing the new
  test fail, then restored and reconfirmed GREEN.
- **Group 05:** two non-blocking nice-to-haves — `mapGatewayFailure`'s
  `default` branch (any `GatewayErrorCode` outside the four itemized ones)
  had zero test coverage; added a `provider_auth_failed` →
  `gateway_unavailable` case to `propose-turn.test.ts`. Separately,
  `tech_design.md` §2's literal interface sketch had silently fallen out of
  sync with the implemented `ProposeTurnRequest` (missing the
  caller-constructed `gateway`/`onCallRecorded` fields, both legitimate,
  already-reviewed additions); added a one-paragraph addendum reconciling
  the two rather than letting the documented interface diverge from the
  shipped one.

Reran the full scoped suite after all fixes: **28 files, 540 tests
passing** (was 530 before this pass: +4 Finding-3 recentTurns cases, +1
Finding-3 pack-field case, +2 logger cases, +1 default-branch case, +1 —
also includes the 4 `guarded-commit.test.ts` cases now folded into this
command's explicit path list for the first time), `tsc --noEmit`/eslint/
prettier all clean. No file outside the six already-reviewed groups' own
modules/tests was touched by this pass.

### Group 07 — coverage, convergence, and reviewable PR

**T215-T218 (coverage config + CI stage):** `vitest.orchestration.config.ts`
added, mirroring `vitest.gateway.config.ts` exactly (same thresholds
90/90/90/85, same `autoAttachSubprocess: false` rationale), covering every
`src/modules/interview-orchestration/**/*.ts` file plus the `IO-00`-touched
gateway files (`types.ts`/`operations.ts`/`invoke.ts`) per this document's
own §4 instruction. `coverage:orchestration` script and an
`orchestration-coverage` CI stage registered in `scripts/verify-ci.ts`
(`.github/workflows/ci.yml` needed no change — its single step already runs
every registered stage with no arguments). `tests/ci/negative-controls.test.ts`
extended with `orchestration-coverage` in the expected stage list and a real
baseline-pass-then-deliberately-lowered-coverage control test, mirroring
`gateway-coverage`'s mechanics exactly — confirmed RED (stage not registered)
before the registration, GREEN after.

First coverage run (before adding tests) was below threshold on branches
(63.80%); a genuinely new test file,
`tests/unit/interview-orchestration/gateway-dispatch-boundary.test.ts` (27
real-behavior tests covering retry/budget/saturation/registry-dedup paths
that this feature's own `IO-00`-touched gateway files exercise but the
narrower `test.include` list otherwise left unexercised), closed the gap.
Final measured coverage (recorded by the implementing agent, using a pinned
Node 24.22.0 binary — this sandbox's default Node 20.20.2 cannot run
`dependency-cruiser`, the same documented limitation the K-017 precedent
hit): Statements 96.82% (336/347), Branches 92.85% (195/210), Functions
96.1% (74/77), Lines 98.11% (312/318) — all above threshold.

**Root's independent re-verification (Node 20.20.2, this sandbox's default
shell — no pinned Node 24 binary was available in this session to rerun the
coverage command itself, so coverage percentages were not independently
re-measured, only everything else below):**

- `npx tsc --noEmit`: clean.
- `npm run format:check` / `npm run lint`: both clean, whole repo.
- `npm run build`: succeeds; the printed route list is unchanged from before
  this feature (`/`, `/_not-found`, the existing health/problems/sign-in
  routes only) — confirms FR-012/SC-008's "no new route" claim directly,
  not just by contract-file diff.
- `git diff b375f18..HEAD -- contracts/api/v1_openapi.yaml contracts/events/async_schemas.json`:
  **zero lines** — confirms FR-012/SC-008's "no new event schema" claim with
  an actual diff against the pre-K-017 baseline, not a generic suite pass.
- `APP_ENV=test npx vitest run tests/ci/negative-controls.test.ts`: the new
  `orchestration-coverage` control test passes
  ("propagates an actual orchestration coverage threshold failure after a
  passing real stage baseline"). 4 *other*, pre-existing tests in this same
  file fail in this sandbox (`exposes every required CI stage...`,
  `runs the real lint stage...`, `fails unknown stages...`,
  `rejects a real source boundary violation...`) — confirmed these are
  **pre-existing and unrelated** two ways: (a) `git show 7bc128e` (the
  commit immediately before this group) shows all four already existed
  before Group 07 touched anything; (b) rerunning the already-accepted
  `vitest.gateway.config.ts` directly in this same sandbox independently
  reproduces the identical failure pattern (44 failed tests, all
  `architecture-analysis-unavailable`), proving this is the sandbox's
  Node-20-cannot-run-dependency-cruiser limitation affecting every
  architecture-dependent suite equally, not something `vitest.orchestration.config.ts`
  introduced.
- `npx vitest run tests/unit/interview-orchestration tests/contract/interview-orchestration tests/unit/model-gateway tests/contract/model-gateway tests/integration/model-gateway tests/integration/interview-orchestration tests/unit/logger.test.ts`:
  **29 files, 567 tests passing**, zero regressions.
- `APP_ENV=test npm run test:unit`: 44 files, 676 tests passing (project-wide).
- `APP_ENV=test npm run test:contract`: 10 files, 221 tests passing (project-wide).
- Ordinary tests never loaded `.env.local` or dispatched a real provider;
  `npm run build` itself loads `.env.local` for Next's own environment
  handling, unrelated to gateway/orchestration test execution (same caveat
  the K-017 precedent recorded).

**T220 (dedicated final review, full `b375f18..HEAD` range):** applying
`requesting-code-review`/`verification-before-completion`/
`mastering-typescript`/`vitest`, the reviewer traced the complete
end-to-end data flow by hand (`buildAllowlistedContext` → stage prompt
`render()` → gateway `invoke()` → `interviewTurnInputSchema`/
`interviewTurnOutputSchema` → `applyPolicy` → the guarded-commit fixture)
and confirmed every seam type-matches at the actual production call sites,
not just plausibly. Confirmed all 14 prompt modules route exclusively
through the shared `renderContextFields`/`renderRecentTurns`/
`renderUntrustedBlock` helpers — no fourth untrusted-interpolation site
exists beyond the three already fixed. Independently re-verified `tsc`/
lint/format/build/the full scoped and project-wide test counts (all
matching this document's claims exactly) and spot-checked three specific
prior claims against current HEAD (the `mapGatewayFailure` mapping, the
`logger.ts` `evaluationVersion` allowlist, `IO-00`'s fail-closed
duplicate-name guard) — all still true, no regression. Zero Critical or
Important findings. **Verdict: Ready to merge.**

Committed as
`<US=shared, ID=T221, K=K-018, GROUP=07> test(orchestration): verify coverage and convergence gates`.

**T221:** `project_management/kanban_board.md`/`kanban_tasks.csv` updated —
K-018 moved to In Progress with the full groups-00-07 evidence summary,
explicitly retaining its dependency on K-017's own pending T184 external
gate, `IO-06`'s fixture-only status pending K-014/K-016, and `IO-07`'s
deferred/unscheduled status. No M2/production completion claimed.
