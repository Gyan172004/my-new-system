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
