# Foundation operations and verification evidence

## Current operational handoff

Use [the development guide](../development.md#first-clean-local-run) for the exact
current clean install/configure/migrate/build/start/probe/stop sequence and full
verification commands. Dated phase sections below preserve historical evidence;
earlier incomplete-state statements are not current acceptance claims.
Migration operations/recovery and environment/role handoff remain in their
existing sections below. Kanban/CSV own status.

Local implementation through Phase 6 is reviewed in commit `faff2b2`;
its GitHub delivery/hosted CI is pending `workflow` OAuth scope. The owner
confirmed on 2026-10-18 that staging/production resources are not ready.
T034 requires existing environment decisions/resources before read-only evidence
collection. Do not provision AWS resources, fetch secret values or claim K-028
completion from local settings. No cloud profile/region/resource references have
been supplied. Pending evidence is identified under the existing environment
handoff and the K-028 card. Under the later owner-approved ADR-022 amendment,
local T047/T048 may follow T033 without waiting for T034; older phase evidence
below records the previous dependency policy. K-028 and release gates stay open.

## Phase 1 tooling/configuration review — 2026-10-18

Scope: T001–T004, T035/T036; K-001 and the local configuration portion of K-028.
The repository began at `9f18123a0d82a83652c1bc7cf9c1b50c3fe27d8a` with
pre-existing planning/skill-installation edits. The reviewed application increment
excludes those unrelated edits. Kanban remains authoritative; this is evidence.

Skills applied: using-superpowers, test-driven-development, systematic-debugging,
mastering-typescript (strict TypeScript/Zod; project npm/Next choices retained),
vitest, verification-before-completion, requesting-code-review,
receiving-code-review and mastering-git-cli. Installation check:
`python3 skills/scripts/manage_skills.py` passed (50 skills/discovery links).
Git 2.34.1 supports the basic staging/commit operations used here; advanced
features from the Git skill’s recommended newer runtime are not needed.

All npm commands below use Node 24.22.0/npm 11.19.1 by prepending
`/tmp/foundation-node-verified/node-v24.22.0-linux-x64/bin` to PATH. This temporary
runtime was checked against the official SHA-256 manifest. It is not committed.

- Initial `npm run test:unit -- --reporter=dot`: 66 expected failures against
  explicit unimplemented parser/CLI signatures. Configuration validation/defaults
  were absent, not blocked by a missing module. Child CLI capture also encountered
  sandbox EPERM; those two cases are not counted as clean red behavioral evidence.
- Build public-secret regression: `npm run test:unit -- --reporter=dot` with
  child-process capture permitted: 66 passed, one expected assertion failure
  because build config did not reject `NEXT_PUBLIC_DATABASE_URL`. Implemented the
  guard, then reran the complete suite.
- `npm test -- --reporter=dot`: 67/67 passed across two files. This run required
  execution outside the sandbox because Node synchronous subprocess capture
  returns EPERM/empty streams within it. Tests assert the absence of spawn errors;
  the environmental failure cannot silently satisfy a subprocess test.
- `npm run typecheck`: passed. `npm run lint`: passed with zero warnings.
- `npm run format:check`: passed for implemented scope; retained exports and
  canonical historical documentation keep their existing formatting.
- Corrected `npm ci --cache /tmp/foundation-npm-cache`: passed, 154 packages
  installed, audit zero vulnerabilities. npm reports an unapproved optional
  esbuild install script; it is not treated as an acceptance failure or silently
  approved. Platform dependencies allowed tsx/Vitest checks to execute.

Initial dependency resolution found five high findings propagated from unused
`eslint-config-next` through `braces` (no patched braces release). Removed that
unused preset and selected supported ESLint 10.13.0 with compatible
`typescript-eslint` 8.71.2/TypeScript 6.0.3. A stale installed peer tree rejected
an in-place major tool update; resolving the exact manifest in an owned clean
folder and installing its lockfile succeeded without force/legacy peer flags.

Clean-directory verification in an owned temporary copy, using `env -i` with
only the pinned tool PATH and an explicit temporary npm cache:

- `npm ci --offline --no-audit`: passed, 154 packages. The first sandbox attempt
  failed during esbuild's binary validation with `spawnSync EPERM`; the permitted
  rerun passed. Offline installation is recorded separately from the online audit.
- `APP_ENV=development DATABASE_URL=postgresql://localhost/foundation npm run config:check`:
  passed, `configuration_valid`; no database contacted.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: all passed.
- `npm run test:unit -- --reporter=dot`: 67/67 passed in the clean directory.
- Root `npm audit --audit-level=high --cache /tmp/foundation-npm-cache`: passed,
  zero vulnerabilities on the corrected lockfile.

Independent read-only code review (`review_phase1_implementation`) found no
Critical, Important or Minor code findings. Closeout review identified minor
README status drift; the planning-only description and obsolete K-001 next step
were corrected before staging. No unresolved review findings remain. Reviewer independently passed format/lint/type checks
and actual valid/invalid config commands; reproduced the sandbox-only capture
limitation and did not report those two tests as passing. Reviewed exclusions:
Next runtime/health/storage/container/AWS behaviors belong to later tasks; Clerk
is intentionally rejected; known public aliases do not establish arbitrary
secret detection or prove framework build behavior. Those are accepted scope
boundaries, not waived later acceptance criteria.

A bounded post-implementation convergence assessment checked this increment
against T001–T004 and the group protocol: no newly uncovered Phase 1 work. The
remaining foundation runtime/storage/CI/external work is already represented by
T005–T034 and their review/commit pairs; no duplicate tasks were appended and no
whole-feature convergence is claimed. T036 remains dependent on exact staged
scope inspection and the observed commit result. Actual Next build/listeners, storage, integration/contract/process
suites, hosted CI, scanners/container and AWS environment evidence belong to
later tasks. No feature/M0 completion is claimed by this increment.

## Phase 2 lifecycle/liveness verification — 2026-10-18

Scope: T005/T006, review T037 and commit T038; starting commit `38b81df`.
K-002 is In Progress: full module-boundary and production/HMR acceptance is
Phase 3. K-004/K-028 and M0 remain incomplete. Existing planning/skill-installation
changes remain outside the implementation commit.

Skills applied: using-superpowers, test-driven-development, systematic-debugging,
mastering-typescript, vitest, vercel-react-best-practices for server/handler
boundaries, requesting-code-review, receiving-code-review and
verification-before-completion. `next-dev-loop` was inspected but is unavailable:
`agent-browser` is not installed, so its dual-view MCP/browser workflow was not
run. The real HTTP checks below are separate process evidence, not a claim that
this optional skill ran. No dependency/framework upgrade was needed.

TDD observations (all npm commands use the pinned Node/npm PATH from Phase 1):

- `npm run test:unit -- --reporter=dot`: first clean T005 red run had 12 new
  expected lifecycle/liveness failures and 67 existing passes. Initial async
  assertion handling was corrected before accepting that clean red result.
- Manifest/order and stopped-process resurrection tests then failed as expected
  before implementing the manifest builder and terminal state guards.
- Cleanup regression run: three expected failures before the fix (stop after
  failed startup, synchronous adapter-close failure, throwing forced cleanup).
  Cached cleanup, independent closers and exception-safe forced destruction
  fixed those paths without preserving raw dependency errors.
- A real local HTTP adapter test, using only an injected test-owned Next adapter,
  confirms admitted response completion precedes Next closure. No test-only
  route or diagnostic field ships in the application.

Observed build/runtime evidence:

- `env -i PATH=<pinned Node bin>:/usr/bin:/bin NEXT_TELEMETRY_DISABLED=1 npm_config_cache=/tmp/foundation-npm-cache npm run build`:
  passed without APP_ENV, DB or provider credentials; actual dynamic Node route
  `/api/v1/health/live` compiled, ordinary output plus `dist/server.mjs` produced.
- `python3 /tmp/foundation-phase2-smoke.py`: passed for production and development
  custom servers on owned allocated ports: liveness 200/no-store with safe UTC
  JSON, SIGTERM exit 0, listener closed. DB target was unreachable; no connection
  was required. Invalid runtime configuration exited 1 with DATABASE_URL key only,
  no planted value and no listener.
- `npm install --package-lock-only --cache /tmp/foundation-npm-cache`: passed;
  esbuild 0.28.2 promoted from locked transitive to explicit build dependency;
  audit zero findings. The existing npm install-script warning remains reported.

Fresh final verification after the cleanup fixes:

- `npm ci --cache /tmp/foundation-npm-cache`: passed, 154 packages, zero audit findings.
- Empty-environment `npm run build`: passed again; strict TypeScript retained and
  no runtime settings/provider credentials needed.
- `python3 /tmp/foundation-phase2-smoke.py`: production/dev/invalid-config cases
  passed again against the rebuilt entrypoint.
- `npm test -- --reporter=dot`: 88/88 passed across six files.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: all passed.
- `git -c core.whitespace=cr-at-eol diff --check`: passed; existing CSV CRLF
  retained. This is a per-command whitespace option, no Git config mutation.

Independent read-only review (`review_phase2_implementation`) approved T037:
no Critical/Important findings and no unresolved Minor findings. Minor README
status drift was corrected and rechecked. Reviewer independently passed an
empty-environment offline locked install, 88/88 unit tests, lint and typecheck in
an owned disposable copy. No repository/index/HEAD mutation by the reviewer.

Bounded convergence for this increment checked the implemented T005/T006 paths,
configuration-before-listen, lifecycle/failure ownership, uncached canonical
liveness and secret-free build against the four canonical documents and ADR-021.
No newly uncovered Phase 2 work was found. Full feature convergence is still
pending: the remaining 38 tasks are already represented in later phases, so no
duplicate convergence tasks were appended. Task markers record evidence only;
K-002 remains In Progress in both Kanban and CSV. T038 requires final exact staged
scope inspection and the observed commit result. Full HMR mutation/registry acquisition and canary process
regressions remain T009/T010/T017; the development smoke above does not replace
them. No readiness handler, storage connection/migration, provider, candidate UI,
container, hosted CI or cloud mutation is delivered in this group.

## Environment isolation and secret injection handoff

This is the local baseline and deployment-owner handoff required by T011. Actual
AWS targets, credentials, roles, injection and rotation evidence remain T034 /
K-028. No account, region, networking or IaC tool is selected here.

| Environment | Required separation                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| development | Dedicated local PostgreSQL target and separate dedicated test storage; ignored local runtime values                  |
| staging     | Separate database, runtime/migration roles, secret references and eventual provider/sandbox projects from production |
| production  | Production-only resources and least-privilege identity; no test identity adapter or staging/development credentials  |

Tracked JSON examples contain logical reference names such as
`staging/foundation/database-url`; they are not resolved secret values. The
application parser consumes runtime environment variables, not those JSON files
or an unresolved reference. Resolve values only inside the authorized workload.
Never request secret plaintext through an agent, put it in command arguments,
copy it to this document, or fetch it into diagnostic output. The installed
aws-secrets-manager guidance is used for reference safety; its optional asm-exec
integration is not configured or required by this application.

For the selected ECS/Fargate baseline, use deployment-owned Secrets Manager
references in the task definition's `secrets`/`valueFrom` mapping, so injection
occurs before the process starts. Keep application images, build arguments and
NEXT_PUBLIC variables free of credentials. The ECS **execution role** owns the
permissions needed by ECS to pull the image, initialize configured logging and
resolve only the referenced injected secrets (plus narrowly scoped KMS decrypt
when applicable). The application **task role** owns only its actual AWS API
operations; foundation performs no AWS API call and does not need a blanket
Secrets Manager reader. Candidate execution receives neither role nor secrets.
This distinction is a handoff convention, not an IAM policy or deployed role.

Use verified TLS outside local/test. `DATABASE_URL` requires
`sslmode=verify-full`; conflicting SSL URL flags and an explicit global
`NODE_TLS_REJECT_UNAUTHORIZED=0` are rejected in staging/production. The implemented database adapter preserves certificate verification; deployment
still must supply/verify its approved trust material against the actual target. An approved CA trust bundle may be required by the
selected deployment; do not fix trust errors by disabling verification.
Configuration checks alone do not prove a successful verified database connection.

Configuration is immutable per process. Environment-injected secrets are not
refreshed by mutating a running process: rotate through the authorized
secret-owner procedure, validate the new version using a replacement task,
roll tasks with readiness/drain gates, verify old tasks are stopped, then retire
the old credential after its rollback window. Changing a Secrets Manager value
alone does not refresh existing tasks. No rotation/deployment is performed here.
See [ECS secret injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html).

T034 evidence must identify safe environment/resource/secret-version references,
execution-role versus task-role permission scope, redacted task-definition mapping,
verified TLS outcome, authorized replacement/rotation outcome and rollback owner.
Do not include values, full connection strings, token dumps or raw error payloads.
Record failed/unavailable checks honestly; keep K-028 incomplete without actual
staging/production evidence. Region/VPC/sizing/provider/deployment decisions stay
with their existing release gates. A local config test cannot establish them.

## Phase 3 boundaries and process review — 2026-10-18

Scope: T007–T011, T039/T040; K-002 acceptance and local K-028 guards.
Applied using-superpowers, test-driven-development, systematic-debugging,
mastering-typescript, vercel-react-best-practices (server/client boundaries),
vitest, requesting-code-review, receiving-code-review,
verification-before-completion, mastering-git-cli and mastering-github-cli.
The secret-reference handoff above uses aws-secrets-manager guidance without
fetching values or configuring its optional integration.

Architecture TDD evidence (`npm test -- tests/architecture --reporter=dot`):

- Explicit checker stub: 14 forbidden fixtures failed their assertions while
  five allowed cases passed. The implementation then rejected those violations.
- Wrong provider owner, public secret alias and computed environment read:
  three new assertion failures with 19 passes, then 22/22 green.
- Route-to-private-repository and opaque client dynamic import: two new
  assertion failures with 22 passes, then included in the 121/121 combined run.
- Independent review found three Important gaps (shared provider helper,
  unlisted source-directory private import, bare Node builtin) and one Minor
  false positive (client NODE_ENV). Four new fixtures failed with 24 passes
  before fixes; the final architecture suite has 28 passing cases.

Rules now cover every source folder, retain owning-adapter/public-interface
exceptions and recognize bare/prefixed Node builtins. Client reachability follows
aliases and re-exports. This static guard does not establish semantic DTO safety
or replace future per-feature code review and the separate execution sandbox.

Process evidence (`npm test -- tests/process --reporter=dot`): six tests passed,
including a secret-free production build, actual liveness/registry access,
four pre-listen invalid-setting cases and two actual development HMR mutations.
Instrumentation exists only in owned copies; it acquires a fake resource through
the actual registry before the baseline and observes one acquisition, identical
handle, stable PID and one listener after each reload. Port release is checked.
Existing Phase 2 bootstrap/runtime behavior satisfied these regressions: no
production runtime change or fabricated red result was needed for T010.

One initial process run failed during fixture prerendering because fs.cp rewrote
Next's .bin symlink to the original checkout, loading two React instances.
Preserving verbatim dependency symlinks and asserting the copied Next executable
resolves inside its owned root fixed the test harness. This was not a production
runtime failure. Disposers stop only owned process groups and remove owned copies.

TLS TDD: two new staging/production tests failed with 66 existing config tests
passing before rejecting global verification disablement. The explicit verified
case passed. After the guard, unit tests passed 91/91. Neither this guard nor the
unreachable test URL proves a real database TLS connection.

Fresh final verification, Node 24.22.0/npm 11.19.1:

- `npm ci --cache /tmp/foundation-npm-cache`: passed, 193 packages added,
  194 audited, zero vulnerabilities. Existing esbuild 0.28.2 install-script
  warning remains; no blanket script approval or tool upgrade performed.
- `env -i PATH=/tmp/foundation-node-verified/node-v24.22.0-linux-x64/bin:/usr/bin:/bin HOME=/tmp/foundation-build-home NEXT_TELEMETRY_DISABLED=1 npm run build`:
  passed without runtime/DB/provider values; canonical liveness is dynamic.
- `npm test -- --reporter=dot`: 125/125 passed across ten files in 84.23 s:
  91 unit, 28 architecture and six process tests.
- `npm run lint`, `npm run typecheck`, `npm run check:architecture`: passed;
  actual-source architecture output `[]`.
- `npm audit --audit-level=high`: passed, zero vulnerabilities.

Independent reviewer `review_phase3_implementation` reproduced all four findings,
then re-reviewed the fixes and development/TLS documentation. Fresh focused
checks rejected the shared provider helper, src/lib private import and bare fs /
fs/promises client imports; accepted NODE_ENV; actual-source checker passed.
All findings resolved, no new blockers. No checkout mutation by the reviewer.

Bounded `$speckit-converge` assessment used the explicit application_foundation
pointer and prerequisite check, the 15 functional requirements, seven success
criteria, architecture/lifecycle/import decisions and five constitutional
principles. Phase 3 has no additional uncovered work. Full feature is incomplete:

| Remaining gap                                                       | Severity | Existing coverage    |
| ------------------------------------------------------------------- | -------- | -------------------- |
| Request correlation and privacy telemetry (FR-005/006, SC-004)      | High     | T012–T013, T017–T018 |
| Readiness and real-storage/schema health (FR-007/008, SC-003)       | High     | T014–T018, T024      |
| Explicit migrations and isolated test storage (FR-009/010, SC-005)  | High     | T019–T024            |
| CI/container/scanners and failure controls (FR-011, SC-006)         | High     | T025–T030            |
| Actual environment/secret-role evidence (FR-004/015, SC-007)        | High     | T034                 |
| Final full journey, review and handoff (FR-001/012/015, SC-001/007) | Medium   | T031–T033, T047–T048 |

These gaps already have dependency-ordered tasks; no duplicate convergence tasks
were appended. No new contradictory/unrequested implementation was found.
No extension hook file is installed. K-002's own local acceptance passes and its
Kanban/CSV status is Done; K-003–K-006 and K-028 retain their existing incomplete
statuses. T040 still requires exact staged-scope inspection and the observed
commit. Later work extends the same draft feature PR #49; no merge is claimed.
Pre-existing planning and skill-installation edits remain outside this increment.

Final evidence/status cross-check by the same independent reviewer found no
blockers. `npm run format:check` passed. The final whitespace check
`git -c core.whitespace=cr-at-eol diff --check` passed after removing new trailing
spaces from local canonical status annotations; existing CSV CRLF was retained.

## Local PostgreSQL services and test targets

Phase 4 adds the approved early local services for real driver/deadline tests.
The application image/Dockerfile was added in Phase 6; these DB-service commands
remain separate from app startup and do not provision AWS. Docker Engine 29.3.0 and Compose 5.1.0 were
available. PostgreSQL 17.11-bookworm is pinned to the official multi-platform
manifest digest in compose.yaml, checked with `docker buildx imagetools inspect
postgres:17.11-bookworm`; pinning is not a vulnerability-scan claim.

From the root, using the pinned Node toolchain, prepare ignored local secret
files without printing their values. Existing files are preserved:

```bash
node --input-type=module <<'NODE'
import {mkdir,writeFile,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const root='.local/foundation';
await mkdir(root,{recursive:true,mode:0o700});
await chmod(root,0o700);
for(const file of ['db-password','test-db-password']) {
  try {
    await writeFile(`${root}/${file}`,randomBytes(32).toString('hex'),
      {flag:'wx',mode:0o600});
  } catch(error) {
    if(error.code!=='EEXIST') throw error;
  }
}
console.log('Local service secret files ready; values were not printed.');
NODE
docker compose config --quiet
docker compose up -d db test-db
docker compose up -d --wait --wait-timeout 30 db test-db
docker compose ps --format '{{.Service}} {{.State}} {{.Health}}'
APP_ENV=test npm run test:integration
# Required before the full suite, which now includes image/layer/bridge tests:
npm run container:build
APP_ENV=test npm test
```

The second up command verifies service health within 30 seconds after image
availability; image download time is separate. Keep generated secret files out of
Git, images, logs and agent output. Use `FOUNDATION_LOCAL_SECRETS_DIR` only to
point Compose at an authorized alternate local directory, and
`FOUNDATION_TEST_PASSWORD_FILE` to supply the corresponding test-only password
file to the fixture. Never use production secret references or credentials here.
Do not change an existing password file in place without a deliberate local
credential rotation; PostgreSQL initialization does not reapply it to old data.

| Purpose               | Host/port       | Role/database                                 | Storage/network                |
| --------------------- | --------------- | --------------------------------------------- | ------------------------------ |
| Local development     | 127.0.0.1:45432 | foundation_dev_owner / foundation_development | development_data / development |
| Integration allocator | 127.0.0.1:45433 | foundation_test_admin / foundation_test_admin | test_data / test               |

These bootstrap roles own their separate local services; they are not production
runtime-role examples. Host ports, networks, volumes and password files are
separate. Production runtime/migration least-privilege evidence remains T034.
The fixture's exact approved test target is the second row. Its optional
`TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_ADMIN_USER`, `TEST_DB_ADMIN_DATABASE`
settings must equal that allowlist. `APP_ENV=test` must be supplied explicitly;
missing or non-test values are rejected before reading credentials.
An application DATABASE_URL is never used as the allocator target.

Each run/worker allocates its own lowercase `foundation_test_` database, at most
63 bytes. Identifiers pass guards and are quoted; cleanup uses only the recorded
allocation. The shared helper owns 30-second allocation/cleanup deadlines and
closes its clients. Pool/deadline, isolation, migration-under-test and no-ledger purposes allocate
empty test databases; only prepared-schema readiness invokes its explicitly
injected actual migration initializer. No ledger is hand-created or repaired.
Pool tests exercise actual deadlines/cancellation and connection cleanup; Phase 5
added real migrated-readiness cases through this same shared helper.

`npm run test:unit` and `npm run test:contract` need no live storage. The full
suite requires test-db and its ignored local password file; an unavailable service
fails integration tests rather than being silently skipped. Process tests build
and mutate owned copies, including synthetic faults; none introduce production
test endpoints/flags or require paid-provider credentials. The foundation process
journey requires the dedicated test service and migrates only its owned database. Keep the services for
further local work; `docker compose stop db test-db` pauses them without deleting
volumes. Never remove volumes as a side effect of verification.

Primary implementation references: [pg Pool](https://node-postgres.com/apis/pool),
[pg Client](https://node-postgres.com/apis/client),
[Pino API](https://github.com/pinojs/pino/blob/main/docs/api.md) and
[official PostgreSQL image versions](https://github.com/docker-library/postgres/blob/master/versions.json).

## Phase 4 telemetry, health and early storage review — 2026-10-18

Scope: T012–T018 and T041/T042; K-003, partial K-004/K-005. Applied
using-superpowers, test-driven-development, systematic-debugging,
mastering-typescript, vercel-react-best-practices, vitest,
docker-compose-patterns, supabase-postgres-best-practices,
requesting-code-review, receiving-code-review, verification-before-completion,
mastering-git-cli and mastering-github-cli. First-time Docker guidance was checked
for local dependency setup; the approved task order keeps the application
Dockerfile in T027. No framework/provider/deployment choice changed.

Test-first evidence:

- `npm test -- tests/unit/request-context.test.ts tests/unit/logger.test.ts tests/unit/http.test.ts --reporter=dot`:
  eight assertion failures and one already-passing silent-log case against explicit
  missing-behavior signatures; then 9/9 passed. Initial test harness assertions
  were tightened before that red run so missing output/context produced assertions,
  not JSON parsing/property-access errors.
- `npm test -- tests/unit/health.test.ts tests/contract/health.test.ts --reporter=dot`:
  11 newly missing readiness/contract cases failed with one schema-negative case
  passing; after implementation, those cases plus existing live coverage passed
  13/13. Tests load the canonical OpenAPI HealthStatus schema with Ajv 2020-12 and
  date-time formats. Pure cases include full ordered-history mismatch, mandatory
  failures, deadline abort and drain; optional providers are not called.
- `npm test -- tests/unit/test-services.test.ts --reporter=dot`: missing local
  service configuration failed before compose.yaml; then passed. Quiet Compose
  validation and both actual service health checks passed. No volumes removed.
- `npm test -- tests/unit/test-database-guards.test.ts --reporter=dot`:
  17 unsafe-target/name/ownership/deadline assertion failures with one approved
  target passing; after guards, 18/18 passed.
- `npm test -- tests/integration/database.test.ts --reporter=dot`: five real-driver
  cases failed against the explicit missing adapter, then passed against the
  dedicated test-db. Initial asynchronous stub cases were corrected to assert
  missing work directly rather than leave unhandled rejections/timeouts.
  Additional real idle-backend termination and cancelled-queue recovery cases
  verify the implemented safety behavior; no artificial production regression
  was introduced for those already implemented cases.
- `npm test -- tests/process/privacy.test.ts --reporter=dot`: normal privacy and
  cancellation passed; the raw dependency fault returned framework 500 instead
  of canonical health 503. Catching the error inside the live adapter before Next
  diagnostic serialization fixed that control failure. Rerun: 3/3 passed in
  42.82 s, with no planted canary in combined stdout/stderr.

Request scope is a process-registry-owned AsyncLocalStorage resource. IDs are
fresh server UUIDs, incoming IDs are ignored and detached contexts become inactive
on completion/error/cancellation. Completion logs capture their own immutable
context; finish/close is deduplicated. Logged 499 denotes a cancelled response,
not a new public HTTP error contract. Pino receives only allowlisted bounded
metadata and fixed codes, with redaction as defense in depth. Production fixtures
exercise parallel query/header/body canaries, unknown routes, raw errors and
cancelled requests; synthetic flags/fault code exist only in owned copies.

Readiness is uncached, uses current serving state, reads the build's expected
manifest and observes real storage without migration/repair. No ledger means
503/schema unavailable. Query/server timeouts and client destruction stop owned
active SQL; the enclosing readiness deadline is finite. A cancelled queued pg
acquisition can remain until the native connect timeout (default 500 ms), or
receive a late client that is destroyed before its callback executes. This is
bounded native cleanup, not immediate queue cancellation. A real regression
verifies no aborted callback runs and later work recovers.

Independent reviewer `review_phase4_implementation` found one Important guard
issue: the allocator defaulted missing APP_ENV to test. An actual-allocator
regression with a nonexistent secret-file reference failed (one failed,
18 passed): it reached credential access instead of rejecting unsafe context.
Removing that default makes explicit APP_ENV=test mandatory before file/DB access.
Focused rerun with `APP_ENV=test`: 26/26 passed (19 guard, seven real-driver).
The reviewer approved the correction and documentation on re-review; no remaining
blocking findings. Their earlier independent core run passed 137/137. A subsequent
reviewer rerun overlapped npm ci, was stopped with exit 130 and is explicitly not
counted as passing. No reviewer checkout mutation occurred.

Locked dependency verification: `npm ci --cache /tmp/foundation-npm-cache` passed,
226 packages added, 227 audited, zero vulnerabilities. Pino 10.4.0 and pg 8.23.1
are runtime dependencies; YAML 2.9.1, Ajv 8.20.0, ajv-formats 3.0.1 and pg types
are exact test/build pins. The existing esbuild install-script warning remains;
no blanket approval or runtime/framework upgrade was performed. Local secret
files were checked ignored with mode 600 under a mode-700 directory; values
were never printed. Native services remain available for the next phase.

Fresh final Phase 4 validation, pinned Node 24.22.0/npm 11.19.1:

- `APP_ENV=test npm test -- --reporter=dot`: **176/176 passed across 19 files**
  in 101.15 s: 130 unit, two contract, seven real PostgreSQL integration,
  28 architecture and nine production/development process tests.
- Empty-environment build with only PATH/HOME/telemetry opt-out supplied:
  `env -i PATH=/tmp/foundation-node-verified/node-v24.22.0-linux-x64/bin:/usr/bin:/bin HOME=/tmp/foundation-build-home NEXT_TELEMETRY_DISABLED=1 npm run build`
  passed; both canonical health paths are dynamic and no DB/provider/runtime
  values were needed.
- `npm run lint`, `npm run typecheck`, `npm run check:architecture`: passed;
  actual-source boundary result `[]`.
- `npm audit --audit-level=high`: passed, zero vulnerabilities.
- `docker compose config --quiet` and
  `docker compose up -d --wait --wait-timeout 30 db test-db`: passed;
  both named services healthy, volumes preserved.

Bounded `$speckit-converge` assessment used the explicit feature pointer,
prerequisite check and reconciled working mirrors. It assessed all 15 functional
requirements/seven success criteria, the selected lifecycle/health/privacy/storage
boundaries and five constitution principles against current code. No additional
Phase 4 work was uncovered. Full feature remains incomplete:

| Remaining requirement gap                                                                                   | Severity | Existing canonical tasks |
| ----------------------------------------------------------------------------------------------------------- | -------- | ------------------------ |
| Explicit migrations and expanded concurrent test isolation, including failure/recovery (FR-009/010; SC-005) | High     | T019–T022, T043/T044     |
| Migrated-schema readiness integration and exact real-history failure cases (FR-007/008; SC-003)             | High     | T023/T024                |
| CI/container/security stages and deliberate workflow failures (FR-011; SC-006)                              | High     | T025–T030, T045/T046     |
| Full final journey, review and handoff (FR-001/012/015; SC-001/007)                                         | Medium   | T031–T033, T047/T048     |
| Actual staging/production isolation, roles, injection and rotation evidence (FR-004/015; SC-007)            | High     | T034                     |

These gaps already have dependency-ordered tasks; no duplicates or empty
convergence section were appended. No contradictory/unrequested implementation
or new architecture exception was found. Canonical API/event/session/LLM/execution/
voice interfaces remain unchanged. No extension hook file is present for
implementation or convergence.

K-003's own telemetry acceptance passes; Kanban and CSV now record Done. K-004
and K-005 record In Progress because migrated storage acceptance is pending;
K-006/K-028 remain incomplete. T042 awaits exact staged-scope inspection and its
observed commit. Only reviewed Phase 4 files belong in this increment; pre-existing
planning and skill-installation changes remain local. Continue the same draft
feature PR #49; no merge, cloud readiness, migration success or full foundation
completion is claimed.

Final reviewer evidence/status cross-check passed. After installation finished,
the reviewer independently reran the focused guards/real-driver suites with the
explicit test environment: 26/26 passed, exit 0, 3.15 s. No blockers remained.
`npm run format:check` and
`git -c core.whitespace=cr-at-eol diff --check` passed. A final read-only query of
the dedicated allocator service found zero allocated test databases remaining;
no foreign database or persistent service volume was removed.

## Explicit migrations and recovery

Phase 5 adds `npm run db:migrate` and `APP_ENV=test npm run db:test` while retaining
Phase 4's services and shared fixture. Both commands execute from the repository
root with pinned Node/npm. Migration reads explicit APP_ENV and the dedicated
MIGRATION_DATABASE_URL via exported values or ignored `.env.local`; it does not
fall back to DATABASE_URL or infer the target from JSON examples. Never put a
credential-bearing URL in shell arguments, tracked examples or evidence. Resolve
it only through the authorized environment/secret mechanism.

Use the separate approved migration role for the intended database outside the
local bootstrap setup. Runtime roles should only read migration history, never
perform migration DDL. Keep staging/production target, TLS, credential and role
verification under T034. No staging/production migration was executed here.
The CLI supports forward/up only, and rejects extra arguments. It applies all
pending SQL files; successful repetition reports zero applied changes.

```bash
# Resolve APP_ENV and MIGRATION_DATABASE_URL safely first.
npm run db:migrate
APP_ENV=test npm run db:test
APP_ENV=test npm run test:integration
```

The pinned stable node-pg-migrate 9.0.0 package was inspected directly before
selection; the live documentation site currently describes an alpha 10 line.
Published 9 supports the legacy `-- Up Migration` / `-- Down Migration` markers,
`singleTransaction: true`, `checkOrder: true`, locking enabled and fail-fast
advisory-lock mode. The wrapper retains the library's lock; it adds no independent
lock. A public legacy-SQL loader checks the complete applied history is a prefix
of the packaged chain while that library lock is held, rejecting an unknown or
newer suffix before applying anything. A final exact check runs after library
unlock. If a newer artifact advances history immediately after unlock, this
check can fail after this runner's batch committed: inspect the ledger and
artifact versions, then follow the forward-fix procedure; do not blindly retry.
It supplies a connected dedicated client and closes it on all outcomes.
Raw library SQL/error logs are replaced with a silent adapter, with only safe
wrapper result/error codes emitted. Output contains an event and applied count;
connection strings, SQL and raw exception details are excluded.

The no-domain `1781654400000_foundation.sql` baseline executes SELECT 1. The
library creates `public.pgmigrations`; foundation does not create users, sessions,
Problem Packs or other domain tables. The packaged expected manifest derives
from SQL filenames; real readiness compares the complete ordered ledger with it.
No startup, probe, default empty fixture or build runs migrations implicitly.

Limits are 2 seconds to connect, 30 seconds per SQL statement and 60 seconds for
the migration command. Internal tests may use smaller positive limits, never
larger ones. Connection options are parsed once before owned limits are applied;
URL timeout fields and raw startup options cannot override those limits.
Connection-option parsing errors produce only a safe configuration code.
Command timeout or cancellation ends the actual dedicated client;
PostgreSQL session locks are released by disconnect, rather than left behind by a
bare Promise.race. A competing runner fails immediately with `migration_busy`
and does not release the first session's lock. There is no automatic retry.

On failure, leave replicas blocked by incompatible readiness and record only the
safe code, target/environment reference, approved artifact revision and recovery
owner. The tested baseline and ordinary SQL use one transaction for the attempted
batch: a failed revision is rolled back and never stamped as applied. The library
can create its empty metadata ledger before the attempted batch; an empty ledger
is not a successfully applied revision. Preserve applied filenames/order; never
edit/delete already-applied revisions or manually stamp ledger rows to get green
readiness. Correct a failed, never-applied artifact through review, then rerun;
repair an already-applied defect with a new reviewed forward migration.

Do not automatically run Down, drop schemas, or restore a different environment.
If future nontransactional DDL is approved, document its recovery/compatibility
plan first. An approved restore requires the designated operator to verify backup,
target, role, version and rollback window, restore using that procedure, then
rerun read-only compatibility/readiness checks. Production backup/restore and
RPO/RTO evidence remain K-026; test-owned database recreation is not that evidence.
Unexpected or failed cleanup is a failure to report, never a reason for broad
volume/database deletion.

The shared allocator supports pool-deadline, isolation, migration-under-test,
no-ledger-readiness and prepared-schema-readiness purposes. Empty purposes never
invoke the initializer. Prepared purpose requires an explicit actual migration
initializer and receives an AbortSignal. Allocation identity is issued/recorded
by one run/worker owner; a prefix alone cannot authorize cleanup. Failed creation
must preserve a colliding pre-existing allocation. Initializer failure cleans the
owned database; concurrent disposal shares one cleanup operation. Setup and
teardown are bounded by the existing 30-second budgets, with initializer time
reserved for cleanup. `db:test` outputs only a safe allocation name/status and
checks connection cleanup; generated credentials stay in the ignored local files.

Primary references: [published package source](https://github.com/salsita/node-pg-migrate/tree/v9.0.0),
[pg client lifecycle](https://node-postgres.com/apis/client),
[PostgreSQL advisory locks](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

## Phase 5 migration, isolation and schema-readiness review — 2026-10-18

Scope: T019–T024 and review T043/commit T044, following `f1b7f52`.
Applied using-superpowers, test-driven-development, systematic-debugging,
supabase-postgres-best-practices, mastering-typescript, vitest,
requesting-code-review, receiving-code-review, verification-before-completion,
mastering-git-cli and mastering-github-cli. Retained pg, explicit SQL, existing
health contracts, one shared allocator and the library-owned migration lock.
No domain table or contract/ADR change was required.

Observed test-first and debugging evidence:

- `APP_ENV=test npm test -- tests/unit/test-database-guards.test.ts tests/integration/test-isolation.test.ts --reporter=dot`:
  four newly unsupported ownership/purpose/isolation cases failed with 21 passing
  regressions; after fixture changes, 25/25 passed. The explicit CLI then failed
  its real invocation assertion before implementation; combined fixture/CLI
  checks passed 26/26 after implementation.
- `APP_ENV=test npm test -- tests/integration/migrations.test.ts --reporter=dot`:
  seven behavior assertions failed against the explicit runner stub before the
  baseline/runner implementation; the same seven then passed. A test parser
  typo was corrected before accepting this clean red result.
- `APP_ENV=test npm test -- tests/unit/health.test.ts tests/integration/readiness.test.ts --reporter=dot`:
  16/16 passed, including actual no-ledger/migrated/unknown-history, exhaustion,
  cancellation and test-owned database recreation/recovery. Existing driver
  behavior already satisfied these scenarios; no speculative probe change.
- Independent review found two important gaps: stable9 order checking accepted an
  extra applied suffix, and pg reparsed raw connection options over wrapper
  timeouts. Two new migration assertions failed before corrections. A runtime
  URL-override regression also failed independently. Prefix validation now runs
  through the public SQL loader under the library lock; runtime and migration
  connection parsing enforce their owned limits. A further parser-error
  sanitization assertion failed before mapping it to a safe configuration code.
  The resulting migration/runtime focused command passed 19/19.
- Production-copy build first exposed missing copied test-helper assets after the
  new CLI import; the fixture now copies the shared helper and SQL baseline.
  This harness failure is not claimed as production behavior red evidence.
  The focused startup suite subsequently passed 5/5 and checks the literal
  nonempty packaged migration manifest.
- Final post-install typecheck/build exposed dedicated Client versus PoolClient
  typing and a nominal mismatch between the library's root bundle and public
  legacy subpath declarations. The schema reader now accepts only the required
  query interface; runner and SQL loader use matching public subpaths. Re-review
  approved these focused fixes. The earlier full run reported 193 passing/eight
  skipped because two production-build hooks failed; it is not a passing suite.

Independent reviewer inspected all Phase 5 code and regressions, reproduced the
history/option issues, then approved both their fixes and the subsequent typing
fixes with no remaining blockers. Final validation and bounded convergence are
recorded below. Production backup/restore and hosted/container verification
remain later work; local recreation is not an approved production restore test.

Observed final validation (Node 24.22.0 / npm 11.19.1):

- `npm ci`: 245 packages added, 246 audited; zero vulnerabilities. Existing
  esbuild install-script warning retained; no permission/dependency-policy change.
- `npm audit --audit-level=low`: zero vulnerabilities.
- `APP_ENV=test npm test -- --reporter=dot`: 201/201 passed across 22 files,
  96.20 s; 132 unit, 2 contract, 30 real PostgreSQL integration, 28 architecture
  and 9 process tests. No skipped tests in this final run.
- `npm run lint`, `npm run typecheck`, `npm run check:architecture`: passed;
  boundary output `[]`. `npm run format:check` passed after final evidence
  documentation formatting.
- `env -i PATH=<pinned Node bin>:/usr/bin:/bin HOME=/tmp/foundation-build-home NEXT_TELEMETRY_DISABLED=1 npm run build`:
  passed without runtime/DB/provider values; both health routes remain dynamic.
- Read-only dedicated test-admin inspection after the final suite: zero allocated
  test databases and zero runtime/migration/allocator sessions remain. No
  development, staging or production target was migrated or removed.

Bounded `$speckit-converge` assessment checked 15 functional requirements,
7 success criteria, 16 story acceptance scenarios, 5 named plan decisions,
5 constitution principles and all 48 task descriptions against scoped sources
and observed tests. No additional Phase 5 action remains. Whole-feature gaps:
missing CI/container/scanner automation (High; T025–T027/T030), partial integrated
smoke/shutdown journey (High; T028/T029), missing external environment evidence
(High; T034), partial final review/handoff (Medium; T031–T033/T047/T048).
Totals: two missing, two partial, zero contradicting/unrequested; three High,
one Medium. Existing canonical tasks already cover each gap; under project
adaptation no duplicate convergence task or status tracker was appended.
The whole feature is not converged. No Spec Kit extension hooks are configured.

K-004 and K-005 meet their own acceptance and move to Done in canonical Kanban
and CSV; K-006/K-028 remain incomplete. Final container/journey/release evidence
and K-026 backup/restore retain their own gates. T044 is completed only by the
observed scoped commit; its SHA is reported in the implementation handoff.
Pre-existing skill/planning edits remain local and excluded from that commit.

## Phase 6 CI, container and process verification — 2026-10-18

Scope: T025–T030, review T045 and commit T046, following `a5759d1`.
Applied using-superpowers, test-driven-development, systematic-debugging,
mastering-typescript, vitest, docker-build-strategies, docker-compose-patterns,
mastering-github-cli, requesting-code-review, receiving-code-review and
verification-before-completion. Docker cleanup is limited to owned ephemeral
smoke containers/projects and preserves all existing database volumes.

Test-first/debugging observations:

- T025's three real CLI stage tests failed for missing verification behavior,
  then passed after adding the required-stage runner. Valid lint passes;
  deliberate lint failure propagates a nonzero stage result; unknown stages fail.
- Container inspection failed before the image existed. Actual first smoke then
  failed readiness: startup could not load next.config.ts without source/build
  dependencies. Compile the config to executable next.config.mjs and package it;
  retain ordinary Next output and the pinned Node 24.22.0 binary.
- Initial Debian 12 slim runtime scan found 64 HIGH/CRITICAL OS findings plus
  npm-global dependency findings. Rebuilt a minimal pinned distroless Debian 13
  C++ runtime with the same Node binary and application production dependencies;
  image rescan reported zero HIGH/CRITICAL findings, with no ignore-unfixed or
  suppression added. Builder packages remain outside the runtime image.
- Clean journey CLI initially failed before install because its installer tried
  to import tsx after removing node_modules. Bootstrap with the pinned npm CLI
  directly, install build dependencies explicitly, then build. The corrected
  clean install/build/migrate/start/probe/outage/recovery/stop case passed
  in 71.93 s. Outage uses an owned TCP proxy, preserving shared service state.
- Real process drain and forced-stall tests passed 2/2. Test instrumentation stays
  inside owned temporary source copies. The stalled request is destroyed and
  shutdown exits nonzero within its configured limit; normal admitted work
  completes and listener closes. No shipped fault route or flag was added.
- A secret canary assertion failed before distinguishing actual findings from
  scanner unavailability. The wrapper now checks the redacted report before
  emitting secret_scan_findings; an error alone cannot satisfy the detection
  test. Its focused regression passed. Cached tool archives are hash-checked on
  every invocation and extracted only into owned short-lived directories.
- Strengthened unit/lint/boundary negative controls require clean baselines and
  each expected diagnostic. An intermediate lint-baseline failure exposed lint
  errors in cleanup code; those were fixed without relaxing the rules. Final
  command reports all three mutations rejected. Unavailable stages are failures.
- Review found host envfile reuse incompatible with Compose bridge DNS. Added a
  separate ignored container envfile, documented db:5432, and verified the real
  app profile on a bridge with an owned test database. Review also caught cleanup
  eligibility being set after compose up; it is now set before startup so partial
  creation failures still tear down the owned project.
- Seven CI tests passed after review fixes: stage behavior, image/runtime/layout,
  Compose readiness/signal delivery, every exported image layer and secret canary.
  A build-only canary is created inside the excluded build context then removed;
  no forbidden paths or canary bytes were found in any exported image layer.

Independent read-only re-review approved the code after both Important fixes;
no unresolved Critical/Important findings remain. Vitest is limited to two workers
for bounded concurrent builds. Final aggregate and full-suite outcomes follow.

Pins resolved from official release/registry metadata on 2026-10-18:

- checkout v7.0.1: 3d3c42e5aac5ba805825da76410c181273ba90b1.
- setup-node v7.1.0: 949feb2413d6458794dcd2491c4babbbce0c15c1.
- Node 24.22.0 bookworm-slim builder index:
  sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5.
- Distroless cc-debian13 nonroot runtime index:
  sha256:e792ab3d241a468a4fd7519ddbbebe66b49b5f365771716ea688ad40b6c6f1c2.
- Gitleaks 8.30.1 Linux x64 archive:
  sha256:551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb.
- Trivy 0.76.0 Linux x64 archive:
  sha256:e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7.

Sources: [checkout release](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node release](https://github.com/actions/setup-node/releases/tag/v7.1.0),
[Gitleaks release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1),
[Trivy release](https://github.com/aquasecurity/trivy/releases/tag/v0.76.0),
[distroless published images](https://github.com/GoogleContainerTools/distroless).
Registry digest pinning is recorded; signature verification was not performed.

Additional direct-gate regression: an actual private source import with passing
architecture fixtures initially returned success through the architecture stage.
The new assertion failed as expected. Added verify:architecture to run the real
source scanner before fixture tests, and wired the required CI stage to it.
Explicit nested credential patterns also remain excluded after the Docker source
allowlist. The first aggregate had already loaded the preceding stage table;
final verification uses the corrected gate.

Observed local aggregate: `APP_ENV=test npm run verify:ci` exited 0. Locked
install added 245/audited 246 packages with zero vulnerabilities; the existing
esbuild install-script warning remains. Format/lint/type, 132 unit, 30 real DB,
2 contract, 28 architecture-fixture, 12 process and 8 CI-control tests passed.
The aggregate built the final distroless image, tested its bridge profile and
all layers, scanned secrets and HIGH/CRITICAL image/filesystem vulnerabilities,
then verified the clean journey and diagnostic-backed negative controls.
The corrected direct actual-source scanner separately returned `[]`; the new
required-stage regression also passed. A fresh whole-suite run is recorded
below rather than treating category totals as a single-suite result.

Final single-suite verification: `APP_ENV=test npm test -- --reporter=dot` passed
212/212 tests across 27 files in 266.72 s, with no skipped tests (132 unit,
30 real PostgreSQL integration, 2 contract, 28 architecture, 12 process and
8 CI controls). `npm run format:check`, `npm run lint`, `npm run typecheck`
and the corrected direct `npm run check:architecture` passed; source boundaries
returned `[]`. Build, image/layer/bridge and scanner evidence above covers the
final container inputs, including removal of .npmrc from build inputs and
preservation of the original ignore rules before the additional allowlist.

Post-suite inspection: zero owned test databases, zero runtime/migration/allocator
sessions and zero smoke containers remain. Both build and secret-test canary
files were removed. Existing development/test services and volumes remain intact.
Skill installation verification passed separately; it is not runtime evidence.

Bounded `$speckit-converge` checked the 15 functional requirements, 7 success
criteria, 16 story acceptance scenarios, 5 named plan decisions, 5 constitution
principles and all 48 task descriptions. No additional Phase 6 code work remains.
Hosted execution evidence is still pending for the existing CI gate; final
handoff/review/convergence tasks (Medium, partial; T031–T033/T047–T048) and external
environment evidence (High, missing; T034) remain in Phase 7. No duplicate tasks
were appended. Whole-feature convergence is not claimed. Spec Kit extension
hooks are absent before and after this assessment/implementation.

T025–T030 and T045 are locally verified. T046 is marked only after the scoped
commit is observed. K-006 stays In Progress until actual hosted CI acceptance;
K-028 remains incomplete. Pre-existing skill/planning changes are preserved and
excluded from the implementation commit. Hosted results are recorded separately.

## Phase 7 local closeout and external handoff — 2026-10-18

T031: corrected current guide/operations prerequisites and removed stale claims
that application containers are future work or all process tests are DB-free.
The exact host configuration recipe targets the separate development service,
writes ignored settings mode 600, never displays values and refuses overwrite.
It was executed in an owned synthetic fixture: correct host/port/database/role,
explicit runtime/migration names, private mode and existing-file preservation
passed. No real development credentials or database were changed by that check.
Existing migration fail/forward-fix/approved-restore and secret-role references
remain in their canonical sections above. Dated evidence remains historical.

The owner explicitly confirmed staging/production resources are not ready.
No AWS profile/region/resource references were supplied, so no AWS query,
provisioning, secret-value fetch, deployment or rotation was performed. Existing
T034 needs resource separation, execution/task-role permissions, redacted ECS
injection mappings, verified remote TLS and replacement/rotation evidence.
K-028 is In Progress with that dependency, not Done. T047/T048 depend on T034
and remain open; the late phase review/commit gate is not bypassed.
GitHub workflow delivery also still lacks the OAuth workflow scope; hosted
CI acceptance and K-006 remain open. T032/T033 evidence follows below.

T032 independent read-only review approved the implemented foundation against
requirements, technical/engineering design, pseudocode, ADR-021 and relevant
contracts: no Critical/Important findings. The prior CHK001–CHK024 preflight
signoff was reconfirmed as document quality; no checklist markers were changed.
Reviewed config/lifecycle/HTTP/privacy/probes/storage/migration/isolation,
module/provider/client boundaries, CI/security, image packaging and current
operator procedures. No material architecture/interface decision changed.
Hosted CI, existing AWS environment/roles/injection/rotation/remote TLS and
production backup/restore were expressly not established by this review.
The reviewer made no edits and ran no tests/builds/installs; T033 requires its
own fresh executed evidence. Historical plan wording was qualified by date,
and the stale disposable quickstart now refers to current canonical evidence.

T033 fresh verification: `APP_ENV=test npm run verify:ci` completed with exit 0
on 2026-10-18 using Node 24.22.0/npm 11.19.1. All 18 required stages ran:
locked install, formatting, lint, typecheck, unit, real PostgreSQL integration,
contract, actual-source plus fixture architecture, build, process, dependency
audit, secrets, container build, CI controls, image/filesystem scans, clean
foundation journey and diagnostic-backed negative controls. Category runs passed
212/212 tests across 27 files with no skips: 132 unit, 30 integration, 2 contract,
28 architecture, 12 process and 8 CI controls. This is the aggregate's category
total, not a new single-suite run. Audit reported zero vulnerabilities; image
and filesystem scans reported zero HIGH/CRITICAL findings. The actual-source
boundary check returned `[]`.

`verify:foundation` reported clean install, one explicit migration, live/ready
200, outage readiness 503, recovered readiness 200 and clean stop.
`verify:ci-failures` reported unit, lint and boundary failures rejected after
passing baselines. Separate `APP_ENV=development
DATABASE_URL=postgresql://localhost/foundation npm run config:check` returned
`configuration_valid`; `APP_ENV=test npm run db:test` returned status ok.
`docker compose config --quiet` and `python3 skills/scripts/manage_skills.py`
exited 0; the latter verifies installation only. Post-run inspection found zero
owned test databases, zero runtime/migration/allocator sessions and zero smoke
containers; control files were removed. Existing services/volumes were preserved.

Bounded `$speckit-converge` assessed 15 functional requirements, 7 success
criteria, 16 acceptance scenarios, 5 named plan decisions, 5 constitution
principles and all 48 task descriptions against the current implementation.
No new local code gap was found. Two existing gaps remain: High/missing external
environment evidence (FR-004/015, T034/K-028), and High/partial hosted CI execution
evidence (FR-011, US4/AC1, SC-006, K-006). Dependent final group review/commit
T047/T048 remain unexecuted. No duplicate convergence tasks were appended; the
assessment itself left disposable tasks unchanged. Whole-feature convergence
is not claimed. No Spec Kit extension hooks exist before or after the checks.

T031–T033 are locally verified: 45/48 tasks are checked. T034/T047/T048 remain
open because staging/production resources are not ready. K-006 and K-028 remain
In Progress, with Kanban and CSV aligned. Phase 7 edits remain local and
uncommitted because T048 depends on T034/T047; no final commit or hosted
delivery is claimed. Phase 6 remains local commit `faff2b2`; its workflow push
still requires GitHub OAuth workflow scope. No product/cloud readiness or
production restore evidence is implied by local acceptance.

## ADR-022 local development and deferred cloud handoff — 2026-10-18

The owner approved developing locally before funding AWS resources. This section
supersedes earlier same-day statements that T047/T048 must wait for T034.
Local T047 review follows T033; T048 follows that review. This documentation
amendment does not itself execute or check either task, create a commit, complete
M0/K-028, establish hosted CI, or claim emulator/provider runtime evidence.

T034 remains deferred to deployment readiness with K-028 In Progress. Its later
redacted evidence must receive relevant AWS skill-based review, fresh verification
and a separate scoped structured commit before external acceptance. T034 collects
existing authorized resources only; provisioning belongs to deployment work.
K-006 still awaits hosted CI and workflow delivery authorization.

Use [the development matrix](../development.md#local-and-real-service-test-matrix)
for implemented versus proposed local coverage and transition steps, and the
[release schedule](../02_build_sequencing/v1_scope_and_release_plan.md#41-local-development-and-external-verification-schedule)
for real-provider milestone checks and staging/release gates. Future feature
engineering plans record limited local K-028 dependency satisfaction, adapter
contract coverage and real-access/budget prerequisites on existing owning cards.
No test kit, dependency or AWS/provider resource was installed or created here.
No API/event schema, session/LLM/execution/voice contract or production provider
selection changed. Existing health contract tests remain applicable; this
amendment changes documentation and verification timing only.

Documentation-amendment review and verification: independent read-only reviewer
`review_local_development_policy` approved the exact 14-document delta against
its pre-amendment snapshot, with no Critical, Important or Minor findings.
Review covered ADR/sequencing/requirements/design/pseudocode consistency,
W15/K-029 dependency interpretation, test matrix availability, trust boundaries
and retained provider/cloud acceptance gates. This approval covers the amendment
only; it does not complete the full T047 review or T048 commit.

`npm run format:check` passed. Read-only documentation checks verified all link
targets in the 14 changed documents, 48 unique tasks with the same 45 checked,
an acyclic dependency graph with T033 → T047 → T048 and deferred T034, and all
29 unchanged Kanban/CSV statuses aligned.
`git -c core.whitespace=cr-at-eol diff --check` passed. Spec Kit prerequisite
checks resolved the correct application_foundation working directory; disposable
spec/plan/tasks were refreshed from canonical sources. Bounded read-only
`$speckit-analyze` covered all 15 FR, 7 SC, 48 task mappings and 5 constitution
principles: no new inconsistency, unmapped task or constitutional exception found.
No extension hooks are registered. Runtime tests/scans were not rerun for this
documentation-only amendment; earlier executed results remain dated evidence.
Emulator/provider compatibility, cloud readiness and hosted CI remain unverified
where identified above. No application code, contracts, dependencies or task
completion markers changed, and no commit/push was performed for this amendment.

## Phase 7 full local review and commit — 2026-10-18

T047: independent reviewer `review_phase7_local_closeout` reviewed the complete
14-document Phase 7 diff against `faff2b2`, including earlier accepted canonical
planning/task amendments and ADR-022. One scope issue was corrected: engineering
guidance now qualifies the untracked skill catalog/lock/installer as workspace-only
setup excluded from this commit. Re-review found no remaining Critical, Important
or Minor findings. This is the full local review; T034 external evidence is excluded
under ADR-022, retaining later review/verification/commit and release gates.

Skills actually used: speckit-implement, using-superpowers, requesting-code-review,
receiving-code-review, mastering-typescript, vitest, mastering-git-cli and
verification-before-completion; bounded speckit-converge reconciles remaining work.
AWS skills were not used to claim unavailable cloud evidence. No production
behavior changed, so no new failing-test cycle or implementation test was added.

Fresh scoped checks on Node 24.22.0/npm 11.19.1:

- `npm run format:check`, `npm run lint`, `npm run typecheck`: exit 0.
- `APP_ENV=test node_modules/.bin/vitest run tests/unit tests/contract --reporter=dot`:
  134/134 tests across 13 files passed, no skips, 5.76 s.
- `npm run check:architecture`: exit 0, actual-source violations `[]`.
- `npm run scan:secrets`: exit 0.
- `docker compose config --quiet`: exit 0.
- `python3 skills/scripts/manage_skills.py`: exit 0 for this workspace's separate
  uncommitted skill setup only; not an application clean-checkout prerequisite.
- Exact development-guide Node heredoc executed in an owned synthetic temporary
  directory: correct development host/port/role/database, explicit migration
  setting, mode 600, no secret-value output and EEXIST preservation passed; fixture
  removed. No real settings or database changed by this recipe check.
- Documentation checks: 14-document link targets resolve; all 48 task IDs unique
  with acyclic dependencies; all 15 FR/seven SC mapped; all 29 Kanban/CSV statuses
  aligned; preexisting instructions/setup preserved. Whitespace check passed.

The earlier full `APP_ENV=test npm run verify:ci`/212-test aggregate is dated T033
evidence for unchanged production code; it was not freshly repeated for this
documentation-only closeout. Hosted CI, real AWS resources/roles/injection/rotation/
remote TLS, live providers, production restore/load remain unavailable external
acceptance, not passing local checks.

Bounded convergence assessed 15 FR, seven SC, 16 acceptance scenarios, five named
plan decisions, five constitution principles and all 48 tasks against unchanged
source plus the reconciled documentation. No new local gap was found. Existing
T034/K-028 external evidence and K-006 hosted evidence remain; no duplicate tasks
were appended and whole-feature convergence is not claimed. No extension hooks
exist before or after implementation/convergence.

T048 scope: the 14 reviewed documentation paths, including all four canonical
feature documents, operator guides, ADR/release/dependency changes and Kanban/CSV.
Exclude AGENTS.md, docs/development_workflow_setup.md, the earlier README skill
catalog block, downloaded skills/discovery links and ignored working copies.
The four canonical documents intentionally reconcile previously accepted planning
amendments with actual implementation evidence. No application source, interface
schema, dependencies, secrets, cloud resources or unrelated setup are included.
Task completion is recorded only after the scoped commit is observed.

T048: the scoped local commit was executed successfully and its SHA/subject
observed before checking this task. The same newly created, unpushed Phase 7
commit is finalized with these reviewed mechanical status updates; its final
SHA is reported in Git history and the handoff, not embedded in itself.
47/48 tasks are verified; T034 alone remains unchecked. Kanban/CSV still retain
K-006 and K-028 In Progress, and no whole-feature/M0 release acceptance is claimed.
All four canonical status headers and README now describe completed local closeout
with explicit deferred/external gates. Unrelated workspace setup stays excluded.
