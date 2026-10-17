# Frontend wireframe — DSA Interview Canvas

Owner-selected frontend reference, retained on 2026-10-17. Implement the frontend
to follow this canvas's visual system and screen composition. Use the existing
TypeScript + Next.js baseline. This intake does not start feature implementation.

## Retained reference

- [Original HTML canvas](source.html): the complete interactive design viewer;
  open locally in a browser. Lane buttons, pan, zoom, click-to-focus and Escape
  belong to the design viewer, not the application being specified.
- [Downloaded Markdown](source.md): the canvas legend and viewer instructions;
  it does not contain the 37 screen definitions.
- [Canvas overview](previews/canvas-overview.png) and individual previews below.
- [Frame inventory](frame_inventory.json): rendered text, annotations, dimensions,
  font-loading evidence and precise review coverage.
- [Provenance](provenance.json): original filenames, byte counts and SHA-256 hashes.

Both supplied files are retained byte-for-byte. The original downloads remain
unchanged. The earlier Claude sharing URL displayed “Page not found”; the local
export is now the reproducible reference. Access parameters are not retained.

The canvas controls layout and visual direction. Its illustrative people,
metrics, dates, scores, versions and API annotations are mock data. Canonical
requirements, ADRs and interface contracts continue to govern behavior and data.
Apply the reconciliations below when implementing; preserve these source files
as provenance rather than silently editing their mock copy.

## Visual baseline to follow

| Element | Reference |
| --- | --- |
| Overall direction | Dark terminal style, warm candidate emphasis, restrained borders and compact controls |
| Backgrounds | `--void #090D15`, `--deep #0E1420`, `--sunk #0B111C` |
| Raised surfaces | `--raised #1A2332`, `--raised2 #222C3D` |
| Text | `--parch #E8DFD2`, `--mute #8A93A4`, `--dim #6B7588` |
| Interviewer / structure | `--cool #7FA8D8` |
| Candidate turn / attention | `--warm #D99A4E` |
| Candidate evidence | Pass `--ok #7FA87F`; fail `--fail #C8615A` |
| Infrastructure failure | Neutral `--infra #8A8F9E`; never candidate-failure red or a scoring penalty |
| Typography | IBM Plex Sans for prose; IBM Plex Mono for navigation, labels, code and metadata |
| Application shell | Compact 38 px top bar; 196 px sidebar on candidate/admin screens |
| Session composition | Problem and transcript on the left (46%); editor and output on the right; turn controls in the footer |
| Feedback | Separate evidence-linked dimensions, next-practice guidance and version metadata |
| Content administration | Pack list, structured editor, independent review and explicit publish gates |

Most frames are 1180 × 740; the created-session frame is 1180 × 700 and failure
dialogs are 760 × 440. These are reference canvas dimensions, not fixed viewport
requirements for the production app. Mobile layouts are not supplied. Resolve
responsive layout, text contrast/size, focus, keyboard behavior and accessible
control semantics in the owning feature designs while preserving this direction.
The prototype's styled spans are visual controls, not working application inputs.

Google Fonts is the HTML's external rendering dependency. The browser loaded the
required Latin IBM Plex faces during capture; offline viewing may use fallbacks.
Font packaging and asset policy belong to the frontend engineering design.

## Feature ownership

This is a screen-to-feature reference map, not a new backlog or status board.
Use [feature order](../../02_build_sequencing/feature_implementation_order.md),
the dependency graph and canonical Kanban for delivery readiness. No task is
completed by the presence of a mock screen.

| Canvas group | Frames | Owning feature documents |
| --- | --- | --- |
| Public | 2 | [Identity](../../03_features/identity_candidate_profile/README.md), [catalogue](../../03_features/problem_catalogue/README.md) and their frontend entry flow |
| Candidate core | 8 | Identity, catalogue, [session](../../03_features/interview_session/README.md), [feedback/history](../../03_features/feedback_history/README.md), [voice](../../03_features/voice_interaction_transcription/README.md) |
| Interview session | 16 | Session, [orchestration](../../03_features/interview_orchestration/README.md), [approach/hints](../../03_features/approach_assessment_hint_management/README.md), [execution](../../03_features/code_execution/README.md), [follow-ups](../../03_features/followups_variants/README.md), feedback and voice |
| System and failure states | 7 | Session lifecycle plus the failing dependency's owning feature; preserve stage and scoring neutrality |
| Admin and content operations | 4 | [Content administration](../../03_features/content_admin_review/README.md), catalogue and [operational hardening](../../03_features/operational_hardening/README.md) |

[Application Foundation](../../03_features/application_foundation/README.md)
continues to cover platform/backend foundation only. This reference does not
add candidate pages to that feature or bypass its planning/release gates.

## Required reconciliation with existing decisions

| Reference detail | Implementation direction and controlling source |
| --- | --- |
| Mic consent/settings show 180-day transcripts and code, reports retained until deleted, and audit events described as consent-only | Use ADR-019: transcripts/session history 365 days, source 90 days, execution output 30 days, audit/security logs 90 days. Do not introduce indefinite report retention or narrow the existing audit scope from mock copy. See [ADR register](../05_architecture_decision_records.md) and [feedback/history](../../03_features/feedback_history/README.md). |
| Audio copy says “never stored”; mic-check waveform appears before acceptance | State application non-persistence accurately without promising provider-side zero retention. Explicit versioned consent precedes recording, including any real mic check. Retain text fallback; provider processing and notice wording follow the [voice contract](../../03_features/voice_interaction_transcription/specifications/technical/voice_interaction_contract.md). |
| Sandbox/operations mock calls the verdict `infrastructure_failure` | Keep the neutral visual label. Wire enum remains `infrastructure_error` in the [execution contract](../../03_features/code_execution/specifications/technical/execution_contract.md) and [event schema](../../../contracts/events/async_schemas.json). A label does not rename an interface enum. Preserve operational failure evidence rather than deleting the failed execution record. |
| Feedback mentions “Hidden case 12”; output/feedback samples include specific case details | Never expose hidden inputs, expected outputs or detailed hidden-case identifiers. Candidate UI uses public-case details and permitted safe aggregates/categories only; see execution contract §5. |
| Created/problem copy suggests pinning occurs on Start, or nothing is recorded before Start | A session record and immutable pack pin already exist at creation; Start commits the initial turn. Describe that lifecycle accurately; see [session state machine](../../03_features/interview_session/specifications/technical/session_state_machine.md). |
| Shared footer shows Hint/Run/Submit throughout the stage sequence | Keep the shared layout, but enable actions only from backend `allowedActions` and the active stage/lifecycle. Conditional stages remain conditional. The 16 stage IDs/order match the canonical stage table; they are not a client-controlled linear wizard. |
| API annotations imply submission, feedback, replay, settings and admin interfaces | Treat these as feature-design inputs. Use [canonical OpenAPI](../../../contracts/api/v1_openapi.yaml); execution REST interfaces are explicitly deferred there. Reconcile every affected producer, consumer and contract test before adding interfaces. UI paths are not API contracts. |
| Queue saturation says both “429” and “will run”; shows 14 waiting / 40 seconds | Distinguish an accepted queued execution from retryable saturation. Derive queue position, estimates, retry counts and capacity from accepted backend policy/observations; mock numbers do not create guarantees. |
| Matching uses a 0.75 confidence threshold and exposes reference-match details | Calibrate thresholds on reviewed evaluations per [LLM interaction policy](../../03_features/interview_orchestration/specifications/technical/llm_interaction_policy.md). Define the safe candidate-visible projection; never expose private approach/hint material just because it appears in a mock. |
| Restatement hides the statement with “Show anyway — noted in feedback”; scores use illustrative 0–100 values | Define accessibility, evidence capture and rubric behavior in feature specification/clarification. The mock does not authorize a score penalty or calibrated scoring formula. |
| Runtime versions, language pinned on first run, elapsed-time pause behavior, data export/deletion and auth provider buttons | Carry these UX proposals into owning feature planning. Pin runtime versions through ADR-018 and execution validation; confirm lifecycle/privacy semantics and enabled Clerk providers. No new production policy is selected by sample text. |

These are reconciliations with accepted decisions or explicitly identified design
inputs. No ADR, interface or release scope is changed by this reference intake.
If the owner wants a different product/architecture policy, record that decision
through the existing process before relying on it.

## Screen previews

The routes shown below are wireframe labels. Their presence does not establish
implemented frontend routes or backend endpoints.

### Public

| # | Frame | Route or stage label | Preview |
| --- | --- | --- | --- |
| 01 | `Landing` | `/` | [PNG](previews/01-landing.png) |
| 02 | `Sign in` | `/sign-in` | [PNG](previews/02-sign-in.png) |

### Candidate core

| # | Frame | Route or stage label | Preview |
| --- | --- | --- | --- |
| 03 | `Home` | `/` | [PNG](previews/03-home.png) |
| 04 | `Problems` | `/problems` | [PNG](previews/04-problems.png) |
| 05 | `Problem` | `/problems/two-sum` | [PNG](previews/05-problem.png) |
| 06 | `Mic check & consent` | `modal` | [PNG](previews/06-mic-check-consent.png) |
| 07 | `Feedback report` | `/sessions/{id}/feedback` | [PNG](previews/07-feedback-report.png) |
| 08 | `History` | `/sessions` | [PNG](previews/08-history.png) |
| 09 | `Replay` | `/sessions/{id}/replay` | [PNG](previews/09-replay.png) |
| 10 | `Voice & privacy` | `/settings/voice` | [PNG](previews/10-voice-privacy.png) |

### Interview session

| # | Frame | Route or stage label | Preview |
| --- | --- | --- | --- |
| 11 | `created` | `1/16` | [PNG](previews/11-created.png) |
| 12 | `intro` | `2/16` | [PNG](previews/12-intro.png) |
| 13 | `experience_context` | `3/16` | [PNG](previews/13-experience-context.png) |
| 14 | `problem_read_and_clarify` | `4/16` | [PNG](previews/14-problem-read-and-clarify.png) |
| 15 | `problem_restatement` | `5/16` | [PNG](previews/15-problem-restatement.png) |
| 16 | `sample_trace` | `6/16` | [PNG](previews/16-sample-trace.png) |
| 17 | `initial_approach` | `7/16` | [PNG](previews/17-initial-approach.png) |
| 18 | `approach_clarification` | `8/16` | [PNG](previews/18-approach-clarification.png) |
| 19 | `hints` | `9/16` | [PNG](previews/19-hints.png) |
| 20 | `code` | `10/16` | [PNG](previews/20-code.png) |
| 21 | `test_and_debug` | `11/16` | [PNG](previews/21-test-and-debug.png) |
| 22 | `improve_approach` | `12/16` | [PNG](previews/22-improve-approach.png) |
| 23 | `variants_and_followups` | `13/16` | [PNG](previews/23-variants-and-followups.png) |
| 24 | `complexity_analysis` | `14/16` | [PNG](previews/24-complexity-analysis.png) |
| 25 | `feedback` | `15/16` | [PNG](previews/25-feedback.png) |
| 26 | `completed` | `16/16` | [PNG](previews/26-completed.png) |

### System & failure states

| # | Frame | Route or stage label | Preview |
| --- | --- | --- | --- |
| 27 | `paused` | `State overlay` | [PNG](previews/27-paused.png) |
| 28 | `recoverable_error` | `State overlay` | [PNG](previews/28-recoverable-error.png) |
| 29 | `sandbox_failure` | `State overlay` | [PNG](previews/29-sandbox-failure.png) |
| 30 | `queue_saturation` | `State overlay` | [PNG](previews/30-queue-saturation.png) |
| 31 | `transcription_failed` | `State overlay` | [PNG](previews/31-transcription-failed.png) |
| 32 | `consent_revoked` | `State overlay` | [PNG](previews/32-consent-revoked.png) |
| 33 | `not_found` | `State overlay` | [PNG](previews/33-not-found.png) |

### Admin & content ops

| # | Frame | Route or stage label | Preview |
| --- | --- | --- | --- |
| 34 | `Packs` | `/admin/packs` | [PNG](previews/34-packs.png) |
| 35 | `Pack editor` | `/admin/packs/{id}` | [PNG](previews/35-pack-editor.png) |
| 36 | `Review & publish` | `/admin/review` | [PNG](previews/36-review-publish.png) |
| 37 | `Operations` | `/admin/health` | [PNG](previews/37-operations.png) |


## Verification and limits

Both original source hashes were checked after copying. Headless Chrome
145.0.7632.159 rendered 37 frames in five lanes with zero browser console errors.
All 37 PNG files decoded successfully and matched native dimensions; all 16
stage IDs and their order were compared with the canonical state-machine table.
Ten representative screens were visually inspected: landing, home, consent,
feedback, privacy, code, sandbox failure, queue saturation, review/publish and
operations. The inventory records the exact preview names and font evidence.

This verifies reference intake/rendering and the stated comparisons. It does not
establish interactive product behavior, mobile fidelity, accessibility compliance,
backend integrations or completed feature acceptance. No product tests were run
for this documentation/asset intake. Kanban/CSV and canonical API/event contracts
remain unchanged.
