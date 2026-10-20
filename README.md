# AI DSA Interview Practice Platform — Documentation Baseline

This repository contains the planning/design baseline, canonical contracts and Application Foundation tooling, tested configuration, a custom Next.js server lifecycle, enforced module boundaries, startup/HMR and privacy regression coverage, safe request telemetry, uncached health adapters, a dedicated local PostgreSQL test service, explicit migrations, verified storage isolation/schema readiness, CI/security commands and a tested non-root container. Product features and full release acceptance remain unbuilt. Follow [the local development guide](docs/development.md) and the canonical Kanban for current task status.

## Start here

1. [`docs/01_macro_architecture/01_system_master_prd.md`](docs/01_macro_architecture/01_system_master_prd.md) — product goal, user journey, scope and release gates.
2. [`docs/01_macro_architecture/02_system_hld.md`](docs/01_macro_architecture/02_system_hld.md) — system shape and ownership boundaries.
3. [`docs/01_macro_architecture/03_data_and_domain_arch.md`](docs/01_macro_architecture/03_data_and_domain_arch.md) — domain records and persistence rules.
4. [`docs/01_macro_architecture/04_infra_and_ops_blueprint.md`](docs/01_macro_architecture/04_infra_and_ops_blueprint.md) — deployment, security, observability and recovery.
5. [`docs/01_macro_architecture/05_architecture_decision_records.md`](docs/01_macro_architecture/05_architecture_decision_records.md) — accepted baselines and open decisions.
6. [`docs/02_build_sequencing/feature_implementation_order.md`](docs/02_build_sequencing/feature_implementation_order.md) — canonical feature-level order.
7. [`docs/02_build_sequencing/build_dependency_graph.md`](docs/02_build_sequencing/build_dependency_graph.md) and [`v1_scope_and_release_plan.md`](docs/02_build_sequencing/v1_scope_and_release_plan.md) — dependencies and milestones.
8. [`contracts/api/v1_openapi.yaml`](contracts/api/v1_openapi.yaml) and [`contracts/events/async_schemas.json`](contracts/events/async_schemas.json) — machine-readable contracts.
9. [`project_management/kanban_board.md`](project_management/kanban_board.md) — individual task status; CSV is available for import.
10. [`docs/02_build_sequencing/document_review_and_consistency.md`](docs/02_build_sequencing/document_review_and_consistency.md) — audit findings, fixes, and remaining decisions.

## Feature documentation convention

Every feature under [`docs/03_features/`](docs/03_features/README.md) has these four document locations:

- `requirements/feature_req.md`
- `specifications/technical/tech_design.md`
- `specifications/engineering/eng_design.md`
- `pseudo_code/logic_and_state.md`

Empty directories are intentionally included in the ZIP so the workspace is ready for feature-by-feature design. Existing state-machine, LLM-policy and code-execution files are cross-cutting technical contracts and remain in their technical folders.

## Selected V1 implementation baseline

The owner selected **TypeScript + Next.js** for the application on 2026-10-17.
The trusted backend remains a modular monolith, using Next.js Node.js Route
Handlers for the canonical API; background work and candidate execution retain
their separate boundaries. See ADR-021 and the Application Foundation designs.

Frontend work must follow the owner-selected
[wireframe reference and review status](docs/01_macro_architecture/01_system_master_prd.md#41-required-frontend-wireframe-reference).

Clerk authentication; turn-based voice with visible transcript and speech output; Python/C++/Java; OpenAI via the Model Gateway (`gpt-6.1-sol`, `gpt-6-luna`, conditional `gpt-6-astra`, `gpt-transcribe`, `gpt-4o-mini-tts`); AWS ECS/Fargate + RDS PostgreSQL + SQS Standard; managed E2B sandbox adapter; balanced retention defaults; independent Problem Pack author/reviewer process. See the ADR register for details.

## Current next step

K-001–K-006 foundation acceptance is verified, including hosted CI. K-028/T034 remain deferred to deployment readiness under ADR-022. Feature 2 (Identity and Candidate Access, K-012) has passed development acceptance and all 38 feature tasks are complete. Feature 1 retains 47/48 completed tasks; only external-environment evidence T034 remains open. Follow the canonical feature order and dependency evidence for subsequent work; later session consumers and cloud release gates retain their scope. See the [local/real-service matrix](docs/development.md#local-and-real-service-test-matrix) and the [Kanban](project_management/kanban_board.md); its CSV export remains aligned.
