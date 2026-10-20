# Interview Session — Prerequisite Engineering Slice

**Authorization:** Necessary dependency work under Feature 2's approved execution group 04/T061–T065. Canonical task source remains identity engineering §8 and Kanban K-010/K-011; no second task/status board.

Write real PostgreSQL ownership/atomicity/version tests before the repository and guard code. Add explicit ordered session migration after users; reuse owned test allocations and shared application pool. Test parameterized owner reads/writes, missing/foreign indistinguishability, simultaneous CAS writes, rollback after event failure, pinned fields, enum constraints and disabled identity denial before storage. Unit guard tests cover the canonical edge table, terminal status, start, pause/recovery and repeat/conditional stages without inventing provider behavior.

Query complexity: indexed single snapshot O(log S), O(1) application memory; owner page O(log S+P), O(P) memory with composite keyset index; guarded write/event O(log S+log E) plus bounded lock wait; durable storage O(S+E). Use statement/connect deadlines, release connections on cancellation and do not log payloads. Apply existing migration forward-fix/approved restore policy; no destructive automatic rollback.

Review with installed PostgreSQL/TypeScript/Vitest skills and independent reviewer before group commit. Run focused tests, foundation migration/readiness regressions and full relevant checks. Record real counts and remaining feature gates in identity runbook; only Kanban/CSV may establish card completion. Full problem-publishing/session-API/orchestration acceptance is separate.
