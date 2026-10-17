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
