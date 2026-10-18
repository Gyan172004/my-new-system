# Application Foundation — Technical Design

**Date:** 2026-10-17  
**Status:** Accepted design with Phases 1–6 and Phase 7 local closeout verified; deferred T034 and external acceptance gates remain open. See the canonical Kanban and foundation runbook for evidence.
**Scope:** K-001–K-006, K-028.  
**Inputs:** [Requirements](../../requirements/feature_req.md), [engineering design](../engineering/eng_design.md), [logic](../../pseudo_code/logic_and_state.md), [ADR register](../../../../01_macro_architecture/05_architecture_decision_records.md).

## Summary and technical context

The owner chose TypeScript + Next.js during clarification. Use one trusted
modular monolith with Next.js App Router Route Handlers in the Node.js runtime.
HTTP files translate requests/responses; application modules own behavior.
M0 implements operational foundation only. No candidate UI, business endpoints,
provider calls, queue consumer or candidate code runner is delivered here.

| Concern | Foundation selection |
|---|---|
| Runtime | Node.js 24 LTS; TypeScript strict mode; Next.js maintained 16 line; React peer versions required by the selected Next patch |
| Installation | npm, committed `package-lock.json`, `npm ci`; exact Node/npm/package patches and image digests pinned during K-001/K-002 after compatibility/security checks |
| HTTP | App Router Route Handlers, `runtime = 'nodejs'`, uncached health requests, existing `/api/v1` prefix |
| Entrypoint | Small Node `http` custom server using public `next()` API; TypeScript entrypoint compiled with esbuild, framework packages external; no Express/NestJS |
| Storage | Real PostgreSQL; `pg` pool and parameterized SQL; no ORM; local PostgreSQL 17 line, exact image patch/digest recorded during implementation; deployment must verify RDS engine compatibility |
| Migrations | Pinned stable `node-pg-migrate` 9.0.0, explicit runner, single-file SQL migrations, library ledger plus packaged revision manifest |
| Validation/logs | Zod settings schema; Pino with field allowlist and redaction; Node AsyncLocalStorage request context |
| Verification | Vitest for unit/integration/contract/process tests; YAML + Ajv 2020-12 with ajv-formats for canonical health schema assertions; dependency-cruiser and static boundary fixtures |
| Quality/build | ESLint, Prettier, `tsc --noEmit`; separate Next build and entrypoint compilation; npm audit, Gitleaks, Trivy; immutable local container |
| Platform | Local Node/container + PostgreSQL; production target remains ECS/Fargate/RDS/SQS/Secrets Manager/CloudWatch; no cloud resources provisioned in this feature plan |

These are concrete implementation conventions within ADR-021. The original
2026-10-17 planning workflow installed no dependency or runtime test. Subsequent
Phases 1–6 pinned and verified the implemented versions; current evidence and
open external gates are recorded in the foundation runbook. Secure exact pins
remain required, without selecting prereleases to satisfy skill examples.

## Constitution check before research and after design

| Gate | Assessment |
|---|---|
| Canonical authority | Four feature documents hold accepted design; disposable drafts mirror or link here; no permanent `specs/` tree |
| Architecture | ADR-001–020 retained; owner's stack choice added to existing register as ADR-021; no second ADR log |
| Policy/trust | Session transitions stay backend-owned; models go through Gateway; hostile execution stays outside Next/API/trusted workers |
| Interfaces | Existing health routes/schema consumed unchanged; no event producer/consumer introduced; impact review below |
| Dependency readiness | K-001 precedes K-002 despite board grouping; later cards retain prerequisites; planning grants no implementation completion |
| Engineering evidence | Failing tests precede production changes; unit/integration/contract/process checks, important-change review and convergence required |
| Status/memory | Kanban and CSV alone own status; no secrets or copied architecture in memory |
| Review gates | Reviewer-owned requirements checklist remains available for signoff; AWS evidence is an explicit K-028 completion gate |

Pre-research and post-design assessment: no constitutional exception required.
Design review does not prove runtime correctness. Material stack ambiguity is
resolved by the user's answer; unrelated production gates remain deferred.

## Research decisions and alternatives

1. **Decision: custom Node server, ordinary Next output.** It owns configuration
   validation before binding and shutdown ordering. Standard `next start` plus
   instrumentation does not document those exact guarantees. Cost: explicit
   bootstrap build and production dependency packaging. Do not enable standalone
   output or rely on internal Next modules. [Official custom-server guide](https://nextjs.org/docs/app/guides/custom-server).
2. **Decision: runtime configuration is invoked, never evaluated at import.**
   `next build` must work without DB/provider credentials or network access to
   those services. `APP_ENV` distinguishes development/staging/production/test;
   `NODE_ENV` retains Next's development/production/test meanings. No secrets
   enter `NEXT_PUBLIC_*`. [Official environment guide](https://nextjs.org/docs/app/guides/environment-variables).
3. **Decision: Node 24 LTS planning baseline.** Pin its secure patch at execution;
   do not choose a Current-only release for deployment by default.
   [Official release table](https://nodejs.org/en/about/previous-releases).
4. **Decision: `pg` plus explicit SQL migrations.** This avoids introducing an
   ORM before domain tables exist. Use a dedicated migration client, explicit
   `singleTransaction: true`, `checkOrder: true`, locking enabled, and fail-fast
   contention. Verified v8.0.3 source supports that behavior and legacy SQL
   markers; the actual stable pinned release must be checked against those
   semantics. Do not use alpha-only loader/locking options.
   [Tagged runner](https://github.com/salsita/node-pg-migrate/blob/v8.0.3/src/runner.ts),
   [tagged SQL loader](https://github.com/salsita/node-pg-migrate/blob/v8.0.3/src/sqlMigration.ts).
5. **Decision: real storage and process evidence.** An in-memory DB cannot prove
   PostgreSQL locks, transactions or driver cancellation. Unit fakes supplement
   real integration tests. Pool acquisition and actual query work both need
   limits; `Promise.race` alone does not stop SQL.
   [Pool API](https://node-postgres.com/apis/pool), [client API](https://node-postgres.com/apis/client).

Research completed against primary documentation on 2026-10-17, including a
read-only research agent required by the planning skill. No unresolved research
choice remains for this foundation design. Version/account-specific validation
is an implementation/release check, not a claim made here.

## Proposed code and test structure

All paths below are future implementation deliverables, not files created by
planning. Keep the existing documentation structure intact.

```text
src/app/api/v1/health/live/route.ts
src/app/api/v1/health/ready/route.ts
src/server/bootstrap.ts                 # only process/HTTP owner
src/server/config.ts                    # invoked settings parser
src/server/runtime.ts                   # process registry and lifecycle
src/server/request-context.ts           # AsyncLocalStorage context
src/server/logger.ts                    # fixed event/field allowlist
src/server/http.ts                      # completion and safe error adapter
src/server/health.ts                    # pure health orchestration
src/server/database.ts                  # lazy bounded pool/check adapter
src/server/schema-version.ts            # read-only revision comparison
src/modules/README.md                   # ownership/public import rules
scripts/build-server.mjs
scripts/build-migration-manifest.ts
scripts/migrate.ts
scripts/test-database.ts
scripts/verify-foundation.ts
scripts/verify-ci-negative-controls.ts
migrations/1781654400000_foundation.sql
tests/unit/{config,lifecycle,health-live,request-context,logger,health,http,test-services,test-database-guards}.test.ts
tests/architecture/{boundaries,client-imports}.test.ts
tests/architecture/fixtures/
tests/integration/{database,migrations,test-isolation,readiness}.test.ts
tests/contract/health.test.ts
tests/process/{startup,hmr,shutdown,privacy,foundation}.test.ts
tests/ci/negative-controls.test.ts
tests/helpers/{test-database,process}.ts
package.json, package-lock.json, .nvmrc, .npmrc, tsconfig.json
next.config.ts, eslint.config.mjs, .prettierrc.json
vitest.config.ts, .dependency-cruiser.cjs, .gitleaks.toml
Dockerfile, .dockerignore, compose.yaml
config/{development,staging,production}.example.json
.github/workflows/ci.yml
docs/development.md, docs/runbooks/foundation.md
```

The first App Router route is `/api/v1/health/live`: T005 defines its failing
test, and T006 adds the minimal dependency-free handler and liveness function in
`src/server/health.ts` alongside the bootstrap. It is present before Next
preparation/build and the US1 process tests. T009/T010 exercise that real route
and its access to the bootstrapped runtime registry, with no database or provider
call. T014/T015 retain the liveness regression coverage and add readiness,
health orchestration and full canonical compatibility cases. This is one
incremental health implementation, not a temporary product endpoint; K-004
remains incomplete until its full acceptance passes.

Future domains live under `src/modules/<domain>/` with `public.ts` exports and
private application/domain/persistence/adapters. Declared domains map to the HLD:
identity/profile, catalogue/packs, content/admin publishing, interview,
conversation, approach assessment, hints/variants, Model Gateway, submissions,
execution coordination, feedback and history. Only create a domain's code when
its feature needs it; do not generate false-success routes or speculative tables.
Trusted workers can later reuse allowed module interfaces without importing
Next routes. Candidate execution remains an external E2B adapter.

Import rules: clients cannot import `src/server`, private modules, `pg` or secret
configuration. Cross-module imports target only `public.ts` and do not expose
mutable storage entities. Provider SDKs are limited to their adapters; no direct
model/audio calls from UI/domain files. No `eval`, dynamic candidate-code import,
VM or subprocess execution in domain/API code. Boot/test tooling may spawn the
service, never candidate submissions. Dependency checks include forbidden fixture
imports so an empty skeleton cannot create a vacuous passing claim.

## Configuration and lifecycle

`APP_ENV` is mandatory and exactly `development|staging|production|test`.
`DATABASE_URL` is required server-only at runtime; use a secret reference or a
safe name in documentation, never an example containing credentials. TLS is
required with certificate verification outside local/test environments.
Reject an explicit `NODE_TLS_REJECT_UNAUTHORIZED=0` in staging/production before
initialization. This local guard does not replace the database adapter's verified
TLS configuration or T034's actual environment evidence.
`IDENTITY_ADAPTER` is `disabled|clerk|test`, default `disabled` in M0; `test` is
rejected in staging/production. `clerk` may be selected only when its owning
feature implements it; no unimplemented mode may silently fall back to test.
No protected routes exist in M0. Missing unused provider keys must not prevent
foundation startup. Later active integrations extend the schema in their feature.

Settings schema also validates port 1–65535, log level enum, pool size 1–10 and
finite positive budgets. Proposed defaults: port 3000, pool max 5,
connect/acquire timeout 500 ms, statement timeout 500 ms, readiness deadline
2000 ms, startup deadline 60 s in production (120 s in development), total
shutdown deadline 30 s. Reject inconsistent values that exceed the enclosing
budget. Budgets are operational defaults to test, not proven service SLOs.
Next production `NODE_ENV` may run with `APP_ENV=staging`; never set
`NODE_ENV=staging`.

Bootstrap loads configuration explicitly, creates a lazy pool (no connect-on-import),
installs the runtime registry, prepares Next under its deadline, then listens.
Pool connectivity is tested by readiness, allowing liveness during outages.
The registry uses a stable `globalThis` symbol so Next's server bundle and the
custom entrypoint share lifecycle/context/pool state. No client import may reach
it. Process tests must prove this shared state in the production build; module
identity assumptions are insufficient. HMR must not multiply pools/listeners.

SIGTERM/SIGINT marks draining synchronously, calls Node HTTP close to stop new
admission, drains admitted requests, closes Next and the pool, then exits. Track
sockets and in-flight requests; force closure and nonzero exit at the absolute
deadline. Bounded `pool.end()` alone cannot guarantee shutdown if clients leak.
No migration runs during boot, a probe or each replica. See canonical pseudocode.

## Interfaces and compatibility impact

Canonical [OpenAPI](../../../../../contracts/api/v1_openapi.yaml) defines server
base `/api/v1`, unauthenticated `GET /health/live` and `GET /health/ready`, and
`HealthStatus`. Effective paths are `/api/v1/health/live` and
`/api/v1/health/ready`. Do not add an unversioned alias implicitly.

| Observation | HTTP/status | Safe check fields |
|---|---|---|
| Liveness handled by functioning process | 200 / `ok` | Omit checks; timestamp required |
| Serving + DB connected + exact revision manifest match | 200 / `ok` | `application`, `database`, `schema`: `ok` |
| Initializing/draining if request is admitted | 503 / `unavailable` | `application: unavailable` |
| DB failure or total deadline exceeded | 503 / `unavailable` | `database: unavailable`, `schema: skipped` |
| Missing ledger, older/newer/unknown/mismatched revision history | 503 / `unavailable` | `database: ok`, `schema: unavailable` |

Use UTC ISO timestamps, `Cache-Control: no-store`, dynamic Node Route Handlers,
and no user/session/cookie/body access. No DB host, exception, SQL or revision
value leaves the service. The expected ordered ledger names are packaged in a
build manifest derived from migration filenames; exact comparison detects unknown
and missing revisions rather than checking only one row. No DB query during build.
Driver/server timeouts must stop work and release/destroy clients on failure.

M0 generates a fresh UUID request ID at ingress, ignores incoming request-ID
values, and propagates it through AsyncLocalStorage. No new public correlation
header is promised. Existing `ApiError.requestId` is used when a matching error
response is applicable; health failure uses `HealthStatus` as specified. Future
event producers map request context to canonical `correlationId`, not a new
envelope field. Foundation publishes no events.

Affected producer: future health Route Handlers and bootstrap error adapter.
Consumers: local smoke client, CI contract suite and future ALB health probes.
Tests resolve root OpenAPI and validate statuses, schema, paths, unauthenticated
access and cache behavior. Public health/event wire formats are unchanged; root
contracts need no edits. Future changes must update all affected consumers and
tests together. Generated Next OpenAPI endpoints or auth responses cannot replace
the existing contract.

## Data model and migrations

| Record | Fields and rules | Ownership/lifetime |
|---|---|---|
| RuntimeConfig | Validated env, server settings, secret handles; never serializable to client | One process; immutable after startup |
| RuntimeState | `NEW, VALIDATING, INITIALIZING, SERVING, DRAINING, STOPPED, FAILED`; transition guards | One process registry |
| RequestContext | Server UUID `requestId`, monotonic start; future trace/job mappings are explicit | Async request scope, always cleared |
| HealthReport | Existing status/timestamp/check enums only | Response, never persisted |
| Migration ledger | Library-owned `id`, unique ordered migration identity checked by manifest, execution timestamp | PostgreSQL metadata only; not domain events |
| TestResource | Unique run/worker database identity, guarded server, owner role, allocation provenance | Test fixture only, safe bounded cleanup |

Initial SQL migration contains a reversible no-domain baseline (`SELECT 1` in
up/down sections); the library establishes `public.pgmigrations`. No users,
sessions, packs, outbox or test tables are installed in production by foundation.
Use the library's ledger schema rather than hand-editing its rows. Migrations
have immutable applied filenames, ordered prefixes and one packaged head.

Explicit migration runner uses its own `MIGRATION_DATABASE_URL`, a DDL-capable
role distinct from the ordinary runtime role outside local setup. It retains
locking, order checks and a single transaction; contention exits immediately
with a sanitized `migration_busy` result. Connection deadline 2 s, SQL statement
deadline 30 s and absolute command deadline 60 s; hard timeout must terminate the
dedicated client/process so locks are actually released. No success stamping or
automatic retry on failure. Parse connection options once, discard nested raw
connection strings/startup options, then enforce owned timeout fields so URL
parameters cannot disable the budgets. A public legacy SQL loader validates the
complete existing history prefix under the library lock before apply. Exact
postcheck runs after library unlock; a concurrent newer artifact can therefore
produce a nonzero result after this batch committed. Inspect ledger/artifact
versions and use reviewed forward recovery rather than assuming rollback.
Future nontransactional DDL needs a feature-specific
recovery design before adoption; production destructive down is never automatic.

Integration tests use a dedicated PostgreSQL service and test-admin role, explicit
`APP_ENV=test`, approved host/port allowlist, generated database prefix
`foundation_test_`, and exact allocation ownership recorded by the fixture.
Names are at most 63 bytes and contain only lowercase letters, digits and underscores; quote identifiers
safely rather than interpolate user input. Cleanup refuses arbitrary supplied
names and any development/staging/production target. Each run/worker gets a
separate database, initializes it according to the suite purpose below, closes
connections and drops only its allocation.
Setup/teardown deadline is 30 s each. The implemented fixture rejects missing or
non-test APP_ENV before credential access; approved local test host/port and role
references are documented in the foundation runbook. T015 introduces separate `db` (development)
and `test-db` (integration) services in `compose.yaml`, with distinct volumes,
roles and loopback-bound ports, reviewed pinned PostgreSQL 17 image digests and
finite health checks; its runbook documents startup and the exact test-target
allowlist. T016 writes guard tests and introduces `tests/helpers/test-database.ts`
before real driver/deadline tests. It allocates an empty owned DB without applying
migrations and expects absent-ledger readiness to be unavailable. T019 expands
isolation coverage; T020 consolidates that same helper and adds the CLI. An
explicit scenario purpose selects empty storage for pool/deadline, isolation,
migration-under-test and no-ledger readiness cases. Only a scenario requesting
prepared-schema readiness invokes the injected actual T022 migration initializer.
Migration tests invoke the runner as the behavior under test; allocation must not
pre-apply head and invalidate empty/first-apply assertions.
Never create production ledger rows or bypass ownership guards as a shortcut.
T027 extends Compose for the application image while preserving both DB services.
Unit tests may use fakes; storage claims require PostgreSQL. Restore/backup
evidence remains K-026.

## Privacy, observability and failures

Log allowlist: fixed event name, service, environment, level, request ID,
HTTP method, matched route template or constant `unmatched`, status,
elapsed milliseconds and stable error code. No raw URL/query, arbitrary headers,
body, candidate text/code/audio, DB URL, error stack/message or object dumping.
Bound values; use Pino redaction as defense in depth, not permission to serialize
requests. Disable framework request/fetch URL logging in production; catch and
sanitize expected/unexpected route, pool and bootstrap errors before framework
logging. Capture both stdout and stderr in canary process tests, including raw
exception objects containing planted sensitive strings.

Route templates come from a fixed mapping/adapter declaration (only the two
health paths in M0), never an arbitrary URL reflected as a template. Map unknown
methods/routes to bounded constants. Do not inspect undocumented Next internals
to obtain routing metadata.

Completion records give request rate/error/latency inputs. IDs belong in logs,
not metric labels. CloudWatch delivery, production retention, distributed trace
exporters, alerts and release load evidence remain deployment/hardening work.
No model, sandbox or audio payload exists in M0; telemetry policy prevents later
features from accidentally enabling broad payload logging. Safe settings errors
name keys and stable codes, never values or raw schema-validation exceptions.

## Engineering and verification plan

Implement small test-first slices in [engineering design](../engineering/eng_design.md):
bootstrap/config/boundaries with minimal liveness (US1), correlation/full health
and readiness (US2), migration/isolation
(US3), CI/container/negative controls (US4). Fake adapters let US2 fail/recover
deterministically; T016 proves real pool/deadline behavior against guarded
unmigrated storage, and US3 adds migration/schema-readiness integration. Production process tests
prove no-cache health, registry sharing, DB outage, secret-free build and drain.
T009/T010 use separate production startup and development HMR subprocess cases.
`tests/process/hmr.test.ts` launches `npm run dev` in an owned disposable copy on
an allocated port, changes a Next-watched health module (never the custom entrypoint) to return a different valid
UTC timestamp fixture through the existing liveness response, and observes that
acknowledgement across two reloads. Before baseline, test-owned instrumentation
acquires a fake resource through the actual shared registry and asserts exactly
one factory acquisition. After each reload it requests that resource again and
asserts the same handle identity, count still exactly one, stable process identity
and a single listener; no live DB or shipped test endpoints/log fields are needed.
Reload waits are 30 s each, development startup is at most 120 s, and finally
cleanup restores/removes only owned fixtures and terminates children/releases
ports within the 30 s shutdown budget. Production checks use the built server
separately. Phase-specific observed results are recorded in the foundation runbook; later
storage/release criteria remain open.

K-028's local schema, examples and fail-closed tests are included, plus an
operational handoff specifying separate environment resources, Secrets Manager
injection, task versus execution roles, rotation and redacted evidence. Actual
staging/production account/resource verification is gated on deployment choices
and authorization. Keep K-028 incomplete until that evidence exists; do not call
local configuration alone the completed environment baseline.

## Complexity and deferred gates

The custom entrypoint and process registry are necessary for explicit lifecycle
ownership, not a new web framework. Prefer plain SQL and one runtime application
over adding a second backend or ORM. No IaC/CDK choice, cloud provisioning,
region/network/sizing, live providers or hostile-code execution is authorized by
this plan. Remaining gates are reviewer signoff, exact dependency/image pinning
during implementation, actual tests/review/convergence and the documented
K-028 deployment evidence. No foundation planning contradiction remains.


## Phase 6 execution conventions

The multi-stage container retains Node 24.22.0/npm 11.19.1 in its builder,
compiles bootstrap, explicit migration entrypoint and runtime Next configuration,
and packages ordinary Next output plus production dependencies. Its pinned
Debian 13 distroless C++ runtime copies the same Node binary; it has no shell,
package manager or build/source credentials. Node runs as UID/GID 1000:1000 and
receives signals directly. A separate ignored container envfile resolves the
local development database through db:5432; host loopback settings are separate.
The optional app profile preserves existing development/test storage separation.

Required-stage orchestration is in scripts/verify-ci.ts; hosted CI invokes that
same aggregate with read-only permissions and immutable action pins. Security
archives are version/SHA-256 pinned and revalidated per use; scanner/download/DB
unavailability fails a stage. Gitleaks uses redacted ephemeral reports; Trivy
rejects HIGH/CRITICAL findings. Build-context canaries and all exported layers
are inspected. Negative controls require both nonzero outcomes and the expected
unit/lint/boundary diagnostics after clean baselines.

The clean journey allocates an owned test database and TCP proxy, bootstraps npm
without requiring preinstalled TypeScript tools, installs build dependencies,
builds, explicitly migrates, probes, interrupts only that proxy, verifies recovery
and sends SIGTERM. Separate instrumented process fixtures verify admitted-work
drain and forced-deadline nonzero exit. The bridge smoke uses the actual Compose
app profile, redirected only to owned test data on the existing test network.
All fixture changes and credentials stay outside the shipped runtime. Vitest's
two-worker limit bounds concurrent build pressure. Exact observed results and
pins belong in the foundation runbook; hosted CI is distinct evidence.

## Local testing and real-service transition — ADR-022

Use the existing real PostgreSQL/Compose harness and actual application image.
Database tests retain ownership/deadline/cleanup guards; an in-memory database
cannot replace migration, lock, transaction or readiness evidence. Future queue
and provider test tools are evaluated in their owning feature, not added here.
The [development matrix](../../../../development.md#local-and-real-service-test-matrix)
records current versus proposed coverage.

Application/domain logic calls existing narrow adapters. Where an emulator
supports the selected AWS SDK operations, the local adapter may use a deliberate
local endpoint; real runs use the real service endpoint and least-privilege
credentials. Preserve canonical event payloads, idempotency/outbox rules, finite
budgets and sanitized errors. The same contract scenarios exercise both targets,
with additional real-provider behavior checks. Endpoint replacement may expose
compatibility gaps and is never sufficient evidence by itself.

Future local adapter selection must reject test identities, fixture providers,
local endpoints and dummy credentials in staging/production, without silent
fallback. Current M0 still rejects unimplemented Clerk mode; this document does
not claim future adapter/config switches exist. E2B fixtures simulate coordinator
results only and never execute candidate code inside trusted workloads.

T034 external evidence is deferred to deployment readiness. T047/T048 may close
the local increment after T033; K-028 and release acceptance stay incomplete.
Real Clerk/OpenAI/audio/E2B smoke checks belong to the owning features' milestone
acceptance; AWS IAM/network/TLS/injection/rotation checks require actual staging.
No new contract interface, provider selection or IaC choice is introduced.
