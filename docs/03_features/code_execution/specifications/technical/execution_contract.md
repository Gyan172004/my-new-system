# Code Execution Service Contract

**Status:** Initial V1 contract  
**Security classification:** High-risk boundary for untrusted candidate code

## 1. Purpose and trust boundary

The execution service compiles and runs candidate-submitted code in a restricted, ephemeral environment. Candidate code is hostile input. It must never execute in the API process or in a trusted worker with broad application credentials.

The trusted backend owns submission authorization, test-suite selection, hidden expected outputs, final result classification, and session progression. The sandbox receives only source and the per-test input needed for a run. It does not receive expected outputs, database credentials, model keys, or other candidates' data.

## 2. Logical components

1. **Submission module:** validates ownership, language allowlist, source size, and session eligibility; persists the submission.
2. **Execution coordinator:** creates an execution ID, enforces queue/concurrency policy, resolves immutable test-suite version, and dispatches a narrow job.
3. **Sandbox worker:** provisions a restricted environment, compiles/runs source, enforces limits, and returns bounded output/resource metadata.
4. **Trusted evaluator:** compares bounded output with expected output outside the sandbox and classifies the result.
5. **Result persistence/notification:** stores the result and emits `code.execution.completed` after durable commit.
6. **Interview orchestrator:** uses the result to choose the next permitted action.

These are logical boundaries. Deployable topology may vary, but the untrusted execution boundary must remain isolated.

## 3. Request contract

An execution request contains:
- `executionId` (UUID, unique per attempt);
- `submissionId` (UUID);
- `sessionId` (UUID);
- internal user identifier for authorization/audit, not passed to sandbox unless strictly necessary;
- `problemId` and pinned `problemPackVersion`;
- language from a configured allowlist;
- source artifact reference or bounded source payload;
- immutable test-suite version and test-selection policy;
- named resource-limit profile;
- deadline/correlation metadata;
- idempotency key for dispatch.

The public client cannot choose hidden test IDs, expected outputs, resource limits, worker image, environment variables, or arbitrary compiler flags.

## 4. Result contract

A result includes execution/submission/session IDs, outcome enum, safe pass/total counts, bounded/redacted diagnostics, duration and resource usage, infrastructure-failure flag, retryability and safe user-facing message, worker/toolchain version, test-suite version, and result-schema version.

| Outcome | Meaning | Candidate correctness scoring |
|---|---|---|
| `accepted` | All required tests passed | Positive implementation evidence |
| `wrong_answer` | Program ran but output differed | Candidate implementation evidence |
| `compile_error` | Compiler rejected submission | Candidate implementation evidence, subject to toolchain validity |
| `runtime_error` | Program terminated unexpectedly | Candidate implementation evidence |
| `time_limit` | Program exceeded configured runtime | Candidate evidence only if worker/timer health is trustworthy |
| `memory_limit` | Program exceeded configured memory | Candidate evidence only if worker health is trustworthy |
| `output_limit` | Program exceeded output bound | Candidate implementation evidence |
| `infrastructure_error` | Queue, worker, toolchain, evaluator, or platform failed | Neutral; never score as candidate failure |
| `cancelled` | Valid cancellation occurred | Neutral unless a future explicit policy says otherwise |

## 5. Test and expected-output handling

- Test suites are immutable and versioned with the Problem Pack.
- The trusted coordinator/evaluator selects tests; the candidate cannot select hidden cases.
- The sandbox receives only the current test input required for execution.
- Expected output stays outside the sandbox and is compared by a trusted evaluator.
- Never return hidden inputs, expected outputs, or detailed hidden-case identifiers to the client.
- Candidate-facing summaries may include aggregate counts or a safe failure category according to pack disclosure policy.
- Hidden payloads must not appear in ordinary logs, traces, model prompts, or errors.

## 6. Isolation and resource controls

Required baseline controls before enabling real-user execution:
- ephemeral environment per execution or safely isolated execution unit;
- non-root execution where supported;
- read-only base filesystem and bounded writable temporary directory;
- no host filesystem mounts, container runtime socket, or broad device access;
- no network egress by default, including internal metadata endpoints;
- no database credentials, cloud credentials, model keys, or application secrets;
- CPU, wall-clock, memory, process/thread, file-size, output-size, and disk limits;
- kill the entire process tree on timeout/cancellation;
- source/request size limits before scheduling;
- pinned, reviewed toolchain images; no dependency downloads during candidate execution;
- cleanup of environment and temporary artifacts;
- bounded queue and concurrency;
- trusted evaluator isolated from candidate-controlled output.

**V1 selection:** use a managed E2B sandbox behind an internal execution adapter. Candidate code does not execute in the ECS API service or trusted Fargate workers. The adapter must isolate provider-specific request/response details. Before public launch, verify E2B terms/data-processing, region, network isolation, sandbox lifetime/cleanup, quotas, supported runtimes, and failure behavior with a documented threat model.

The exact pinned versions of Python, C++ toolchain, and Java runtime plus numeric CPU/memory/wall-time/process/output limits must be selected and tested before launch. V1 language allowlist: Python, C++, Java.

## 7. Lifecycle and delivery semantics

```text
submission accepted
  -> execution queued
  -> execution started
  -> compile/run
  -> trusted output comparison
  -> result persisted
  -> code.execution.completed emitted
  -> interview orchestrator receives result
```

A submission may have multiple execution attempts; each attempt gets a unique `executionId`.

- Dispatch is idempotent.
- Treat queue delivery as at-least-once and potentially out of order. V1 uses Amazon SQS Standard with a dead-letter queue. Use a stable execution ID, persistent state/idempotency checks, bounded retries, a visibility timeout longer than the worker's expected processing window, alarms, and documented DLQ redrive/review.
- Worker handlers tolerate duplicate delivery.
- Completion persistence and event publication use a transactional outbox or equivalent reliable mechanism.
- A stale result cannot advance a session whose state/version changed incompatibly.
- Cancellation is best-effort; resource enforcement must still terminate overdue processes.

## 8. Failure and backpressure

| Failure | Required behavior |
|---|---|
| Queue full/concurrency cap | Return bounded queued or retryable saturation response; do not accept unlimited work |
| Worker lost before start | Retry safely within bounded budget |
| Worker lost during run | Infrastructure failure unless reliable evidence proves candidate-caused outcome |
| Toolchain unavailable | Infrastructure failure and operational alert |
| Evaluator unavailable | Preserve state and retry comparison without rerunning when safe |
| Output too large | Terminate and return `output_limit` |
| Timeout | Kill process tree; classify as `time_limit` only when timer/worker health is trustworthy |
| Duplicate dispatch/event | Deduplicate by execution ID/idempotency key |
| Candidate cancels | Stop where possible, mark cancelled, clean up |
| Session becomes terminal | Persist result but do not reopen or silently advance session |

## 9. Data and privacy

- Store source only as long as required by the product's retention policy.
- Do not copy source into logs.
- Use opaque internal artifact references, not public URLs.
- Restrict source and diagnostics to the session owner and authorized operational roles.
- V1 retention defaults: source code 90 days; execution output/stdout/stderr 30 days. Transcript/session history is 365 days; audit/security logs are 90 days; raw candidate audio is not durably stored. Implement deletion/expiry jobs and verify backup-expiry behavior.
- Record toolchain and test-suite versions for reproducibility.

## 10. Observability

Measure queue depth/wait time, active sandbox count, compile/run duration, outcomes by category, infrastructure failure rate, timeout/kill effectiveness, resource usage, worker startup failures, evaluator errors, duplicate/retried jobs, and cost per execution.

Use correlation IDs across request, job, worker, result, and session. Never put hidden test values in metric labels.

## 11. Acceptance tests before release

- Network egress and internal metadata access are blocked.
- Sandbox cannot read secrets, database credentials, host files, or another execution's artifacts.
- CPU, memory, wall-clock, process, file, and output limits are enforced.
- Infinite loops and process bombs are terminated.
- Large output and malformed encodings are bounded safely.
- Duplicate dispatch does not create duplicate logical results.
- Hidden expected outputs never enter the sandbox.
- Infrastructure failures are neutral in feedback.
- Queue saturation is bounded and observable.
- Toolchain and test-suite versions are persisted.
- Completed execution cannot mutate an incompatible or terminal session.

## 12. Open decisions

Selected V1 defaults: managed E2B sandbox behind an adapter; Python/C++/Java; Amazon SQS Standard + DLQ; 90-day source retention and 30-day output retention. Before implementation completes, pin toolchain versions/digests and numeric resource profiles, review E2B security/data terms, implement source/output TTL deletion, and test the candidate-facing hidden-test disclosure policy.
