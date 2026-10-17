# Implementation Plan Working Draft: [FEATURE]

> NON-AUTHORITATIVE working artifact. Read root `AGENTS.md` first.
> Canonical feature: `docs/03_features/[FEATURE_SLUG]/`.
> Reconcile technical decisions with `specifications/technical/tech_design.md`,
> execution detail with `specifications/engineering/eng_design.md`, and algorithms
> and state rules with `pseudo_code/logic_and_state.md` before implementation.

**Date**: [DATE]
**Input**: `.specify/work/[FEATURE_SLUG]/spec.md`, reconciled canonical requirements
**Kanban IDs / dependencies**: [existing K- IDs and readiness evidence]
**Reconciliation**: [draft / reconciled, canonical paths and reviewed change references]

## Summary

State the bounded change and reuse of existing module boundaries.

## Technical Context

List actual language/runtime, dependencies, storage, target platform and test
tools; mark unresolved choices explicitly. Reference existing performance,
capacity, privacy and operational constraints. Setup does not select a framework.

## Constitution Check

GATE before research and again after design: verify canonical document authority,
accepted ADRs, backend policy ownership, execution isolation, contract impacts,
dependency readiness, test-first coverage, safe memory and Kanban ownership.
Escalate material choices; do not waive accepted architecture by template default.

## Project Structure

Canonical feature documentation remains:

```text
docs/03_features/[FEATURE_SLUG]/
  requirements/feature_req.md
  specifications/technical/tech_design.md
  specifications/engineering/eng_design.md
  pseudo_code/logic_and_state.md
```

Disposable working files live in `.specify/work/[FEATURE_SLUG]/`: `spec.md`,
`plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `tasks.md`, checklists,
and contract proposals. Supporting files also carry the non-authoritative banner
and canonical destination. Do not create a permanent `specs/` tree.

Describe the real proposed code paths only after reviewing architecture. Never
reorganize documentation or choose a source layout just to match tool examples.

## Interfaces, Data and State

Reference canonical API/events and cross-cutting contracts. Assess all affected
components for interface changes; reconcile proposals with root `contracts/`.
Capture transaction/concurrency rules and pseudocode in their canonical documents.
Significant decisions go to the existing ADR register, not a local research ADR.

## Engineering and Verification Plan

Describe small vertical slices, failing-test targets, relevant unit/integration/
contract/end-to-end checks, migrations and rollback, security, error handling,
logging and operational failure tests. Include acceptance and release gates.

## Complexity Tracking

Explain any necessary added complexity and alternatives considered. Unresolved
architecture conflicts block implementation; this section cannot authorize them.
