# Model Gateway — Engineering Design

**Scope:** Owner-authorized Stage 4 implementation for K-017 (2026-10-23).
Planning/review and observed implementation/provider acceptance remain required;
this document does not establish completion.

## 1. Readiness and execution rules

K-017's hard prerequisites are K-002/K-006. Their foundation acceptance is recorded
in Kanban. Session APIs/full flow and K-018 are later integration dependencies,
not prerequisites for a standalone gateway. K-010–K-016 still have their own
acceptance; do not mark them complete here.

Use ADR-022's verified local configuration/privacy baseline. K-028/T034 remote
secret-injection evidence and K-026 release checks remain outstanding. Groq
is approved for local synthetic-data testing under ADR-024 (2026-10-23);
OpenAI staging/production selection remains ADR-012. No paid purchase, dependency upgrade or cloud setup
is part of this plan.

Use installed TDD, debugging, verification and review skills during implementation.
For each slice: observe a meaningful failing test, implement the smallest change,
run focused checks, then refactor. Spec Kit scratch artifacts stay ignored;
this document owns accepted implementation detail, Kanban/CSV own status.

## 2. Proposed files

```text
src/modules/model-gateway/
  public.ts
  application/{invoke,operations,validation,budgets,metadata}.ts
  adapters/{fake,groq,openai,transport}.ts
src/server/model-gateway.ts              # runtime composition/lifecycle
scripts/model-gateway-smoke.ts           # explicit operator-only probe
tests/unit/model-gateway/                # policy, schemas, limits, metadata
tests/integration/model-gateway/         # controlled HTTP provider fixtures
tests/contract/model-gateway/            # common adapter scenarios
tests/fixtures/model-gateway/            # synthetic versioned examples only
```

Extend existing `src/server/config.ts`, `src/server/logger.ts`, runtime/bootstrap
composition and architecture/privacy tests only where needed. The paths below
are planned files, not existing commands or implementation evidence.

## 3. Task breakdown and traceability

All tasks belong to **K-017**. The owner authorized implementation; task markers
require observed evidence. MG labels summarize work areas; unique T133 onward
below own the reviewed execution order. Kanban/CSV remain the status authority.

| Task  | Deliverable and failing-test target                                                                                                                                                                                                                                                                                                                              | Requirements / depends on                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| MG-01 | Review provider exception, four documents, dependency evidence and checklist. Define probe schema/fixtures and `public.ts` types; contract test rejects unknown operation and incomplete definition.                                                                                                                                                             | FR-001–004, FR-010–011; planning review                          |
| MG-02 | Add validated adapter settings, selected-key requirement, remote rejection and runtime composition. Tests prove disabled/fake need no key, test mode rejects real dispatch, Groq requires development plus a trusted synthetic harness, public secrets fail, HMR reuses one gateway and shutdown aborts calls.                                                   | FR-009–011; MG-01                                                |
| MG-03 | Implement registry, validators and fake vertical slice in `application/` and `adapters/fake.ts`. Test complete typed success, empty/refused/truncated/tool/invalid output and zero network on bad input.                                                                                                                                                         | FR-001–004, FR-012; MG-01; runtime enablement follows MG-02      |
| MG-04 | Implement deadline/admission/retry/cost reservation in `application/budgets.ts` and `adapters/transport.ts`. Fake-clock and controlled-server tests cover byte limits, missing Content-Length, hung reads, caller abort, late results, Retry-After, total deadline, two-attempt ceiling, saturation, preparation/backoff failures and cleanup before each retry. | FR-005–007, FR-012; MG-03                                        |
| MG-05 | Add allowlisted usage/cost/outcome telemetry in `application/metadata.ts` and existing logger. Tests cover partial usage after retries, missing usage/rates, reasoning/cache accounting and secret/content canaries and finalized zero-attempt rejection telemetry.                                                                                              | FR-008–009, FR-012; MG-04                                        |
| MG-06 | Implement isolated Groq Chat Completions adapter and bounded operator probe. Run common adapter contract tests against controlled fixtures; preserve model mapping, strict JSON-schema validation and synthetic-only operator access.                                                                                                                            | FR-001–003, FR-010, FR-012; MG-05; accepted ADR-024 restrictions |
| MG-07 | Implement OpenAI Responses text adapter against the same internal scenarios, including provider-specific extraction/refusal/incomplete handling and the complete shared error matrix. No audio/tools/streaming; no response-shape assumptions copied from Groq.                                                                                                  | FR-001–003, FR-006, FR-011–012; MG-05                            |
| MG-08 | Add architecture/client/privacy regressions, configuration examples and smoke instructions to `docs/development.md`. Record provider gates and rollback; review, run consistency/verification, then Spec Kit convergence and reconcile gaps.                                                                                                                     | FR-001–012; MG-06–07                                             |

MG-06 and MG-07 adapter fixtures can be developed independently after MG-05;
runtime selection/operator dispatch waits for group 04. MG-02 is deliberately
composed after the tested core/adapters. Adding an adapter never wires it into
candidate-facing session handlers.

## 3.1 Detailed execution groups and review/commit gates

### Execution rules

The owner requested distinct agents for Spec Kit stages and dedicated relevant-stack
review agents for every group. Root owns all Git operations. Each production
slice records the intended failing test (RED), the smallest passing change
(GREEN), then refactoring under passing tests. Every group ends with a separate
review task, technical feedback resolution using receiving-code-review, and a
root commit task. Dependent groups wait for that reviewed commit. Use installed
TDD, systematic-debugging, requesting-code-review, verification-before-completion,
mastering-typescript and vitest skills as relevant; verify their prerequisites.
No dependency upgrade, cloud setup, database migration, UI, public API, audio,
model tools/streaming, business-operation enablement or session integration.

Task IDs start at T133 after the verified prior canonical/GitHub maximum T132.
Issue mirrors derive from these exact T/K IDs and dependencies; they never replace
Kanban/CSV. All markers below begin unchecked. Planning quality, existing suite
results and generated checkboxes do not prove feature implementation.

### Group 00: Planning and consistency gate

**Traceability:** shared; MG-01–08; FR-001–012.

**Dependencies / independent acceptance:** K-002/K-006 accepted; no production code before T138. Four canonical documents, checklist quality, tasks/dependencies and analysis are reviewed.

- [x] T133 Reconcile separate-agent specify, clarify and plan results with docs/03_features/model_gateway/ requirements, technical design, engineering design and pseudocode; retain ADR-012/022/024 and canonical session/LLM/voice/API/event boundaries.
- [x] T134 Review all requirements-quality criteria in .specify/work/model_gateway/checklists/gateway.md against the four canonical documents; retain per-item evidence and distinguish approved requirements quality from implementation completion; reconcile added TDD/group/coverage/native-fetch/CI criteria here.
- [x] T135 Run $speckit-analyze against .specify/work/model_gateway/{spec.md,plan.md,tasks.md}; reconcile findings in docs/03_features/model_gateway/specifications/engineering/eng_design.md and iterate until no unresolved blocking contradiction or missing requirement coverage.
- [x] T136 Run $speckit-taskstoissues only after T135: root creates derived GitHub mirrors with canonical T IDs, K-017, group/dependencies and acceptance evidence; record issue links in docs/03_features/model_gateway/specifications/engineering/eng_design.md; retain Kanban/CSV authority.
- [x] T137 Dedicated review agent applies requesting-code-review and relevant TypeScript/Vitest/architecture guidance to docs/03_features/model_gateway/ planning, task coverage, prerequisites, scope and test strategy; root resolves technical feedback and obtains clean review before code.
- [x] T138 Root verifies scoped planning diff and observed gate evidence in docs/03_features/model_gateway/specifications/engineering/eng_design.md, then commits group 00 using the exact title below; exclude unrelated working changes and ignored artifacts.

**Commit title:** `<US=shared, ID=T138, K=K-017, GROUP=00> docs(gateway): record reviewed implementation tasks`

### Group 01: US1 — Registered validated fake call

**Traceability:** US1; MG-01/03; FR-001–004, FR-008–012.

**Dependencies / independent acceptance:** T138; exact typed synthetic fake result and zero dispatch on unknown, disabled or invalid input. No runtime provider composition yet.

- [x] T139 [US1] RED: add tests/unit/model-gateway/operations.test.ts and tests/contract/model-gateway/registry.test.ts plus tests/fixtures/model-gateway/ versioned synthetic fixtures; reject unknown/disabled operations and incomplete schema/prompt/evaluation/context/model/budget definitions, invalid IDs and extra fields; observe failures.
- [x] T140 [US1] Implement src/modules/model-gateway/public.ts and application/{operations,validation}.ts with the canonical model map; gateway_probe accepts exactly {text:string}, "1–512 UTF-8 bytes", and outputs exactly {schemaVersion:1,acknowledged:true}; business/audio/Astra operations stay disabled; schema/JSON Schema use the same fixtures; run T139 GREEN and refactor.
- [x] T141 [US1] RED: add tests/unit/model-gateway/invoke.test.ts and fake.test.ts for strict typed success, preflight zero dispatch, empty/malformed/refused/truncated/tool/unknown-field output rejection and caller-owned proposal semantics; observe failures.
- [x] T142 [US1] Implement the fake vertical slice in src/modules/model-gateway/application/invoke.ts and adapters/fake.ts through public.ts; no database/session/score/hint mutations, provider fallback or repair; return discriminated results and safe metadata; run T139/T141 GREEN and refactor.
- [x] T143 [US1] Dedicated review agent uses mastering-typescript, vitest and requesting-code-review to review src/modules/model-gateway/ schema, registry, fake/public boundary and RED/GREEN evidence; root resolves findings technically, reruns focused unit/contract checks and reconciles accepted changes in docs/03_features/model_gateway/.
- [x] T144 [US1] Root verifies focused checks and scoped diff, records evidence in docs/03_features/model_gateway/specifications/engineering/eng_design.md, then commits group 01 with the exact title below.

**Commit title:** `<US=US1, ID=T144, K=K-017, GROUP=01> feat(gateway): validate registered fake operations`

### Group 02: US2 — Bounded invocation, transport and metadata

**Traceability:** US2; MG-04/05; FR-003–009, FR-012.

**Dependencies / independent acceptance:** T144; deterministic clocks/owned HTTP fixtures prove bounded failure, resource recovery and exactly one finalized safe summary on every exit.

- [x] T145 [US2] RED: add tests/unit/model-gateway/budgets.test.ts for "2" in-flight calls/no waiting queue, "15 seconds" total deadline, "6 seconds" clipped attempt timeout, "2" total attempts and production estimated-cost admission; include safe upper-bound/rate-card absence, zero-attempt saturation and reservation release; observe failures.
- [x] T146 [US2] Implement src/modules/model-gateway/application/budgets.ts and invoke.ts admission/deadline/cost reservation across both possible attempts; production rejects missing reviewed numeric rates/cap or unsafe token bounds, fixture/Groq unknown costs remain unknown; run T145 GREEN and refactor.
- [x] T147 [US2] RED: add tests/integration/model-gateway/transport.test.ts with owned local HTTP server/dummy credentials for "16 KiB" serialized request, "128 KiB" response, missing/false Content-Length, hung/partial reads, redirect denial, abort, late result and reader cancellation; observe failures.
- [x] T148 [US2] Implement src/modules/model-gateway/adapters/transport.ts bounded incremental complete-body reading, fixed/allowlisted provider origins, redirect denial and no hidden retries; test-only injected local transport is unavailable to runtime production composition; run T147 GREEN and refactor.
- [x] T149 [US2] RED: add tests/unit/model-gateway/retries.test.ts and cleanup.test.ts for same-provider/model retry, cancellation before deadline before late success, attempt timeout versus total timeout, "250–500 ms" jitter and valid delta/date Retry-After with "2 seconds" maximum; preparation/backoff/cleanup/telemetry exceptions, exhausted attempts and release ordering before retry; observe failures.
- [x] T150 [US2] Complete src/modules/model-gateway/application/invoke.ts outer finalization and per-attempt abort/reader/listener/timer cleanup before backoff/redispatch; preserve caller logical identity/new attempt identity, honor remaining deadline/output/cost bounds and reject premature Retry-After retry; run T145/T147/T149 GREEN and refactor.
- [x] T151 [US2] RED: add tests/unit/model-gateway/metadata.test.ts and logger.test.ts for zero-attempt/failure/success summaries, unknown provider/version fields, untrusted operation label unknown, missing/partial usage, invalid counts, reasoning/cache without double-counting, cost estimate versus unknown actual charge and secret/content canaries; observe failures.
- [x] T152 [US2] Implement src/modules/model-gateway/application/metadata.ts and deliberate src/server/logger.ts allowlist extension for model_call_completed; retain per-attempt unknown completeness, versions/correlation/timing/outcome and bounded labels; isolate telemetry/cleanup faults from original outcome; run T151 and cleanup tests GREEN and refactor.
- [x] T153 [US2] Dedicated review agent applies TypeScript/Vitest and requesting-code-review to src/modules/model-gateway/application/, adapters/transport.ts and src/server/logger.ts: all exits, bounded reads, retry/cost matrix, cleanup race ordering and privacy; root resolves findings and reruns affected unit/integration checks; record evidence in docs/03_features/model_gateway/specifications/engineering/eng_design.md.
- [x] T154 [US2] Root verifies group 02 focused checks and scoped diff, records RED/GREEN/review evidence in docs/03_features/model_gateway/specifications/engineering/eng_design.md, then commits with the exact title below.

**Commit title:** `<US=US2, ID=T154, K=K-017, GROUP=02> feat(gateway): bound invocation and usage accounting`

### Group 03: US3 — Isolated Groq and OpenAI wire adapters

**Traceability:** US3; MG-06/07; FR-001–003, FR-005–006, FR-008–012.

**Dependencies / independent acceptance:** T154; same adapter success/error corpus passes using owned local servers and dummy credentials; no external account or runtime real-provider dispatch.

- [x] T155 [US3] RED: define tests/contract/model-gateway/adapter-contract.test.ts and tests/fixtures/model-gateway/ shared scenarios for canonical technical §4 full error/retryability matrix: 3xx, 400/413/422/context limit, 401/403, 404, 408, recognized transient/quota/unknown 429, other 4xx/5xx, connection/attempt timeout, invalid content/envelope/JSON and refused/truncated/tool output; observe failures before mapping implementation.
- [x] T156 [US3] Implement shared safe classification/adapter types within src/modules/model-gateway/adapters/transport.ts and application/validation.ts as needed; recognized machine codes only, no free-text matching/body/header leakage; quota_exhausted/provider_rejected terminal; run applicable T155 fixture cases GREEN and refactor without assuming identical provider envelopes.
- [x] T157 [P] [US3] RED: add tests/contract/model-gateway/groq.test.ts and tests/integration/model-gateway/groq.test.ts for Chat Completions origin/wire shape, strict schema, approved openai/gpt-oss-120b model, completion limit "1,024" including reasoning where counted, bounded usage/error extraction and shared corpus; observe failures.
- [x] T158 [US3] Implement src/modules/model-gateway/adapters/groq.ts against injected owned-fixture transport and canonical schema; reject refusal/truncation/tools before success validation, retain unknown usage, no OpenAI-response-shape assumptions; run T157/shared contract GREEN and refactor.
- [x] T159 [P] [US3] RED: add tests/contract/model-gateway/openai.test.ts and tests/integration/model-gateway/openai.test.ts for Responses origin/wire shape, store:false, gpt-6.1-sol probe, refusal/incomplete/tool/malformed envelopes, usage/model extraction and every shared matrix scenario; observe failures.
- [x] T160 [US3] Implement src/modules/model-gateway/adapters/openai.ts with Responses-specific complete extraction/validation, safe errors and bounded limits; preserve canonical disabled business/audio/Astra map, no automatic substitution; run T159/shared corpus GREEN and refactor.
- [x] T161 [US3] Dedicated review agent uses TypeScript/Vitest and requesting-code-review plus current official provider documentation where verification is needed to review src/modules/model-gateway/adapters/ wire formats, capability/schema/error matrix and test-only transport isolation; root resolves findings, reruns affected checks and records evidence in docs/03_features/model_gateway/specifications/engineering/eng_design.md.
- [x] T162 [US3] Root verifies group 03 contract/integration checks and scoped diff, records evidence in docs/03_features/model_gateway/specifications/engineering/eng_design.md, then commits with the exact title below.

**Commit title:** `<US=US3, ID=T162, K=K-017, GROUP=03> feat(gateway): isolate provider text adapters`

### Group 04: US3 — Runtime, privacy and trusted operator probe

**Traceability:** US3; MG-02/06/08; FR-001, FR-004–005, FR-009–012.

**Dependencies / independent acceptance:** T162; enforced environment/provenance matrix, singleton lifecycle and secret/content boundaries; separately sanitized bounded Groq evidence.

- [ ] T163 [US3] RED: add tests/unit/model-gateway/config.test.ts for MODEL_GATEWAY_ADAPTER default disabled; development disabled/fake/explicit groq/openai, test disabled/fake only, staging/production disabled/openai only; selected real key required, other key unnecessary, public secret variants including NEXT_PUBLIC_GROQ_API_KEY rejected; observe failures without real keys.
- [ ] T164 [US3] Extend src/server/config.ts for server-only selected-adapter settings and implement trusted composition in src/server/model-gateway.ts; only checked-in synthetic fixture harness can acquire Groq gateway_probe capability, never caller synthetic=true or public route/session data; run T163 GREEN and refactor.
- [ ] T165 [US3] RED: add tests/unit/model-gateway/runtime.test.ts and tests/process/model-gateway.test.ts for HMR reuse of one limiter/client, shutdown cancellation/resource recovery, disabled unrelated readiness and uncached health without provider inference; observe failures.
- [ ] T166 [US3] Compose src/server/model-gateway.ts through existing src/server/runtime.ts and bootstrap.ts lifecycle seams only where needed; preserve health/config/privacy behavior and prohibit runtime test real dispatch even when fixture adapters can inject dummy local transport; run T165 plus affected lifecycle tests GREEN and refactor.
- [ ] T167 [US3] RED: extend tests/architecture/ and tests/unit/model-gateway/privacy.test.ts with native-fetch provider-origin/direct-call violations outside src/modules/model-gateway/adapters/, cross-module public.ts bypass, client-secret reachability (including NEXT_PUBLIC_GROQ_API_KEY), provider-body/log/client-asset/hidden-content canaries and no session/database writes; observe boundary/privacy failures.
- [ ] T168 [US3] Extend scripts/check-boundaries.ts and .dependency-cruiser.cjs as appropriate to enforce native-fetch provider boundary as well as SDK imports; retain server-only/client protections and add minimal allowlists in src/server/logger.ts only where canonical fields demand; run T167 GREEN with genuine negative-control failures observed and refactor.
- [ ] T169 [US3] RED: add tests/unit/model-gateway/smoke.test.ts and tests/process/model-gateway-smoke.test.ts for explicit adapter selection, trusted fixture choice only, no arbitrary payload/key CLI arguments, test/remote Groq rejection, default bounded calls, "5" logical calls/"10" attempts maximum, concurrency "1", cancellation and sanitized evidence; observe failures.
- [ ] T170 [US3] Implement scripts/model-gateway-smoke.ts and package.json operator command with trusted tests/fixtures/model-gateway/ inputs and bounded summary-only output; document actual command in docs/development.md and safe runtime key-name references, never values; run T169 GREEN and refactor.
- [ ] T171 [US3] Dedicated review agent applies relevant TypeScript/Vitest/Next.js lifecycle, requesting-code-review and privacy guidance to src/server/model-gateway.ts, touched shared files, native-fetch negative controls and scripts/model-gateway-smoke.ts; root resolves feedback, reruns affected checks and records evidence in docs/03_features/model_gateway/specifications/engineering/eng_design.md before live dispatch.
- [ ] T172 [US3] After T171, root runs the explicitly authorized local Groq synthetic probe using scripts/model-gateway-smoke.ts with at most five logical calls/ten attempts, concurrency one; retain only model/config/schema versions, outcome/timing/available usage in docs/03_features/model_gateway/specifications/engineering/eng_design.md; no secret reads into agent context or candidate inputs. Record unavailable/failed truthfully; Groq evidence cannot satisfy T184.
- [ ] T173 [US3] Root verifies group 04 scoped diff, deterministic checks and separately identified real Groq result, records evidence in docs/03_features/model_gateway/specifications/engineering/eng_design.md, then commits with the exact title below; any smoke unavailability remains explicit rather than a fabricated pass.

**Commit title:** `<US=US3, ID=T173, K=K-017, GROUP=04> feat(gateway): enforce runtime and synthetic probe boundaries`

### Group 05: Coverage, convergence and reviewable PR

**Traceability:** shared; MG-08; FR-001–012.

**Dependencies / independent acceptance:** T173; deterministic feature/code acceptance and CI enforcement complete independently of unavailable external OpenAI T184. K-017 remains incomplete while T184 is pending.

- [ ] T174 RED: add meaningful missing-path tests under tests/unit/model-gateway/, tests/integration/model-gateway/, tests/contract/model-gateway/ and tests/process/model-gateway-smoke.test.ts for newly exposed branches and touched shared behavior; add coverage configuration assertions in tests/ci/negative-controls.test.ts; observe intended behavioral/coverage failures rather than writing mirror tests.
- [ ] T175 Add vitest.gateway.config.ts and package.json coverage:gateway with at least "90%" statements, lines and functions and "85%" branches (preserve stricter existing rules); include every new production src/modules/model-gateway/**/*.ts, src/server/model-gateway.ts and scripts/model-gateway-smoke.ts plus all touched shared config/logger/runtime/bootstrap/architecture behavior. Include uncovered files, not imported-only selection; inspect raw reports and justify any exclusion without hiding behavior; run T174/feature coverage GREEN and refactor.
- [ ] T176 RED: extend tests/ci/negative-controls.test.ts exact stage list with gateway-coverage and a real stage baseline that passes, then deliberately lowers measured production coverage and proves nonzero CI failure propagation; no mock exit or string-only stage registration proof; observe failure before implementation.
- [ ] T177 Add gateway-coverage in scripts/verify-ci.ts and .github/workflows/ci.yml where required; update isolated fixture helpers/config copying as needed, preserve inherited mandatory CI stages and credentials-free APP_ENV=test. Run T176 GREEN including actual ci_stage_failed:gateway-coverage evidence and refactor.
- [ ] T178 Run pinned Node 24.22.0/npm 11.19.1 npm run format:check, lint, typecheck, test:unit, APP_ENV=test npm run test:integration, test:contract, verify:architecture, test:process, test:ci, coverage:gateway, npm test and npm run build; run affected browser/privacy/client-build checks where applicable. Record exact commands, counts, coverage summary, failures/skips/unavailable checks and report paths in docs/03_features/model_gateway/specifications/engineering/eng_design.md; ordinary tests never load .env.local or dispatch real providers.
- [ ] T179 Run installed $speckit-converge then $speckit-analyze against .specify/work/model_gateway/; reconcile actual gaps as new globally unique T tasks in docs/03_features/model_gateway/specifications/engineering/eng_design.md and canonical Kanban mapping; iterate implementation/TDD/review/coverage until no unresolved code-acceptance gap; keep T184 external.
- [ ] T180 Reconcile accepted changes across docs/03_features/model_gateway/ four documents and docs/development.md operator/rollback/provider evidence; update canonical contracts/ADR register only if an actual reviewed interface/significant decision changed. Preserve no-session/no-audio scope, deployment T034/K-028 and K-026, and unrelated catalogue T132 gate.
- [ ] T181 Dedicated final review agent uses requesting-code-review, verification-before-completion and relevant TypeScript/Vitest/Next.js/security guidance to review complete requirements, coverage, transport/lifecycle, privacy, errors, CI controls and RED/GREEN evidence; root resolves feedback technically, reruns affected checks and repeats convergence where changes warrant; record review in docs/03_features/model_gateway/specifications/engineering/eng_design.md.
- [ ] T182 Update project_management/kanban_board.md and kanban_tasks.csv together only for observed code/development acceptance; retain K-017 In Progress and explicit T184 OpenAI external gate while missing, with no M2/production completion claim; record derived issue/PR links and concise useful handoff in docs/03_features/model_gateway/specifications/engineering/eng_design.md.
- [ ] T183 Root verifies final scoped diff/evidence, commits group 05 with the exact title below, pushes feature/model-gateway and opens a linked reviewable PR stacked on feature/problem-catalogue-immutable-packs; include tests, real Groq result, pending T184/OpenAI and release gates in PR and docs/03_features/model_gateway/specifications/engineering/eng_design.md. Hosted results apply only to the tested commit.

**Commit title:** `<US=shared, ID=T183, K=K-017, GROUP=05> test(gateway): verify coverage and acceptance gates`

### Separate external provider acceptance gate

- [ ] T184 EXTERNAL OPENAI GATE: when legitimate account/model access and funding are available, run the separately reviewed bounded synthetic OpenAI probe with scripts/model-gateway-smoke.ts; verify authentication, Responses schema/model behavior and safe usage evidence in docs/03_features/model_gateway/specifications/engineering/eng_design.md. Missing access/funding permits deferral of this task only; fake/Groq/fixture results do not complete K-017, M2 or production activation. No key values, paid purchase or new provider setup is implied.

### Dependencies and safe parallel work

Group 00 → 01 → 02 → 03 → 04 → 05. T184 follows reviewed runtime/smoke
implementation (T171/T170), independently of code-only PR preparation; it is not
a prerequisite for deterministic code work. Within group 03, T157 and T159 may
prepare disjoint Groq/OpenAI tests after T156; T158/T160 may proceed on their
separate adapter/test paths once their RED evidence exists. No concurrent shared
transport/config/logging mutations, dependent reviews, commits or live smoke.
US1 registry tests may prepare independent input/output fixtures; US2 transport
server cases and pure metadata fixtures may be authored independently after
T144 with explicit file ownership, but invoke/finalization work remains ordered.

US1 independently proves exact fake proposals/zero preflight dispatch. US2
independently proves bounded failure, full cleanup and finalized safe metadata.
US3 independently proves shared adapter contracts, restricted composition and
trusted operator behavior. MVP is US1's reviewed fake slice; the owner authorized
the complete bounded feature, so continue through group 05 while retaining the
separate external gate.

### Planning-stage evidence (2026-10-23)

Separate agents executed specify, clarify, plan and checklist in sequence with
explicit SPECIFY_FEATURE_DIRECTORY=.specify/work/model_gateway. Built-in spec
quality: 16/16; clarification: zero questions, all taxonomy categories Clear;
plan: constitution pre/post checks pass, existing accepted design retained;
custom checklist: all 16 criteria reviewed with the evidence retained below.
The additional four criteria passed only after this grouped task refinement. No feature
test, smoke, implementation task, analysis, review, issue or commit passes are
claimed by task generation. Root must record their observed outcomes separately.

## 4. Verification plan

| Layer                | Required evidence                                                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                 | Registry/input/output checks; retry/error matrix; fake-clock deadlines; concurrency cleanup; conservative production cost reservation; unknown usage; zero state-writing dependencies.                                                                                       |
| Integration          | Local controlled HTTP fixtures for both provider wire formats, 401/403/404/408, context-limit 400, transient/quota/unknown 429, other 4xx/5xx, partial/oversized bodies, redirects, malformed envelopes, response cancellation and recovery. No external key/network needed. |
| Contract             | Same success/failure corpus for fake/Groq/OpenAI adapters; JSON Schema agrees with runtime validator. Existing canonical API/events still validate.                                                                                                                          |
| Architecture/privacy | Consumers import only `public.ts`; provider URLs/wire code stay in adapters; no client secret reachability, hidden-content forwarding, payload logging or provider inference from health probes.                                                                             |
| Real service         | Explicit synthetic probe, at most 5 calls/10 attempts, concurrency 1, no candidate data. Record model/config/schema versions, sanitized outcome, timing and available usage. Groq and OpenAI evidence are separate.                                                          |
| Consumer end-to-end  | K-018/later features verify ownership, idempotency, stale-result discard, persisted versions, safe hints and failure neutrality through real session APIs. Not claimed by the standalone probe.                                                                              |

Adapter fixtures use dummy credentials and a trusted injected transport to an
owned local server; runtime test mode still forbids real-provider dispatch.
MG-02 checks the whole environment matrix; MG-04/05 check every invocation exit
and cleanup ordering; MG-06/07 share the exact error-code/retryability corpus.
For fixture or Groq development, cost metadata may be unknown; no real charge is
inferred from a free allowance. Production remains blocked until reviewed prices,
conservative token bounds and numeric per-call caps are supplied.

Use the pinned Node 24.22.0/npm 11.19.1 environment from development guidance;
the ambient shell runtime may differ. Existing verification commands:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:contract
npm run test:integration
npm run verify:architecture
npm run build
```

Integration checks require their documented local database prerequisites. During
implementation add focused gateway tests to these suites; document the operator
probe invocation only once its script exists. Ordinary CI must never load
`.env.local` or call a real provider. Report actual commands/counts and distinguish
failed, skipped and unavailable checks. Run `$speckit-converge` after implementation.

## 5. Migration, rollout and acceptance

No schema migration or public API/event change is needed for the standalone
gateway. A later durable ModelUsage design must separately review schema,
retention and consumer needs; do not add a table speculatively here.

Roll out disabled -> fake -> explicit local Groq probe -> bounded OpenAI probe
-> individually qualified business operations in owning features. Before public
activation, review numeric production budgets, per-user/fleet limits, model
quality thresholds, data controls and real-service evidence. Keep Astra disabled.

Rollback disables the affected operation/adapter and uses existing caller
recovery; it does not switch providers silently, delete records or rewind
committed session state. In-flight work is cancelled; late results are ignored.

K-017 completion needs its implementation, reviewed tests and isolated OpenAI
adapter evidence. If OpenAI access is unavailable, record that gate on K-017
and its CSV export (T184); Groq/fake progress does not establish M2 or production
acceptance. Update task status only after observed criteria pass.

## 6. Durable planning-quality review evidence

The owner authorized assisted checklist review. Separate generation and reviewer
evaluation assessed written requirements, never implementation. Original twelve
criteria passed individual review; the planning coordinator evaluated CHK013–016
after canonical grouped tasks existed. Built-in specification quality is 16/16;
custom requirements quality is 16/16. No runtime, provider or Kanban acceptance
follows from these results. The ignored working copies remain disposable.

| Criterion                                | Written evidence and quality conclusion                                                                                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CHK001 Operations and provider selection | Requirements FR-001–002 and technical §§1–3 specify trusted registered operations, complete declarations and fixed provider/model selection; missing declarations disable dispatch.                                                       |
| CHK002 Validation and caller authority   | FR-003–004, technical §§2,4,6 and pseudocode §4 separate exact schema validation from caller authorization, semantic/evidence checks and guarded persistence.                                                                             |
| CHK003 Total bounded lifecycle           | FR-005–006, technical §4 and pseudocode §2 bound preparation, attempts, reads, waits and cleanup with cancellation priority; T145–150 preserve their measurable limits and failure cases.                                                 |
| CHK004 Resource and cost bounds          | FR-007 and technical §§4–5 quantify bytes/tokens/concurrency/smoke; reviewed production rates, safe upper bounds and positive estimated-cost caps are mandatory or dispatch is rejected; T145–150 retain this activation gate.            |
| CHK005 Usage and charges                 | FR-008, technical §5 and pseudocode §3 distinguish partial/unknown counts, estimate versus actual unknown charge, and reasoning/cache inclusion; T151–152 require these cases.                                                            |
| CHK006 Privacy and keys                  | FR-009 and technical §§1,3,5 prohibit credentials, hidden tests/outputs, reviewer notes and raw content logging; public secret variants are rejected; T163 and T167–168 cover canaries.                                                   |
| CHK007 Provider exception                | Requirements §2, FR-010–011, technical §3 and ADR-024 restrict local Groq 120B to trusted synthetic fixtures; test is fake/disabled, staging/production OpenAI/disabled; OpenAI evidence remains separate T184.                           |
| CHK008 Contract impact                   | Requirements §5, technical §6 and pseudocode §4 preserve session/LLM/voice/API/event ownership; Stage 4 adds no route, event or migration and makes no session writes.                                                                    |
| CHK009 Verification layers               | FR-012 and engineering §4 separate fake, owned controlled-server tests, bounded independent real-provider smoke and later consumer e2e; T155–172 and T184 retain those distinctions.                                                      |
| CHK010 Rollout and rollback              | Engineering §5 and technical §§4,6 cancel/disable affected calls, discard late/stale results and preserve committed state; no silent fallback or rewind.                                                                                  |
| CHK011 Dependencies and activation       | Requirements §5 and engineering §§1,5 distinguish accepted K-002/K-006, later K-018 and remote/release K-028/T034/K-026 gates; budgets, quality sets and data controls remain required before activation.                                 |
| CHK012 Status authority                  | Engineering §§1,3,5 retain Kanban/CSV and observed evidence; T182 keeps K-017 incomplete while T184 is pending. Planning and generated markers never establish completion.                                                                |
| CHK013 Group discipline                  | Engineering §3.1 has explicit TDD slices, dedicated relevant-stack reviewers T137/143/153/161/171/181 and separate root commits T138/144/154/162/173/183, with feedback resolution before dependent groups.                               |
| CHK014 Coverage                          | T174–175 quantify at least 90% statements/lines/functions and 85% branches, uncovered production inclusion, every new module/composition/operator file and touched shared behavior; exclusions require a reason and cannot hide behavior. |
| CHK015 Native-fetch boundaries           | T167–168 require actual provider-origin/direct-call negative controls outside adapters and client-secret/hidden-content canaries including NEXT_PUBLIC_GROQ_API_KEY, extending the existing SDK-import guard.                             |
| CHK016 CI enforcement                    | T176–177 require named gateway-coverage registration, exact stage-list integration and an actual passing baseline followed by below-threshold production coverage that fails CI; credentials and external providers are excluded.         |

Task generation and this quality review leave all implementation checkboxes
unchecked. Root independently executes analysis, planning review, issue export
and commit gates before production code. Commands executed for planning resolve
`.specify/work/model_gateway` through explicit environment overrides and the
verified `.specify/feature.json` pointer. No extension hooks are configured.

## 7. Observed orchestration evidence

### Group 00 — planning gate

Branch `feature/model-gateway` starts at catalogue head `ef2f401`; the catalogue
PR #136 remains open, so the feature PR targets
`feature/problem-catalogue-immutable-packs`. Existing user skill/setup changes
are excluded from this feature's commits.

Separate agents ran specify, clarify, plan, checklist and tasks. Specification
quality is 16/16; clarification found no new material question; the 16 custom
quality criteria have per-item written evidence in §6. The tasks agent produced
52 unique tasks, T133–T184, with separate review/commit tasks in all six groups.

The dedicated analyze agent found 17/17 FR/SC coverage, no critical/high finding,
and two reference issues: the workflow filename and stale pending-reconciliation
wording. Both were corrected in canonical/working artifacts. T137's independent
TypeScript/Vitest/architecture planning reviewer checked exact task parity,
continuous IDs and all group gates and approved with no blocking/important
finding. These are planning checks, not implementation acceptance.

Pinned-runtime baseline before feature code: `APP_ENV=test npm run test:unit`
passed 26 files/337 tests; `npm run typecheck` passed. Installed-skill validation
`python3 skills/scripts/manage_skills.py` passed 50 registrations/561 source files.
The issue export and root commit receipts follow after read-back verification.

### Derived issue export and planning commit

The dedicated taskstoissues agent refreshed all-state GitHub deduplication,
created 52 derived mirrors with zero skips/duplicates, and bulk-read every task
body/title/link back. Each title contains only its own task ID; full task text,
K-017, group, prerequisites and evidence remain in the body. T184 stays open and
unverified. These issues do not replace Kanban/CSV or establish implementation.

Root verified the scoped planning changes and commits them with:
`<US=shared, ID=T138, K=K-017, GROUP=00> docs(gateway): record reviewed implementation tasks`.
The initial final scoped formatter check found an engineering-document format
warning; formatting was corrected and rechecked before commit.

| Canonical task | Derived GitHub issue                                           |
| -------------- | -------------------------------------------------------------- |
| T133           | [#137](https://github.com/Gyan172004/my-new-system/issues/137) |
| T134           | [#138](https://github.com/Gyan172004/my-new-system/issues/138) |
| T135           | [#139](https://github.com/Gyan172004/my-new-system/issues/139) |
| T136           | [#140](https://github.com/Gyan172004/my-new-system/issues/140) |
| T137           | [#141](https://github.com/Gyan172004/my-new-system/issues/141) |
| T138           | [#142](https://github.com/Gyan172004/my-new-system/issues/142) |
| T139           | [#143](https://github.com/Gyan172004/my-new-system/issues/143) |
| T140           | [#144](https://github.com/Gyan172004/my-new-system/issues/144) |
| T141           | [#145](https://github.com/Gyan172004/my-new-system/issues/145) |
| T142           | [#146](https://github.com/Gyan172004/my-new-system/issues/146) |
| T143           | [#147](https://github.com/Gyan172004/my-new-system/issues/147) |
| T144           | [#148](https://github.com/Gyan172004/my-new-system/issues/148) |
| T145           | [#149](https://github.com/Gyan172004/my-new-system/issues/149) |
| T146           | [#150](https://github.com/Gyan172004/my-new-system/issues/150) |
| T147           | [#151](https://github.com/Gyan172004/my-new-system/issues/151) |
| T148           | [#152](https://github.com/Gyan172004/my-new-system/issues/152) |
| T149           | [#153](https://github.com/Gyan172004/my-new-system/issues/153) |
| T150           | [#154](https://github.com/Gyan172004/my-new-system/issues/154) |
| T151           | [#155](https://github.com/Gyan172004/my-new-system/issues/155) |
| T152           | [#156](https://github.com/Gyan172004/my-new-system/issues/156) |
| T153           | [#157](https://github.com/Gyan172004/my-new-system/issues/157) |
| T154           | [#158](https://github.com/Gyan172004/my-new-system/issues/158) |
| T155           | [#159](https://github.com/Gyan172004/my-new-system/issues/159) |
| T156           | [#160](https://github.com/Gyan172004/my-new-system/issues/160) |
| T157           | [#161](https://github.com/Gyan172004/my-new-system/issues/161) |
| T158           | [#162](https://github.com/Gyan172004/my-new-system/issues/162) |
| T159           | [#163](https://github.com/Gyan172004/my-new-system/issues/163) |
| T160           | [#164](https://github.com/Gyan172004/my-new-system/issues/164) |
| T161           | [#165](https://github.com/Gyan172004/my-new-system/issues/165) |
| T162           | [#166](https://github.com/Gyan172004/my-new-system/issues/166) |
| T163           | [#167](https://github.com/Gyan172004/my-new-system/issues/167) |
| T164           | [#168](https://github.com/Gyan172004/my-new-system/issues/168) |
| T165           | [#169](https://github.com/Gyan172004/my-new-system/issues/169) |
| T166           | [#170](https://github.com/Gyan172004/my-new-system/issues/170) |
| T167           | [#171](https://github.com/Gyan172004/my-new-system/issues/171) |
| T168           | [#172](https://github.com/Gyan172004/my-new-system/issues/172) |
| T169           | [#173](https://github.com/Gyan172004/my-new-system/issues/173) |
| T170           | [#174](https://github.com/Gyan172004/my-new-system/issues/174) |
| T171           | [#175](https://github.com/Gyan172004/my-new-system/issues/175) |
| T172           | [#176](https://github.com/Gyan172004/my-new-system/issues/176) |
| T173           | [#177](https://github.com/Gyan172004/my-new-system/issues/177) |
| T174           | [#178](https://github.com/Gyan172004/my-new-system/issues/178) |
| T175           | [#179](https://github.com/Gyan172004/my-new-system/issues/179) |
| T176           | [#180](https://github.com/Gyan172004/my-new-system/issues/180) |
| T177           | [#181](https://github.com/Gyan172004/my-new-system/issues/181) |
| T178           | [#182](https://github.com/Gyan172004/my-new-system/issues/182) |
| T179           | [#183](https://github.com/Gyan172004/my-new-system/issues/183) |
| T180           | [#184](https://github.com/Gyan172004/my-new-system/issues/184) |
| T181           | [#185](https://github.com/Gyan172004/my-new-system/issues/185) |
| T182           | [#186](https://github.com/Gyan172004/my-new-system/issues/186) |
| T183           | [#187](https://github.com/Gyan172004/my-new-system/issues/187) |
| T184           | [#188](https://github.com/Gyan172004/my-new-system/issues/188) |

### Group 01 — registered validated fake call

T139/T140: the implementation agent observed 37 failing registry assertions
against a compilable neutral skeleton, then 42 passing registry/contract cases.
T141/T142: 25 invocation/fake assertions failed before implementation, then the
complete focused slice passed four files/67 tests. This records supplied agent
RED evidence, not an independently reconstructed chronology.

Root and the dedicated T143 reviewer each independently ran pinned
`APP_ENV=test npm test -- tests/unit/model-gateway tests/contract/model-gateway`:
four files/67 passed. The implementation agent also observed passing typecheck,
lint, owned-file formatting and `npm run verify:architecture` (boundary output
`[]`, 34 architecture tests). The reviewer found no critical, important or minor
issue in this slice; transport/deadlines/usage/runtime remain later groups.

The executor's attempted full `npm test` was interrupted with exit 130 after
existing subprocess/socket/database suites failed or skipped. A minimal Node
loopback listener in that executor independently failed with `EPERM` on `listen`:
it retained the earlier restricted execution context. The failure log is
`/tmp/model-gateway-group01-full-test.log`; no full-suite pass is claimed.
Root's current unrestricted context bound the same loopback listener and reran
configuration CLI/representative architecture cases (six passed, 19 filtered
out) and real HTTP/node-adapter cases (five passed) without source changes.
Final whole-suite acceptance remains group 05; subsequent executors must verify
listener access before real-transport tests.

The reviewed slice is committed with
`<US=US1, ID=T144, K=K-017, GROUP=01> feat(gateway): validate registered fake operations`.

### Group 02 — bounded invocation and usage accounting

The implementation agent observed RED/GREEN for admission/deadline/cost (seven
initial failures), real owned transport (ten initial failures), retry/cleanup
(14 failures against 11 already-passing cases), usage metadata (12 failures) and
logger privacy. Final focused command under the pinned runtime:
`APP_ENV=test npm test -- tests/unit/model-gateway tests/integration/model-gateway/transport.test.ts tests/contract/model-gateway tests/unit/logger.test.ts`
passed 11 files/143 tests; root independently repeated the same passing command.
Typecheck, scoped ESLint, owned Prettier and diff checks also passed.

T153's dedicated reviewer found a late-response body leak. The initial fix and
regression exposed a second microtask handoff window; both arrival-after-abort
and handoff cancellation now dispose owned bodies. The reviewer also reproduced
mutable rate-card accounting: an admitted call could change its estimate/version
when the caller mutated the original object. A private scalar snapshot now pins
reservation, attempt estimates and recorded version without freezing the caller.
Each finding received an observed failing regression before its fix; an
additional setup-listener exception test proved timer cleanup.

Independent re-review reproduced both fixed cases: body cancellation count one;
reservation .004296, estimated cost .0003 and original reviewed-v1 card version.
It ran ten gateway files/141 tests and approved with no remaining findings in
scope. These 141 exclude the additional existing shared logger tests included
in root's 143-test run. Full gateway/provider/runtime acceptance remains later
work, not implied by this slice.

Commit title:
`<US=US2, ID=T154, K=K-017, GROUP=02> feat(gateway): bound invocation and usage accounting`.

### Coverage preparation handoff

Read-only coverage preparation reproduced safe-integer aggregation overflow:
two individually complete attempts could produce null aggregate input/total
counts while the summary still claimed complete. Technical §5 and pseudocode
now clarify aggregate completeness as partial in that case, without inventing
unknown/partial individual attempts. T174's newly exposed behavior tests must
observe this failure before the accounting correction; it is not yet a passed
implementation check. The runtime group will expose an import-safe boundary
scanner to measure touched architecture behavior without excluding subprocess
CLI behavior or relying on inaccurate TSX subprocess coverage remapping.

### Group 03 — provider text adapters

The implementation agent observed shared classifier 51 RED assertions, Groq 47
and OpenAI 59 before their implementations passed. Additional failing regressions
covered prepared request aliasing, incomplete reasoning, malformed machine codes,
Groq error-bearing success envelopes and loss of partial usage on normalization.
Provider factories are exported through public.ts; preparation performs no IO and
returns an unknown input-token bound, preserving production admission rejection.

T161 independent review approved with no unresolved material findings. Root and
reviewer separately ran pinned `APP_ENV=test npm test -- tests/unit/model-gateway tests/contract/model-gateway tests/integration/model-gateway`:
15 files, 317 tests passed. Typecheck and scoped lint/format checks passed.
No real provider calls or credentials were used. Runtime restrictions and live
synthetic evidence remain group 04; aggregate overflow remains T174 above.

Commit title:
`<US=US3, ID=T162, K=K-017, GROUP=03> feat(gateway): isolate provider text adapters`.
