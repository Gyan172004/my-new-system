# Interview Session — Prerequisite Technical Design

Use existing modular monolith/pg/pool/migrations. Owning module: `src/modules/interview/`; public.ts exposes immutable application DTOs and services, never raw repositories. Canonical state-machine and API/event contracts remain controlling.

Proposed tables: interview_sessions UUID PK, owner_id UUID FK users(id), problem_id text, problem_pack_version text, current_stage and status constrained to canonical enums, version nonnegative integer, context JSONB bounded by canonical context shape, created_at/updated_at timestamptz. Index owner_id and deterministic created_at/id sort key. Pack references are opaque immutable values pending the catalogue schema; do not add a fabricated published-pack table. Future catalogue integration must validate/resolve publication before invoking creation.

session_events has UUID event_id, session_id FK, session_version, schema_version=1, canonical event_type, correlation_id, occurred_at and safe payload; unique(session_id,session_version). Parameters are bound SQL. Reads use session_id AND owner_id; mutations retain owner/version predicates and atomically append their event. Never hold a transaction over provider calls. A row/event failure rolls back all effects. No queue/outbox dispatch is added by this slice; later async work must add its transactional outbox.

Creation/replay/idempotency for public API commands remains K-013/K-014. The prerequisite does not expose a browser command that bypasses it. Its internal trusted storage service is consumed only after orchestration policy; transition guards are backend functions, not model/client-provided next-stage setters. See session_state_machine.md and canonical contracts.
