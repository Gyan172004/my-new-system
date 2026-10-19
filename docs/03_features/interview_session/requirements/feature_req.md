# Interview Session — Identity Prerequisite Slice

**Scope:** Supporting K-010/K-011 storage/ownership slice required by authorized Feature 2; not the full interview product or K-014 APIs.

A verified caller must read/change only their own persisted session. Store a stable owner, immutable problem/pack reference, current stage separate from lifecycle status, version and append-only event history. Every mutation checks the owner and expected version and commits snapshot/event together. Another user's ID and a missing ID both return the same not-found outcome. Invalid/stale/terminal mutations leave both unchanged. No hidden content is stored in the candidate projection.

Acceptance: actual PostgreSQL creates/loads the same snapshot; Alice/Bob reads/writes are isolated; concurrent stale writes cannot overwrite; a failed event insert rolls back snapshot; pinned identity/version is immutable; foreign keys and bounded queries work. State guards cover legal/illegal transitions in the existing state-machine contract. A trusted catalogue resolution will supply a published pin when session creation APIs are implemented; storage tests use explicit fixture references and do not establish catalogue publication. No model, execution, voice, catalogue APIs or complete session journey is added.

K-010/K-011 status remains governed by their full Kanban acceptance. This slice provides actual production persistence evidence; it cannot by itself claim all later interview semantics or K-014/K-016 complete.
