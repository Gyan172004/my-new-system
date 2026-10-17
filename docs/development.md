# Local development

Use this guide from the repository root. Application Foundation is being built
in reviewed increments; runtime, database and container commands arrive in later
phases. No provider account is needed for this tooling/configuration increment.

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

Exact application dependencies: Next 16.4.2, React/React DOM 19.3.1, Zod 4.6.7.
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

Runtime settings and tested commands are documented below when their
implementation passes. `npm run` lists only implemented commands. Installation,
formatting, linting, type checking and unit tests never need database/provider
credentials. No production startup/build/database command is advertised yet.

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
npm test
npm audit --audit-level=high
```

`DATABASE_URL` must name a PostgreSQL host/database. Staging/production require
`sslmode=verify-full` and the database driver must preserve certificate validation.
Never disable verification to fix a connection error. `APP_ENV` is mandatory:
`development`, `staging`, `production` or `test`; it is separate from `NODE_ENV`.
Missing unused Clerk/OpenAI/E2B credentials are allowed. `IDENTITY_ADAPTER`
defaults to `disabled`; `test` is restricted to development/test and the
unimplemented `clerk` mode fails closed.

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
`parseBuildConfig` deliberately excludes runtime secrets; the actual Next build
will be added and verified with the runtime composition phase.

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
