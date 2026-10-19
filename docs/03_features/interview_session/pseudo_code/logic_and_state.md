# Interview Session — Prerequisite Logic

```text
readOwned(caller,id):
  select candidate-safe snapshot where id=id AND owner_id=caller.userId
  if absent: return not_found
  return immutable DTO

commitTransition(caller,id,expectedVersion,trustedDecision):
  begin transaction
  load owned snapshot; if absent rollback and return not_found
  check expected version; if stale rollback and return conflict
  validate backend transition guard against canonical stage/lifecycle rules
  update owned snapshot where id/owner/version still match; increment once
  if no row updated: rollback and return conflict
  append schema-versioned safe event for resulting session version
  commit both together
  on any error: rollback; return safe unavailable failure
```

Public command creation/retry must resolve its owner-scoped idempotency record before inserting and commit command result with snapshot/events. That workflow remains K-013/K-014 and cannot be bypassed by a new endpoint here. Pack pin is immutable; the future catalogue resolver validates publication before creation. No caller/model input can set arbitrary stages. Model/voice/execution work uses the existing cross-cutting contracts and never occurs inside this transaction.
