# Local development

Use this guide from the repository root. Application Foundation is being built
in reviewed increments. The custom server, health adapters, privacy-safe request
telemetry, dedicated local PostgreSQL test service and explicit migrations are
available. Application containers and CI/release stages arrive later. No provider account is needed.

## Toolchain

Node **24.22.0** (LTS) and its bundled npm **11.19.1** are exact pins in
`.nvmrc`, `package.json` and `package-lock.json`. The host initially supplied
Node 20.20.2/npm 10.8.2; those do not meet this project’s engine requirements.
With an existing nvm installation, run `nvm install` then `nvm use` here.
Alternatively unpack the official Linux x64 Node archive into an owned directory,
verify it against the official SHA-256 manifest, then prepend its `bin` directory
to PATH for this shell. This does not require a global installation.

```bash
node --version
npm --version
npm ci
npm run
```

Exact application dependencies: Next 16.4.2, React/React DOM 19.3.1, Zod 4.6.7,
Pino 10.4.0 and pg 8.23.1. Canonical contract tests use YAML 2.9.1, Ajv 8.20.0
and ajv-formats 3.0.1.
TypeScript 6.0.3 stays inside typescript-eslint 8.71.2’s supported range (<6.1);
the registry’s latest TypeScript 7 is outside that range. ESLint 10.13.0,
Prettier 3.9.10, Vitest 5.0.5, tsx 4.23.15 and type packages are pinned in the
manifest and resolved with integrity hashes in the lockfile. Vitest uses Vite
internally as a test dependency; the application framework remains Next.js.

Version selection checked the official Node release manifest, npm package
engines/peer metadata and the [14 October Next security advisory](https://nextjs.org/blog/nextjs-security-update-october-14-2026).
The selected Next patch includes that advisory’s fixes. Sources:
[Node release manifest](https://nodejs.org/dist/index.json),
[Node checksums](https://nodejs.org/dist/v24.22.0/SHASUMS256.txt),
[Next metadata](https://registry.npmjs.org/next/16.4.2).
Package audit and actual installation results are recorded in the foundation
runbook; a version pin alone is not a security or compatibility test.

## Configuration and verification

Runtime settings and implemented commands are documented below. `npm run` lists only implemented commands. Installation,
formatting, linting, type checking and unit tests never need database/provider
credentials. Build/dev/start commands are available below. Prepare local storage with the
[Phase 4 service instructions](runbooks/foundation.md#local-postgresql-services-and-test-targets)
before integration tests or the full suite. Explicit migration commands are below.

### Runtime settings

Copy safe names/defaults from `config/development.example.json`; its
`secretReferences` object describes where a deployment resolves `DATABASE_URL`.
It is documentation, not a JSON loader or a credential value. The parser reads
explicit environment variables. Keep resolved local values only in ignored
`.env.local`; never commit, print or paste a credential-bearing URL into evidence.
`config:check` uses Node’s optional `.env.local` loading; already exported values
win. Other tooling commands do not load that file. JSON examples contain no real
credentials and no usable remote target.

For a credential-free configuration check (no database is contacted):

```bash
APP_ENV=development DATABASE_URL=postgresql://localhost/foundation npm run config:check
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run check:architecture
npm run test:architecture
npm run test:process
npm run test:contract
# After preparing the dedicated local test-db service:
APP_ENV=test npm run test:integration
APP_ENV=test npm test
npm audit --audit-level=high
```

`DATABASE_URL` must name a PostgreSQL host/database. Staging/production require
`sslmode=verify-full` and the database driver must preserve certificate validation.
Never disable verification to fix a connection error. `APP_ENV` is mandatory:
`development`, `staging`, `production` or `test`; it is separate from `NODE_ENV`.
Missing unused Clerk/OpenAI/E2B credentials are allowed. `IDENTITY_ADAPTER`
defaults to `disabled`; `test` is restricted to development/test and the
unimplemented `clerk` mode fails closed.

Architecture verification checks the actual `src/` import graph and deliberate
forbidden/allowed fixtures. Module ownership and `public.ts` rules are documented
in [the module map](../src/modules/README.md). These static checks protect trusted
source boundaries; candidate execution still requires its separate sandbox.

Process tests build and run production and development servers in disposable
copies, without database/provider access. The development test performs two
real HMR reloads and verifies one runtime resource acquisition and listener.
Only owned copies are instrumented or edited; the real checkout is untouched.
Allow disk space for three dependency copies and up to 120 seconds for development
startup; each reload and normal shutdown has a 30-second deadline. `npm test`
includes these process and architecture suites; `test:unit` is the focused unit run.

| Variable                  | Default                             | Constraint                               |
| ------------------------- | ----------------------------------- | ---------------------------------------- |
| `PORT`                    | 3000                                | Integer 1–65535                          |
| `LOG_LEVEL`               | info                                | trace/debug/info/warn/error/fatal/silent |
| `DB_POOL_MAX`             | 5                                   | Integer 1–10                             |
| `DB_CONNECT_TIMEOUT_MS`   | 500                                 | Positive integer, at most 2147483647     |
| `DB_STATEMENT_TIMEOUT_MS` | 500                                 | Same bound                               |
| `READINESS_TIMEOUT_MS`    | 2000                                | At least connect + statement budget      |
| `STARTUP_TIMEOUT_MS`      | 120000 development, otherwise 60000 | Positive integer timer bound             |
| `SHUTDOWN_TIMEOUT_MS`     | 30000                               | Same bound                               |

Invalid settings cause a nonzero config-check exit with fixed key names and
stable codes only. Valid settings print `configuration_valid`; no listener,
provider request or database connection is opened. Settings are immutable.
`parseBuildConfig` deliberately excludes runtime secrets. The actual Next build
has also been verified with an empty environment and without database/provider access.

### Clean setup and recovery

From a clean checkout, activate the exact runtime, run `npm ci`, then the checks
above. `npm ci` enforces package/lock agreement. If they diverge, review the
intended manifest change and regenerate the lockfile with the pinned npm, then
rerun installation and audit; do not use forced peer resolution or skip the
engine check. Never use global Git/npm configuration to repair this project.

Formatting covers implemented source/tooling/docs. Retained wireframes, imported
skills, historical documentation, canonical contracts and Kanban exports retain
their existing format. ESLint runs directly with TypeScript rules. Its Next
preset was unused in this configuration and introduced the unpatched
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), so it was
removed rather than downgrading Next or suppressing audit findings. React/Next
specific lint rules can be selected with their owning implementation and the
same security gate. This increment contains no React components.

## Start the operational skeleton

```bash
npm run build
APP_ENV=development DATABASE_URL=postgresql://localhost/foundation npm run dev
```

In another terminal, query `http://localhost:3000/api/v1/health/live`. Expect
HTTP 200, `Cache-Control: no-store`, and JSON containing `status: "ok"` and a
UTC timestamp. This probe requires no login and does not contact the database.
Use Ctrl+C to stop; SIGINT and SIGTERM stop admission and drain existing work
before closing Next and acquired resources. A stuck startup/shutdown fails
within its configured budget and exits nonzero.

For the built server, stop development first, then:

```bash
APP_ENV=development DATABASE_URL=postgresql://localhost/foundation npm start
```

`npm start` selects Next's production mode (`NODE_ENV=production`); `APP_ENV`
selects operational settings independently. Build never opens a database or
validates deployment credentials. The custom server compiles to `dist/server.mjs`
with framework packages external, so runtime dependencies must remain installed.
No Next standalone output is used. Never run a build over an active dev cache;
stop the owned dev process first or use an isolated work copy.

Configuration validation precedes Next preparation and binding. An unavailable
DB does not stop liveness. `/api/v1/health/ready` checks serving lifecycle and
bounded storage/schema compatibility and returns 503 when the ledger is absent
or differs from the packaged manifest. An empty/no-ledger database returns 503; run the explicit migration command
against the authorized target before expecting readiness 200. Do not use liveness as a deployment gate.
Request completion records contain fresh server IDs and allowlisted bounded fields;
incoming IDs, URLs/query strings, headers, bodies and raw errors are excluded.

`dist/migration-manifest.json` is built from sorted local SQL filenames. It
now contains `1781654400000_foundation`. The SQL baseline creates no domain
tables; node-pg-migrate owns its ledger. Manifest presence alone does not prove
that a target database has been migrated. Generated `.next`, `dist`,
`next-env.d.ts` and TypeScript caches are ignored. Strict TypeScript remains
active; automatic Next suggestions were reviewed with JavaScript sources still
disabled. Build regenerates framework type declarations for its active output.

## Explicit storage workflow

`npm run db:migrate` loads ignored `.env.local` settings (exported values win),
requires explicit APP_ENV plus MIGRATION_DATABASE_URL and applies up to the local
SQL head. It never falls back to runtime DATABASE_URL. Resolve credentials through
the authorized local/secret mechanism; do not put values in shell arguments or
tracked examples. Outside local setup, use the separate approved migration role.

```bash
# After resolving explicit APP_ENV and MIGRATION_DATABASE_URL safely:
npm run db:migrate
# Repeating a successful migration is a no-op.
APP_ENV=test npm run db:test
APP_ENV=test npm run test:integration
```

`db:test` checks the guarded allocator and drops its own empty allocation; it does
not migrate the development database. Integration suites select empty or prepared
fixtures explicitly. Prepared-schema readiness invokes the actual migration runner;
migration-under-test fixtures stay empty so first-apply behavior is observable.
See [migration operations and recovery](runbooks/foundation.md#explicit-migrations-and-recovery)
for locking, deadlines, failure classification and forward-fix/approved-restore rules.
