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
