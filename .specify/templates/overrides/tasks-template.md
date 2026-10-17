# Task Breakdown Working Draft: [FEATURE NAME]

> NON-AUTHORITATIVE working artifact. Read root `AGENTS.md` first.
> Canonical feature: `docs/03_features/[FEATURE_SLUG]/`.
> Reconcile accepted execution detail with `specifications/engineering/eng_design.md`.
> `project_management/kanban_board.md` owns project status; its CSV is the export.

**Input**: `.specify/work/[FEATURE_SLUG]/`, reconciled four canonical documents
**Prerequisites**: reviewed specification, plan, checklist, dependencies and test plan
**Reconciliation**: [draft / reconciled, canonical paths and reviewed change references]

## Task Format and Traceability

Use `[ID] [P?] [Story] Description`; include exact code/test paths, requirements,
canonical K- task mapping, dependencies, acceptance evidence and verification
commands. `[P]` means dependency-safe parallel work is possible, not required.
Do not create a separate project tracker or mark Kanban tasks complete here.

## Testable Vertical Slices

Replace this guidance with feature-specific tasks organized by user journey.
For production behavior, each slice includes identifying/writing and observing
the expected failing test, the smallest satisfying implementation, relevant
passing tests, then refactoring. Tests are required where applicable; do not
inherit the core template's optional-test default. Integrate each slice through
the existing architecture instead of completing all layers in isolation.

## Review and Completion Gates

Include relevant integration, contract, end-to-end, security and failure tests;
code review; observed verification results; and `$speckit-converge`. Reconcile
changes with the four documents, canonical contracts and ADRs. Only then update
canonical Kanban status and its CSV when completion criteria actually pass.
Useful memory follows verification and cannot establish completion.
