# Identity and Candidate Access — Verification Evidence

Canonical scope and task breakdown: [identity engineering](../03_features/identity_candidate_profile/specifications/engineering/eng_design.md). Kanban/CSV own status. This runbook records observations, not a second status board.

## Group 01 — Planning

Owner authorized autonomous Feature 2 execution, deduplicated issue mirroring,
per-group stack-skill review and commits. Google plus email verification codes and
the embedded Clerk component are selected. SDK/public-key strategy and initial
admission limits are documented in the technical specification.

Observed prerequisites: project skill installation check passed (50 registered
links, 561 files); verified Node24.22.0/npm11.19.1 toolchain is available under the
foundation temporary toolchain path. Current host Node20 is not used for feature
verification. Existing dedicated PostgreSQL development/test services are healthy.
The scoped GitHub CLI can list the 48 prior foundation issues; the initial sandbox
required an escalation for network access. The owner later enabled unrestricted
workspace/network access with no approval prompts. No credential values
were printed. New branch: feature/identity-candidate-access.

Planning review/checklist/issue-export and group verification results will be
recorded after observation. No runtime identity, provider or ownership acceptance
is established by this planning entry.

Planning loop observed: independent review found stale PEM/JWKS and tool-selection
wording plus a missing explicit sid bound. Those were reconciled and re-reviewed;
reviewer reported no residual blocker. All 11 functional requirements and 10
acceptance criteria map to 32 tasks T049–T080; seven groups each end with review
then commit. Requirements checklist 6/6, security 13/13, execution 12/12 reflect
requirements quality only. Actual pinned-Node `npm run test:contract` passed
11/11 (two files). No runtime/provider acceptance is implied.

Task export observed: 32 task issues T049–T080 created in the configured private
origin repository, issues #51–#82. The export read existing open/closed issues
first, continued global IDs after foundation T048, and wrote bodies from files.
No credential/candidate data was included. The 32 exact links are in canonical
engineering §9. Group review passed after resolving the reviewer findings.

## Group 02 — Configuration and dependencies

TDD observed on pinned Node24: `npm exec -- vitest run tests/unit/identity-config.test.ts`
failed 17/18 cases against the foundation's unavailable Clerk mode. Implemented
runtime-only required settings, exact issuer/origins, publishable-key/issuer match,
public RSA key/type/size validation, audience checks and production restrictions.
An empty-string non-leak assertion in the new test was corrected because every
string contains an empty substring. Focused config regressions then passed 85/85;
`npm run typecheck` passed. Exact Clerk7.9.17/backend3.25.0 and Playwright1.64.1,
coverage-v8 5.0.5, Clerk testing2.2.47 installed with lockfile; npm audit reported
zero vulnerabilities. npm reported the existing esbuild postinstall allowScripts
notice; no new script was approved by this install. No credentials were used.

Independent Group02 review found that Node parsed only the first PEM block and
retained appended material. A new generated-key regression failed before the fix;
validation now requires exactly one complete public PEM block. Focused config
suite passed 86/86 after the fix; reviewer independently reran and approved it.
The clean-environment `npm run build` passed without runtime/provider settings;
full unit suite before the added regression passed 149/149. `npm run lint` and
source architecture checker passed. Group02's final focused checks and group
commit provide the current evidence; later groups rerun impacted regressions.

## Group 03 verification

Token/admission suites first failed because their modules did not exist; this was a missing-module red, not an assertion failure. Implemented networkless official-SDK verification, fixed local test identities, bounded admission, safe caller mapping and allowlisted return paths. Actual ephemeral RSA signatures exercise validation; they do not prove live Clerk acceptance.

Independent T059 review reproduced the SDK PEM loader's RSA shape limitation. Two new config assertions failed before the fix; startup now requires RSA-2048/exponent 65537 and normalizes one public PEM block to SPKI. Both allowed input encodings pass actual SDK verification. `npm run test:unit` passed 198/198; independent config/auth/admission review passed 134/134 and approved T059. Typecheck/lint and source architecture checks are recorded with the scoped commit.

## Group 04 verification

`APP_ENV=test npx vitest run tests/integration/identity-storage.test.ts` initially failed the missing domain tables assertion and four module imports. Migrations/repositories add real users, owned sessions and events; no test-only resource tables or new HTTP endpoints. PostgreSQL SQLSTATE 2201B exposed its repetition-bound limit in the subject constraint; length and identifier validation are now separate. Rollback fault injection uses an owned-test-only NOT VALID constraint so pre-existing started events remain valid.

All 35 integration tests passed after reconciling the explicit three-revision chain in foundation migration/readiness tests. Added review cases then passed 6/6 storage tests: concurrent mapping, issuer separation, disabled status, foreign read/write denial, CAS races, event rollback, immutable pin, oversized/unknown context, stopped-pool/cancelled mapping failure and healthy recovery. Typecheck, lint and source boundaries passed. K-010/K-011 remain partial; only the internal created-to-intro storage transition is implemented.

## Group 05 verification

Inspected retained `02-sign-in.png` before implementing the embedded sign-in shell. Kept the dark terminal palette, compact header and centered form; Google/email verification-code choices remain provider settings, not hidden-button substitutes. Runtime-only private Clerk middleware key is now validated; only publishable key/presentation reach client props. The domain API remains outside browser middleware. Review corrected raw PEM reuse and enabled prebuilt `withSignUp` for new email users.

`npx playwright test` first failed two missing-page assertions, while health passed. A fixture account-switch test then failed at absent fixture; after implementation it reproduced an aborted-signal StrictMode replay bug (cancelled count 0). Controller renewal fixes it. Final actual custom-server/Next-dev browser run passed 4/4 in 53.2s, proving disabled/error presentation, keyboard focus, narrow viewport, public health, initial Alice load, switch cancellation/late-response exclusion, Bob load and sign-out clearing. Fixture routes exist only in an owned temporary project. Test server cleanup uses graceful SIGTERM and checks owned child cleanup.

`npm run test:unit`: 200/200. `npm run verify:architecture`: source [] and 34/34 fixtures, including browser SDK allowance and backend SDK/private-env denial. `npm run typecheck` and lint passed. Clean `env -i` production build passed with no provider/database keys. Independent T069 approved. Full next-dev-loop was unavailable because agent-browser is absent; no claim of that skill's two-view verification. Actual Playwright browser verification was run. Real Clerk method configuration and sign-in remain Group07 acceptance.

## Group 06 verification

The trusted-source/cancellation assertion first failed because the foundation
request context lacked these fields. The process suite first failed its build
with a missing `identity-http` module (two tests skipped, not assertion passes).
After integration, actual production-server privacy tests passed 2/2: invalid
credentials never enter private work; safe failures share server request IDs;
verified callers map stably; caller-supplied source/user/request headers are
ignored; token/cookie/query/subject canaries never reach application streams.

Review required the combined request/socket signal to reach private work. A new
real-database regression failed with an undefined callback signal, then passed
after propagation and pre/post-callback cancellation checks. It verifies the
signal is aborted and active SQL ends within the foundation's existing bound;
a destroyed client does not promise instantaneous PostgreSQL query termination.

`npm run coverage:identity` passed 211/211 tests. The included server/session
slice measures statements 95.17%, branches 93.71%, functions 97.87%, lines 98.08%;
gates remain 90% statements/functions/lines and 85% branches. The report also
includes UI/browser adapter files unexecuted by Node, yielding the honest combined
Node report of 81.27% statements, 84.10% branches, 79.31% functions, 85.41% lines.
These are not browser coverage percentages. Actual browser acceptance is separate:
fresh `npm run test:e2e` passed 4/4 in 1.2 minutes.

The first full `APP_ENV=test npm test` run passed 306/308. Foundation verification
still assumed one migration; it now checks/reports the explicit accepted three-
revision chain. A lint-control recheck identified an unused initializer in that
verification fix; the initializer was removed. Focused foundation journey passed
1/1 and all CI failure-control cases passed 4/4. Fresh complete rerun passed **34/34 files, 308/308 tests** in 333.47s. Format, lint, typecheck and diff whitespace checks passed.

`npm audit --audit-level=high` found zero vulnerabilities. Secret scan passed.
Image scan found zero HIGH/CRITICAL vulnerabilities in the rebuilt non-root image
`sha256:d8b930c4cf6a466886169f53ca7265b5481ef46c005343de33f6e837c2860e8e`.
An initial parallel filesystem scan was unavailable; sequential retry passed
with no findings. Cache contention is suspected, not established as root cause;
no production change was claimed for it. CI invokes these scans sequentially.
Independent T074 code review approved, conditional on observed successful reruns.

The final browser test server released port 3102 (explicit bind check passed). Group06 reruns satisfy T074's conditional review approval.

## Group 08 — Convergence remediation

Spec Kit convergence found four gaps: real SDK middleware returned 503, provider-owner acceptance was unavailable, session validation contradicted the context contract, and the named wireframe fonts were not loaded. Reconciled tasks T081–T086 were analyzed and exported as derived issues #83–#88. The export now matches only leading task IDs in issue titles, preventing prerequisite mentions from corrupting references; a rerun observed 0 created and 38 deduplicated.

The actual pinned-SDK middleware regression first failed 503 versus 200, then passed after removing explicit dynamic secret-key propagation. The single startup-validated server environment key remains in use. Three new real-storage regressions failed before fixing language/Unicode/UTF-8 validation; the storage suite then passed 9/9. The initial storage invocation lacked APP_ENV=test and failed its safety gate (9 skipped); this was corrected before the observed assertion failures. The actual browser font test failed because no face was loaded; local assets are unmodified IBM WOFF2 files with commit, hashes and OFL license in `src/app/fonts/README.md`.

## Real development-provider observations and recovery

An isolated accountless Clerk development instance was created with pinned CLI4.0.0 in a new disposable scaffold. Two passwordless Clerk test users were created for Alice/Bob smoke testing; these use development-only test email addresses, not real email delivery. The real JWKS contained an RSA-2048 RS256 key. Doctor passed execution/auth/environment checks; accountless application/instance ownership remains a warning. No existing environment files were overwritten.

The CLI refused an authentication-method dry run: `auth_email` is outside the accountless configuration subset and requires a claimed application/login. No unsupported change was applied. Current UI shows Google and no GitHub/password field; the tested users offer email_code without password. This does not prove every selected method restriction or real Google consent. T076/T083 and AC-01 remain unmet until account-owner acceptance.

A secret-safe opt-in smoke in the ignored local provider directory ran actual custom Next development server + Chromium, Clerk testing token and two real email-code sign-ins. Both rejected an incorrect code and accepted the provider test code. Real issued tokens passed the application HTTP boundary, mapped stably through real PostgreSQL, and produced different users. Foreign reads/writes against the real session service were denied. Application streams contained neither the private server key nor issued tokens. This validates available development behavior; it does not substitute for Google consent, actual email delivery or production readiness.

Private recovery material is under the ignored `.local/identity-provider/` directory (directory700, credential files600). `provider.env` contains development-only runtime settings; `claim-scaffold/` preserves the new accountless instance breadcrumb for later owner claim. These files and logs must never be pasted into issues, commits or chat. From that scaffold, the account owner runs `npx -y clerk@4.0.0 auth login` in their host terminal and completes browser login. The preserved `.clerk/keyless.json` breadcrumb lets login claim the existing application. Then `npx -y clerk@4.0.0 open dashboard` opens its settings. Configure only Google and email verification codes and rerun acceptance. CLI4.0.0 has no `claim` subcommand; command help was verified during the handoff follow-up. Do not initialize another instance or overwrite existing provider files. A CLI authentication-method restriction is an external account-control limitation, not a permission prompt from this agent.

Convergence verification: `APP_ENV=test npm run test:e2e` passed 5/5, including local font loading. `npm run coverage:identity` passed 215/215. Server/session scope: statements 220/231 (95.24%), branches 164/175 (93.71%), functions 49/50 (98.00%), lines 208/212 (98.11%). Combined Node report including visible UI files: statements84.81%, branches85.64%, functions81.96%, lines88.88%; these are not browser coverage. Typecheck and lint passed. Independent T085 review found no actionable blocker, conditional on ongoing full verification.

Extended live-provider smoke passed: both users refreshed actual issued tokens without changing their internal mapping. Sign-out cleared the browser session; previously issued tokens remained valid only until their signed expiry, matching the documented stateless verifier window. The final real issued token returned 401 after actual expiry (no clock mocking). Application log privacy check passed again. Google consent, owner configuration, expired email-code acceptance and real email delivery remain unverified. The test users remain in the isolated development instance; no production identity was created.

Observed reproducible commands use the pinned Node24 PATH from the development guide: `APP_ENV=test npm test`, `npm run coverage:identity`, `APP_ENV=test npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run verify:architecture`, `npm run scan:secrets`, `npm run container:build`, `npm run scan:image`. The credential-free build was run under `env -i` with only pinned PATH, a temporary HOME and NEXT_TELEMETRY_DISABLED. The opt-in actual provider smoke is retained privately as `.local/identity-provider/verify-live.mjs`; run `node --import tsx .local/identity-provider/verify-live.mjs` from the root with the pinned PATH after reviewing the isolated-instance settings. It allocates/disposes only owned test databases and temporary app copies, adds its fixture endpoint only to the temporary copy, uses port3104, and prints only authored outcome metadata. Its private log must not be copied verbatim. It never establishes Google consent or selected-method configuration by itself.

Credential-free production build passed after local-font integration. Architecture check reported no source violations and 34/34 fixture tests passed. Secret scan, filesystem HIGH/CRITICAL scan and image HIGH/CRITICAL scan passed. Rebuilt image: `sha256:7cbab0d89a3af3f39ac31530e96ebf1f215cc10cc49d715176006fb32af65273`. Explicit bind checks confirmed both browser3102 and provider3104 ports were released. Final permission checks verified owner-only directory access (2700, including inherited setgid) and private files600. The initial equality check incorrectly treated the setgid flag as excess access; masking the access bits confirmed700. No credential content was printed.

Fresh final full regression: `APP_ENV=test npm test` passed **35/35 files, 312/312 tests** in371.68s. The allowlisted database-error log was expected outage coverage; no test failed or skipped. Format/lint/typecheck passed. CRLF-aware whitespace checks passed for authored files; the vendored OFL license is preserved verbatim, including its upstream trailing space. Independent T085/T079 approvals are satisfied by these observed reruns; no local actionable finding remains. External T076/T083 acceptance remains open.

## Final local handoff

Group08 remediation was committed as `153906a` using the required structured message. Final Spec Kit convergence rechecked 11 functional requirements, 10 acceptance criteria, 10 plan constraints and five constitution principles. The three local findings are resolved; the existing HIGH provider acceptance gap remains tracked by T076/T083. No duplicate convergence tasks were added and no complete-feature label was issued. All other local implementation, verification, review and handoff work is complete.

K-012 remains In Progress and K-010/K-011 retain their full-feature Backlog status; the CSV agrees. The 38 derived issue references remain #51–#88 and their bodies have been reconciled (25 updated,13 unchanged). No push, merge, deployment or production-provider acceptance is implied by local commits. Existing unrelated owner edits and downloaded skill sources were preserved.

## Claimed development instance — follow-up

The owner completed browser CLI login. Host doctor now passes logged-in/authentication/project-linked/application-reachable checks (instance-ID and shell-completion warnings remain). The scaffold and runtime development keys were compared programmatically and match; no new application or replacement keys were created. Claimed-instance schema/config pull now succeeds.

Direct settings inspection found passwords enabled despite the earlier passwordless test users. After a successful dry run, a development-only partial config patch disabled both password enabled/required flags and explicitly retained required verified email with email_code-only sign-in/verification, Google sign-in enabled and GitHub disabled. A fresh config pull asserted all five selected-method predicates successfully. No production instance or OAuth credentials were changed.

A temporary manual acceptance app is running on localhost3104 using an owned migrated test database and copied application. Its verification panel/API exist only in that temporary copy; no production endpoint was added. The owner can perform Google/real-email sign-in and click Verify signed-in account to exercise the actual server token boundary and mapping. Remaining acceptance is real Google consent, real email delivery/repeat sign-in and expired email-code rejection. T076/T083 and K-012 remain open until observed.

The post-claim real-provider smoke on separate localhost3105 passed for both test users: wrong-code rejection, email-code completion, stable server mapping, token refresh, browser sign-out, signed-token expiry, persisted cross-user denial and application log privacy. The smoke's historical selectedMethodsConfigured flag does not inspect settings; the separate fresh claimed-instance CLI assertions above establish configuration. A fresh no-testing-token browser check confirmed the manual sign-in page serves200 and the Google control is visible after hydration, with no password field. The expired-code test has been started against a separate browser context and remains pending actual provider expiration; no result is claimed yet.

## Owner sign-in and expired-code observations

The owner reported that both real Google and real-email sign-in worked. A scoped Clerk user-list inspection found one Google-linked account in addition to the two development fixture users; no email addresses or provider subjects were printed. Repeat email-code sign-in in two fresh browser contexts also passed with the same internal application user ID.

The real-provider expired email-code check waited for the provider-reported expiry (approximately602 seconds), then attempted the development test code without advancing clocks. Clerk returned `verification_expired`, verification status expired, no completed sign-in and no active session. An unauthenticated application verification request returned401. This is actual provider expiration using a test address, not real email delivery; the latter is owner-reported above.

Application mapping confirmation for the owner's account remains pending. A read-only check of the owned manual-acceptance database initially found no mappings; the automated fixture then successfully exercised the actual browser verification panel and HTTP boundary (200), creating only its fixture mapping. No Google-linked owner mapping was observed. The owner was asked to open the home page while signed in and confirm Verified by server. The temporary panel now automatically verifies on signed-in mount, and the manual app remains available on localhost3104. This is a test-copy-only change. T076/T083 and K-012 remain open for this final evidence; the existing production code is unchanged.

## Final owner acceptance and convergence

The owner supplied a screenshot showing Verified by server on the isolated application home page. A fresh read-only owned-database check returned two active Clerk mappings (one fixture and the owner), unique subjects and googleBackedMapping=true. No email, provider subject, token or internal ID is reproduced here. This closes the last mapping evidence gap.

Final convergence found no remaining Feature 2 implementation/acceptance gap after checking11 requirements,10 acceptance criteria,10 plan constraints and five constitution principles. No duplicate tasks or empty convergence phase was added. T076/T083 are now complete; all38 feature tasks are satisfied, and Kanban/CSV move K-012 to Done. Later session consumers, full K-010/K-011 scope, hosted CI and cloud/production release acceptance remain separate. The final changes are evidence/status documentation; application code and its observed312-test/215-coverage/five-browser baseline are unchanged.

Independent final review approved closure and verified all38 canonical/working task marks, Kanban/CSV alignment and25 local documentation links. Fresh issue-state inspection found38 feature mirrors closed and none open. The acceptance harness exited successfully after disposing its owned test database; its temporary project was removed and bind checks confirmed ports3104/3105 released. Clerk accounts and private recovery material were retained. Fresh format and secret scans passed for this evidence-only handoff.

## GitHub issue/PR audit — 2026-10-20

All 38 identity task issues were closed but lacked individual completion comments and PR links. Each now has a task-specific evidence comment, reviewed commit and PR89 link. PR89 references all 38 issues and remains stacked on foundation PR49. Because GitHub only interprets closing keywords for a default-branch target, its explicit issue comments/references provide traceability until retargeting. A read-only review-thread audit found no unresolved threads on either PR.

Hosted Foundation CI also succeeded for identity implementation head 3cc5df31b4e71ac9e55e76228a323f992d53ac7d, including its [required checks/scans/container/negative-control stage](https://github.com/Gyan172004/my-new-system/actions/runs/39383049677/job/118496336003). This observed implementation-head result is separate from any rerun triggered by the evidence-only handoff commit. All 86 task issues across both features have completion/deferment evidence;85 completed issues are closed and T034 remains deferred/open. Canonical K-006 status is reconciled from hosted foundation evidence; K-028 remains open.
