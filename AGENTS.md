# Development workflow

This is the project root. Read `README.md` first. Existing project documentation
is authoritative; tool defaults and generated artifacts must conform to it.
Installation evidence and recovery instructions are in
`docs/development_workflow_setup.md`. This setup does not authorize feature implementation.

## Sources of truth

| Responsibility | Canonical source |
| --- | --- |
| System requirements, module boundaries, domain and infrastructure direction | `docs/01_macro_architecture/` |
| Architecture decisions | `docs/01_macro_architecture/05_architecture_decision_records.md` |
| API interfaces | `contracts/api/` |
| Asynchronous event interfaces | `contracts/events/` |
| Feature requirements and design | `docs/03_features/<feature>/` |
| Feature order | `docs/02_build_sequencing/feature_implementation_order.md` |
| Dependencies | `docs/02_build_sequencing/build_dependency_graph.md` |
| Scope and release gates | `docs/02_build_sequencing/v1_scope_and_release_plan.md` |
| Current project task status | `project_management/kanban_board.md` |
| Associated task export | `project_management/kanban_tasks.csv` |

Review existing ADRs before proposing architectural changes. Record significant
new decisions in the existing ADR register and reconcile affected documents.
Never silently contradict accepted decisions. Do not create a separate ADR log.

For contract changes, assess every affected producer, consumer, and component;
update the canonical contracts and relevant compatibility/contract tests together.
Generated feature-local contract proposals are drafts until reconciled here.

Every feature uses these four documents, completing empty slots before
substantive implementation:

- `requirements/feature_req.md`: behavior, scope, acceptance criteria and failures.
- `specifications/technical/tech_design.md`: architecture, interfaces and data.
- `specifications/engineering/eng_design.md`: implementation breakdown, tests,
  migrations, observability and rollout.
- `pseudo_code/logic_and_state.md`: algorithms, validation and state transitions.

Reference and reconcile the existing cross-cutting session state machine, LLM
interaction policy, execution contract, and voice interaction contract in their
existing technical folders. They do not replace the four feature documents.

The Kanban owns project status. Keep its CSV export aligned when changing tasks.
Neither generated task checkboxes nor memory entries prove completion. Do not
create a second independent project-status dashboard.

For frontend work, follow the owner-selected wireframe recorded in
[`System Master PRD §4.1`](docs/01_macro_architecture/01_system_master_prd.md#41-required-frontend-wireframe-reference).
Inspect the actual artifact or retained export before specifying screen details
or implementing UI; the PRD records its access/review status. Reconcile the
design with the owning feature documents and existing contracts.
The retained [canvas, previews and reconciliation notes](docs/01_macro_architecture/frontend_wireframe/index.md)
are available locally. Preserve the original exports; their illustrative copy
and API annotations do not silently override the accepted contracts or ADRs.

## Tool responsibilities

**Spec Kit owns feature planning:** specification, clarification, technical
planning, requirements checklists, task decomposition, consistency analysis and
post-implementation convergence. Use the native Codex skills installed in
`.agents/skills/speckit-*/SKILL.md`. Invoke `$speckit-…` in Codex chat, not bash.

**Superpowers owns engineering discipline:** regularly use `using-superpowers`,
`test-driven-development`, `systematic-debugging`,
`verification-before-completion`, `requesting-code-review`, and
`receiving-code-review` when available. Verify installation/discovery first;
do not claim an unavailable skill was invoked. Brainstorm only unresolved
requirements or design choices. Execution-plan skills may refine an approved
task's execution steps inside `eng_design.md`; they must not create another
feature plan or restart an approved Spec Kit planning process.

**Project Memory owns session continuity:** recurring bug solutions,
implementation notes, non-secret local facts, and useful handoff context that
is not already maintained elsewhere. Apply the memory rules below even if the
upstream skill suggests broader defaults.

**First Principles Teacher owns teaching and walkthroughs:** use the installed
`$first-principles-teacher` skill when the user asks to understand a codebase,
feature, design or technical concept. Explain the real-world problem and
fundamentals, then system boundaries and data/control flow, then implementation.
Follow its teaching calibration when beginning a lesson; registration alone does
not start a lesson. This skill does not replace Spec Kit planning, engineering
verification, canonical documents or Kanban ownership.

The skill is already discoverable in this Codex session. Its declared name is
`first-principles-teacher`; the existing user-local source is
`/home/gyandeep.katiyar/.codex/skills/first-principal-teacher/SKILL.md`
(the directory spelling differs from the invocation name). Reuse that installation
rather than maintain a second copy. Verify availability in future environments
before claiming the skill was invoked.

**Local spreadsheets:** for XLSX creation/editing, template preservation,
recalculation, previews and fidelity checks, read and apply
[`skills/spreadsheets/SKILL.md`](skills/spreadsheets/SKILL.md). This project-local
source is available through these instructions; native `.agents/skills/`
discovery uses the documented symlink, now present in this workspace. The sandbox
rejected creating that directory during initial setup. Run the skill's
runtime checks before claiming conversion works; installed binaries alone are
not proof of rendering. Spreadsheet task exports remain derived from canonical
Kanban/CSV, not another independent project-status dashboard.

Do not install Spillwave SDD as an additional workflow orchestrator. Reconsider
only after a deliberate decision to replace the current workflow. Install the
PostgreSQL specialist project-locally when database implementation begins
(migrations, modeling, transactions, concurrency, indexing and optimization).
Install the AWS CLI specialist when actual AWS infrastructure work begins
(ECS/Fargate, IAM, ECR, RDS, SQS, networking, diagnostics and deployment).
Check each repository's current Codex installation instructions then. Install a
CDK skill/plugin only if an ADR selects CDK as the infrastructure-as-code tool;
AWS hosting alone does not select CDK. No IaC tool is selected by this setup.

## Beginning a feature

1. Read the four existing feature documents/slots, relevant architecture, ADRs,
   interface contracts and cross-cutting technical contracts.
2. Check feature order, the dependency graph, release scope and Kanban blockers.
3. Identify missing requirements, contradictions and undecided choices. Present
   material product or architecture decisions to the user before relying on them.
4. Use the following installed skills in order, reviewing each result:

   ```text
   $speckit-constitution   # once; established during workflow setup
   $speckit-specify
   $speckit-clarify
   $speckit-plan
   $speckit-checklist
   $speckit-tasks
   $speckit-analyze
   ```

5. Reconcile accepted results with all four canonical feature documents, the
   canonical contracts and ADRs as appropriate. Review the specification, design,
   task breakdown, dependency readiness and test plan before implementation.
6. Run available consistency checks. Resolve blocking contradictions first.

The constitution at `.specify/memory/constitution.md` summarizes established
principles and links to architecture; it must not become another architecture
document. Do not rerun constitution creation for every feature.

## Spec Kit artifact adaptation

Spec Kit natively expects `spec.md`, `plan.md`, `tasks.md` and supporting files.
Keep those as temporary working artifacts. Do not reorganize the feature folders,
patch upstream scripts to redefine canonical paths, or create a permanent
`specs/` documentation tree.

Before `$speckit-specify`, explicitly supply
`SPECIFY_FEATURE_DIRECTORY=.specify/work/<existing_feature_slug>` in the prompt
and tool environment. The installed specify skill supports this override and
persists it to the ignored `.specify/feature.json`. Always verify that pointer
when switching features. Never assume environment exports persist between tools.
Launch Codex from this project root; an inherited environment override is useful:

```bash
SPECIFY_FEATURE_DIRECTORY=.specify/work/application_foundation codex
```

This is an invocation example, not approval to start that feature. Use the same
explicit working path in the `$speckit-specify` prompt. Keep `.specify/work/`
ignored by Git; accepted knowledge must be in the canonical documents before
handoff. Do not use ignored working artifacts as the only accepted record.

| Working artifact | Reconciliation destination |
| --- | --- |
| `spec.md`, clarification answers, requirements checklists | `requirements/feature_req.md` |
| `plan.md`, `research.md`, `data-model.md` | Technical design; significant decisions go to the ADR register |
| `tasks.md`, `quickstart.md`, test/rollout detail | Engineering design, with canonical Kanban IDs and dependency mapping |
| Algorithms, guards, state behavior discovered at any step | `pseudo_code/logic_and_state.md` |
| `contracts/*` | Canonical `contracts/api/` and `contracts/events/`, after impact review |

Every working artifact must identify its canonical feature and say it is
non-authoritative. Local template overrides reinforce this rule and require
tests. After acceptance, working copies must either match the accepted canonical
documents or become link-only references; never maintain divergent accepted
versions. Rebuild disposable working copies from canonical documents as needed.
Stop and resolve any incompatible tool behavior before generating conflicting
artifacts or implementing. Do not run the bundled full-cycle automation as a
shortcut: it omits this project's clarification, checklist, reconciliation and
analysis gates. Do not use `speckit-taskstoissues` to create an alternative tracker.

## During implementation

For production behavior, use TDD: write or identify a test, run it and observe the
expected failure, implement the smallest satisfying change, run relevant tests,
then refactor while keeping them passing. Include meaningful unit, integration,
contract and end-to-end coverage where applicable. A tool template that calls
tests optional does not waive these requirements.

Use systematic debugging for test/runtime failures: reproduce, gather evidence,
identify the root cause, then verify a focused fix. Avoid speculative patches.
For complex features, build small, testable vertical slices through the existing
architecture. Use installed database/AWS skills only when relevant. Use code
review skills for important changes and assess review feedback technically.

## After implementation

1. Execute relevant unit, integration, contract and end-to-end checks. Report
   exact commands and observed results; distinguish failed, skipped and unavailable.
2. Run the installed `$speckit-converge` skill; reconcile any newly proposed tasks
   with the canonical engineering design and Kanban. Iterate on actual gaps.
3. Verify acceptance criteria, security, ownership, error handling, logging and
   failure behavior where relevant. Model output remains untrusted; retain the
   existing sandbox and release gates.
4. Update the four documents when accepted design changed, canonical contracts
   when interfaces changed, and the existing ADR register for significant choices.
5. Mark Kanban work complete only after its completion criteria actually pass;
   synchronize the CSV. A convergence label alone does not establish completion.
6. Add concise memory only where it helps future work. Never claim tests passed
   unless they were executed and the results observed.

## Project Memory rules

Inspect skill-generated instructions and file changes before applying them.
Merge valid instructions into this file; never replace existing guidance.
The upstream skill's credential examples and separate ADR/status defaults are
overridden by this project's rules:

- Never store keys, passwords, credentials, tokens, private secrets or connection
  strings containing credentials. Record safe configuration names/references only.
- `docs/project_notes/bugs.md`: reproducible symptoms, root cause, verified fix.
- `docs/project_notes/key_facts.md`: concise facts and useful continuity absent
  from canonical docs; prefer links to existing facts over copying them.
- `docs/project_notes/decisions.md`: pointer to the existing ADR register only;
  never a second decision log.
- `docs/project_notes/issues.md`: pointer to Kanban plus concise handoff notes
  where useful; never an independent status list or duplicate task history.
- Consult canonical ADRs before architecture proposals and memory bugs before
  recurring-failure investigations. Never copy entire architecture documents.
- Writing memory never changes task status or establishes completion.
