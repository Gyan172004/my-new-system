# Foundation operations and verification evidence

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
| development | Dedicated local PostgreSQL target; ignored local runtime values; dedicated test storage arrives in T015              |
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
`NODE_TLS_REJECT_UNAUTHORIZED=0` are rejected in staging/production. The database
adapter must still enforce certificate verification with the approved trust
material when implemented. An approved CA trust bundle may be required by the
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
