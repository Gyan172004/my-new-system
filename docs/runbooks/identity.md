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
The scoped GitHub CLI can list the 48 prior foundation issues; ordinary sandbox
network access requires the tool's escalation mechanism. No credential values
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
