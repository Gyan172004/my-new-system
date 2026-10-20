# Local development

Use this guide from the repository root. Application Foundation is being built
in reviewed increments. The custom server, health adapters, privacy-safe request
telemetry, dedicated local PostgreSQL test service and explicit migrations are
available, together with the non-root application image and local CI/security
commands. Hosted CI acceptance and external deployment gates remain pending.
No paid-provider account is needed for local verification.

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
before integration/process tests or the full suite. Explicit migration commands are below.

### Runtime settings

Copy safe names/defaults from `config/development.example.json`; its
`secretReferences` object describes where a deployment resolves `DATABASE_URL`.
It is documentation, not a JSON loader or a credential value. The parser reads
explicit environment variables. Keep resolved local values only in ignored
`.env.local`; never commit, print or paste a credential-bearing URL into evidence.
`config:check` uses Node’s optional `.env.local` loading; already exported values
win. `dev`, `start` and `db:migrate` also load optional `.env.local`; build, tests,
scanners and aggregate verification use their explicit documented environments.
JSON examples contain no real credentials or usable remote target.

For a credential-free configuration check (no database is contacted):

```bash
APP_ENV=development DATABASE_URL=postgresql://localhost/foundation npm run config:check
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run check:architecture
npm run test:architecture
npm run test:contract
# After preparing the dedicated local test-db service:
APP_ENV=test npm run test:process
APP_ENV=test npm run test:integration
# The complete suite also inspects the built image:
npm run container:build
APP_ENV=test npm test
npm audit --audit-level=high
```

`DATABASE_URL` must name a PostgreSQL host/database. Staging/production require
`sslmode=verify-full` and the database driver must preserve certificate validation.
Never disable verification to fix a connection error. `APP_ENV` is mandatory:
`development`, `staging`, `production` or `test`; it is separate from `NODE_ENV`.
Missing unused Clerk/OpenAI/E2B credentials are allowed. `IDENTITY_ADAPTER`
defaults to `disabled`; `test` is restricted to development/test. `clerk` requires
complete validated runtime settings from `.env.identity.example`, including the
server-only middleware key and supported public verification key. See the
[identity runbook](runbooks/identity.md) for provider setup and observed acceptance.
Production builds need none of these keys.

Architecture verification checks the actual `src/` import graph and deliberate
forbidden/allowed fixtures. Module ownership and `public.ts` rules are documented
in [the module map](../src/modules/README.md). These static checks protect trusted
source boundaries; candidate execution still requires its separate sandbox.

Process tests build and run production and development servers in disposable
copies. The clean foundation journey requires explicit `APP_ENV=test`, the
dedicated local test database and its ignored password file; it migrates only an
owned allocation. Startup, HMR, privacy and shutdown fixtures require no provider
credentials. No staging/production target is used by these suites. The development test performs two
real HMR reloads and verifies one runtime resource acquisition and listener.
Only owned copies are instrumented or edited; the real checkout is untouched.
Allow disk space for the checkout, concurrent disposable dependency copies and
an exported image archive. Development startup may take up to 120 seconds; each reload and normal shutdown has a 30-second deadline. `npm test`
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

## Container and CI verification

Linux x86-64, Docker Engine/BuildKit, Compose v2, Python 3 (image-layer inspection)
and the pinned Node/npm toolchain are required for the complete suite. Start the
dedicated test service using the earlier instructions. Build the image before
running `npm test`: the CI tests inspect the actual image, all exported layers
and an owned Compose bridge-profile container. Vitest runs at most two workers
to bound concurrent Next builds on hosted runners.

```bash
npm run container:build
APP_ENV=test npm test
APP_ENV=test npm run verify:foundation
npm run verify:ci-failures
npm run scan:secrets
npm run scan:filesystem
npm run scan:image
APP_ENV=test npm run verify:ci
```

The workflow is defined locally. Its Phase 6 push is currently blocked by the
GitHub OAuth token missing `workflow` scope; no hosted run is claimed. Complete
the repo-local GitHub CLI authorization before retrying that push. Do not
remove the workflow or bypass required checks to make delivery succeed.

`verify:ci` executes locked installation, format/lint/type, unit, real DB,
contract, architecture, build, process, dependency audit, secrets, container,
CI-control, image/filesystem, clean journey and negative-control stages in order.
`-- --list` lists stages; `-- --stage <name>` runs one required stage and returns
nonzero on failure. No required stage is optional. Scanner download, integrity,
platform and vulnerability-database failures also fail verification. Security
tools are Linux x86-64 release archives pinned by version and SHA-256 in
`scripts/security.ts`; cache files stay in ignored `.local/security-tools`.
Gitleaks output is redacted; its short-lived report is removed after each scan.
Trivy rejects HIGH/CRITICAL findings without ignoring unfixed vulnerabilities.

GitHub's Foundation CI runs the same aggregate command on pull requests and
main/feature pushes. It has read-only repository permissions, immutable action
pins, no persisted checkout credential or paid-provider keys, generated local
DB passwords and a 45-minute job deadline. `prepare-ci.ts` only initializes an
empty CI workspace with explicit CI/test identity; it refuses overwriting secret
files. Hosted CI status must be observed separately from a local pass.

The optional Compose `app` profile runs the ordinary custom-server image as a
non-root user. Supply a separate ignored **`.env.container.local`**, mode 600,
through the authorized local secret mechanism. Set APP_ENV=development and use
Docker DNS host **db**, internal port **5432**, database foundation_development
and the existing local development owner/secret reference. The host `.env.local`
uses published loopback ports and is not imported by the container. Missing
container settings fail startup; the file is optional only so inactive-profile
configuration validation can run. Do not print resolved Compose configuration.
Explicitly migrate the authorized local target before expecting readiness 200.

```bash
docker compose config --quiet
# After supplying the separate container settings safely:
docker compose --profile app run --rm app node dist/migrate.mjs
docker compose --profile app up -d app
# Reversible stop; all database volumes are retained.
docker compose --profile app stop app
```

The migration command requires a separate MIGRATION_DATABASE_URL in that ignored
container file; it never falls back to DATABASE_URL. No migration runs on start.
The image contains compiled server/migration/configuration files, ordinary Next
output and production dependencies. It includes no package manager, shell,
application TypeScript sources, local credentials or documentation. Operational
health checks use Node directly; signals go to the Node PID1. Production cloud
roles, environments, deployment and backup/restore evidence remain later gates.

## First clean local run

1. Activate the exact Node/npm toolchain and run `npm ci`.
2. Follow [local service preparation](runbooks/foundation.md#local-postgresql-services-and-test-targets)
   to create or preserve the ignored password files and start both isolated DB services.
3. Run `docker compose up -d --wait --wait-timeout 30 db test-db`.
4. Run `APP_ENV=test npm run verify:ci` for the complete provider-free verification
   journey. It creates its own temporary database, explicitly migrates, tests
   outage/recovery and shuts down its own processes; the development DB is unchanged.
5. For an interactive development server with readiness 200, prepare host settings
   below, then run `npm run config:check`, `npm run db:migrate`, `npm run build`
   and `npm start`. Query both health routes; use Ctrl+C for bounded shutdown.

Create `.env.local` only when it does not already exist. This local-bootstrap
recipe reads the existing development password without displaying it; it never
uses the dedicated test-admin identity. An existing file is preserved with an
EEXIST failure; review its settings through the authorized local mechanism.

```bash
node --input-type=module <<'NODE'
import {readFile,writeFile} from 'node:fs/promises';
const password=await readFile('.local/foundation/db-password','utf8');
const url=new URL('postgresql://127.0.0.1:45432/foundation_development');
url.username='foundation_dev_owner';
url.password=password;
await writeFile('.env.local',
  `APP_ENV=development\nDATABASE_URL=${url}\nMIGRATION_DATABASE_URL=${url}\n`,
  {flag:'wx',mode:0o600});
console.log('Local settings created; values were not printed.');
NODE
npm run config:check
npm run db:migrate
npm run build
npm start
```

The equal runtime/migration identity in this recipe is only the existing local
bootstrap convention. Staging/production must use separate least-privilege roles,
verified TLS and deployment-owned secret injection. See the existing
[environment handoff](runbooks/foundation.md#environment-isolation-and-secret-injection-handoff)
and [migration recovery](runbooks/foundation.md#explicit-migrations-and-recovery).
The separate `.env.container.local` uses db:5432 as described above. Stop the
owned host server before starting a container on the same published port.

On 2026-10-18 the owner confirmed that staging/production resources are not ready.
No AWS profile, account, region or existing resource references were supplied.
T034/K-028 stays open; this local recipe is not external environment or production
backup/restore evidence. No infrastructure is provisioned by these commands.

## Local and real-service test matrix

ADR-022 permits local development before AWS resources are funded. This matrix
separates available foundation coverage from future feature work; it does not
install tools or establish external acceptance.

| Component                 | Local/CI approach                                                                                           | Availability                                                                                                                              | Real-service evidence still required                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| API/application container | Existing Node/Next image, process and Compose bridge tests                                                  | Implemented foundation                                                                                                                    | ECS networking, deployment, scaling and rollback                                                            |
| PostgreSQL                | Existing real PostgreSQL services and owned isolated databases; explicit migrations                         | Implemented foundation                                                                                                                    | RDS version/extension compatibility, verified TLS, permissions and restore                                  |
| SQS                       | Evaluate an SQS-compatible emulator such as ElasticMQ through the selected AWS SDK                          | Proposed for owning queue feature; not installed                                                                                          | Real retries, visibility, duplicates, DLQ and idempotent consumer/outbox behavior                           |
| Configuration/secrets     | Existing private local settings, synthetic canaries and sanitized validation tests                          | Implemented foundation                                                                                                                    | ECS/Secrets Manager IAM, injection and task replacement/rotation under T034                                 |
| Clerk                     | SDK signature/token fixtures, guarded local identities, real PostgreSQL mapping/ownership and browser shell | Feature 2 development acceptance verified: owner Google/real-email sign-in, selected methods, token refresh/expiry, mapping and isolation | Repeat selected-method and provider checks for staging/production; deployment release gates remain required |
| OpenAI text/audio         | Planned deterministic Gateway fixtures for success, malformed output, timeout and rate limits               | Future Gateway/voice features                                                                                                             | Real SDK/API compatibility, text/audio quality, latency, budgets and data controls                          |
| E2B                       | Planned coordinator contract fixtures; no candidate execution inside trusted workloads                      | Future execution feature                                                                                                                  | Actual sandbox isolation, pinned runtimes, resource/network limits and cleanup                              |

ElasticMQ is a candidate with an [SQS-compatible interface](https://github.com/softwaremill/elasticmq).
[Testcontainers](https://node.testcontainers.org/modules/postgresql/) is an
optional future container-lifecycle helper; the existing Compose/database harness
already serves foundation tests. LocalStack is another candidate, subject to
[current licensing](https://docs.localstack.cloud/aws/licensing/), service
coverage and limitations review. None is installed or selected by this amendment.

When the owning feature introduces a tool, pin/review its version and image,
license, supported operations and differences from the real service. Reuse the
same application-facing contract scenarios against local and real adapters.
Inject duplicate/out-of-order delivery, timeout, malformed responses and retry
failures explicitly; emulator defaults do not prove production queue semantics.
No blanket promise of a configuration-only transition is made.

For a real-service transition: obtain authorized references and bounded test
budget; select the real adapter/endpoint and dedicated test identity; keep local
fixture settings out of staging/production; run matching contracts and additional
provider-specific checks; record redacted outcomes on the owning card. Fix any
parity gaps before provider acceptance. Do not copy local secrets into cloud
configuration or automatically fall back to a fixture on provider failure.

Ordinary CI remains deterministic and paid-provider-free. At each provider
milestone, run a separately authorized real smoke check; if unavailable, keep
that provider acceptance open and continue only independent work. Near deployment,
actual AWS staging must pass T034/K-028 and the K-026 operational/release checks.
See the [release schedule](02_build_sequencing/v1_scope_and_release_plan.md#41-local-development-and-external-verification-schedule).
