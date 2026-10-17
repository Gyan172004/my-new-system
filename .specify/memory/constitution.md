<!--
Sync Impact Report: scaffold -> 1.0.0 (initial adoption, 2026-10-17).
Principles: canonical authority; architecture/policy boundaries; contract integrity;
evidence-based engineering; bounded planning and continuity.
Added: Baseline References; Development Workflow; Governance.
Removed: illustrative scaffold placeholders. Unresolved placeholders: none.
No product architecture or scope decisions changed. Remove this scratch report before commit.
-->
# AI DSA Interview Practice Platform Constitution

## Core Principles

### I. Preserve canonical authority

Existing architecture, contracts, feature documents, sequencing and Kanban MUST
remain authoritative as mapped in [AGENTS.md](../../AGENTS.md).
Each feature MUST use the established requirements, technical design, engineering
design and pseudocode documents. Tool output MUST remain disposable working
material until reconciled with them; conflicting accepted specifications MUST
NOT be maintained. This prevents contradictory instructions across sessions.

### II. Respect architecture and policy boundaries

Changes MUST follow the [architecture baseline](../../docs/01_macro_architecture/02_system_hld.md)
and [accepted ADRs](../../docs/01_macro_architecture/05_architecture_decision_records.md).
The backend MUST own session transitions and validate model proposals. Provider
calls MUST use the Model Gateway. Candidate execution MUST remain isolated from
trusted workloads, credentials and hidden expected outputs. Significant changes
MUST be reviewed and recorded in the existing ADR register.

### III. Preserve interface and data integrity

Implementations MUST follow the canonical [API](../../contracts/api/v1_openapi.yaml)
and [event contracts](../../contracts/events/async_schemas.json), existing feature
technical contracts and [domain architecture](../../docs/01_macro_architecture/03_data_and_domain_arch.md).
Interface changes MUST assess affected components and include contract tests.
Concurrency, idempotency, ownership and failure behavior MUST be explicitly
designed and tested where relevant; model output MUST be treated as untrusted.

### IV. Demonstrate correctness with observed evidence

Production behavior MUST follow failing-test, smallest-change, passing-test and
refactor discipline. Failures MUST be investigated at their root cause.
Important changes MUST receive code review. Completion claims MUST cite tests
actually executed with observed results, including relevant integration,
contract, end-to-end, security and failure checks. Unavailable or skipped checks
MUST be reported, not described as passes. Existing production release gates
remain binding; design review is not runtime verification.

### V. Keep planning, status and memory bounded

Spec Kit MUST own feature planning; Superpowers MUST provide engineering
discipline without creating another approved feature plan. Implementation MUST
respect canonical order and dependencies and use small vertical slices for
complex features. Only the Kanban MUST determine project task status, with the
CSV kept aligned. Memory MUST contain useful continuity and links, never secrets,
a second ADR register or a second project-status system.

## Baseline References

System-wide requirements and release scope remain in the
[PRD](../../docs/01_macro_architecture/01_system_master_prd.md), operational rules in
the [infrastructure blueprint](../../docs/01_macro_architecture/04_infra_and_ops_blueprint.md),
and release sequencing in [build sequencing](../../docs/02_build_sequencing/feature_implementation_order.md),
the [dependency graph](../../docs/02_build_sequencing/build_dependency_graph.md) and
[release plan](../../docs/02_build_sequencing/v1_scope_and_release_plan.md).
This constitution summarizes governance; it does not redefine those documents.

## Development Workflow

Read canonical inputs and Kanban first. Use `$speckit-specify`,
`$speckit-clarify`, `$speckit-plan`, `$speckit-checklist`, `$speckit-tasks` and
`$speckit-analyze`, reviewing and reconciling accepted outputs before implementation.
Resolve material product/architecture questions with the user. Apply available
Superpowers testing, debugging, review and verification skills during execution.
Run relevant tests and `$speckit-converge` afterward; reconcile gaps and design
changes before updating canonical task status. Follow [AGENTS.md](../../AGENTS.md)
for artifact mapping and skill installation gates.

## Governance

Every feature review MUST check these principles against canonical documents.
If a tool or this summary conflicts with them, stop the affected work and resolve
the discrepancy using the canonical authority and the user's instructions.
Amendments MUST state the rationale, assess affected contracts/designs, and
receive user review for material product or architecture choices. Record
significant architecture changes in the existing ADR register. Version governance
changes semantically: major for incompatible principles, minor for additions,
patch for clarification. Do not invent a new standard to fill a template.

**Version**: 1.0.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-17
