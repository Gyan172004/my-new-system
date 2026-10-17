# System Master PRD — AI DSA Interview Practice Platform

**Status:** V1 planning baseline  
**Product scope:** Data structures and algorithms interview practice  
**Initial scale target:** Approximately 1,000 users

## 1. Problem

Candidates often prepare for DSA interviews by completing problem sheets such as Striver's Sheet or NeetCode. Solving a problem once does not prove that a candidate understands it: they may have memorized a pattern, struggle to explain their reasoning, miss edge cases, or fail when an interviewer changes a constraint.

The product should help candidates build transferable problem-solving skills—not merely collect accepted submissions.

## 2. Product goal

Provide a structured, turn-based voice-first AI interview practice experience, with visible transcripts and a text fallback, that evaluates both:

1. **Reasoning and communication:** Can the candidate explain the problem, examples, approach, correctness, trade-offs, and complexity?
2. **Transferable problem understanding:** Can the candidate recognize and solve related variants, improve an initial solution, and respond to follow-up questions?

The AI is the conversational interviewer. The product—not the model alone—owns the interview plan, state transitions, evidence, and evaluation rules.

## 3. Target users

### Primary: DSA interview candidates
Students and early-career engineers preparing for technical interviews using common DSA problem sheets.

### Secondary: Product/content operators
People who curate problem definitions, solution approaches, variants, test cases, follow-up questions, and reference answers.

## 4. Core user journey

1. Candidate opens a problem.
2. Interviewer greets the candidate and asks about self-reported experience (for example, LeetCode, Codeforces, or other practice history). These are context, not proof of ability.
3. Candidate reads the problem aloud, asks clarifying questions, and explains it in their own words.
4. The system checks the explanation against curated problem metadata and asks the candidate to explain the sample cases.
5. Candidate proposes an initial approach, normally starting with the simplest reasonable solution.
6. The system maps the explanation to curated approaches when possible. It checks for gaps and offers a bounded, ordered hint ladder only when needed.
7. If no known approach matches, the system evaluates the candidate's stated approach without forcing it into an incorrect reference category.
8. Candidate writes code in a restricted execution environment. Tests provide objective evidence about the implementation.
9. On a feasible failing case, the interviewer asks the candidate to trace their own code rather than immediately revealing the answer.
10. Candidate improves the solution, discusses alternative approaches, answers curated follow-ups and variants, and analyzes time and space complexity.
11. Candidate receives feedback on reasoning, communication, correctness, hint dependence, complexity analysis, and next areas to practice.

For V1 voice, the candidate records a bounded utterance, the backend transcribes it, and the transcript enters the same state-machine path as typed input. The interviewer response is shown as text and can be requested as generated speech. This is turn-based voice, not an always-open real-time audio session. Typed input remains available as a fallback.

The flow is a controlled state machine. The LLM may phrase questions naturally, but it cannot skip required stages or invent evaluation evidence.

### 4.1. Required frontend wireframe reference

On 2026-10-17, the owner selected
[Claude artifact c28f5a82-81e1-40aa-8527-bdc02d6c2186](https://claude.ai/code/artifact/c28f5a82-81e1-40aa-8527-bdc02d6c2186)
as the frontend wireframe to follow. Use its screen layouts, navigation,
component hierarchy and visual treatment as the required design baseline.
The full sharing link was supplied in
the conversation; access parameters are omitted from tracked documentation.

**Retained reference:** The owner supplied local HTML and Markdown exports after
the sharing link displayed “Page not found”. The complete HTML and companion
Markdown are now retained unchanged with a
[design review, feature map and 37 screen previews](frontend_wireframe/index.md).
The HTML renders all 37 frames; the Markdown contains the viewer legend only.
The reference establishes visual direction. Its mock retention copy, verdict
names and other behavior proposals require the documented reconciliation with
existing decisions before implementation.

Reconcile the inspected design with each owning feature's four canonical
documents and the existing API, session, execution and voice contracts. Surface
behavior or scope conflicts to the owner before implementation. TypeScript +
Next.js remains the selected application stack (ADR-021); candidate-facing UI
remains outside the Application Foundation feature's current scope.

## 5. Product principles

- **Learning over answer delivery:** Prefer prompts that help candidates discover errors themselves.
- **Deterministic control, flexible conversation:** Backend policy decides what happens next; the model handles language within explicit boundaries.
- **Evidence-based feedback:** Scores must link to observable statements, code results, or completed tasks.
- **Curated knowledge first:** Reference approaches, variants, test cases, and follow-ups are prepared and reviewed ahead of live sessions.
- **No false certainty:** If approach matching is uncertain, preserve uncertainty and ask a clarifying question.
- **Fairness:** A sandbox outage, model failure, or transcription issue must not be scored as a candidate failure.
- **Reproducibility:** Record the problem-pack, rubric, prompt/policy, and model versions used in a session.

## 6. V1 scope

### Included
- A curated DSA problem catalogue.
- Versioned problem definitions and metadata.
- Multiple reference approaches per problem, including complexity and correctness notes.
- Variants and curated follow-up questions with reference guidance.
- Sample-case understanding and candidate dry runs.
- Approach matching with confidence and an explicit unknown/ambiguous outcome.
- A bounded hint ladder.
- Code editor and sandboxed execution for selected languages.
- Test-case evaluation with candidate-facing, non-leaking feedback.
- Controlled progression from basic to improved/optimal approaches.
- Complexity analysis.
- Session history and personalized feedback.
- Turn-based voice capture, transcription, visible transcript, and generated speech output, with explicit consent and a text fallback.
- Code execution for Python, C++, and Java, using pinned toolchains.
- Operational metrics, basic administration, and content validation.

### Explicit non-goals for V1
- A general-purpose coding platform or public social network.
- Replacing human interviewers or guaranteeing interview success.
- Supporting every problem on LeetCode automatically.
- Scraping or republishing copyrighted solution text without rights review.
- Fully autonomous creation and publication of unreviewed problem packs.
- Candidate surveillance or claims that voice alone can reliably infer personality.
- A microservices-first architecture, Kubernetes by default, or multi-region active-active infrastructure.
- A guarantee that all conceivable problem variants are covered.

## 7. Content strategy and quality

For each problem, maintain a reviewed **Problem Pack** containing:
- canonical statement, constraints, examples, and clarifications;
- edge cases and invariants;
- reference approaches and their preconditions;
- complexity and correctness reasoning;
- known variants and the skill each variant tests;
- follow-up questions and answer rubrics;
- public/sample and hidden tests;
- hint ladder;
- metadata for approach matching.

LeetCode discussions and solution pages may be research inputs, not automatically trusted ground truth. Respect source terms, copyright, and licensing. Store original source links and provenance; prefer independently written summaries and explanations. A pack cannot be published until it passes structural, correctness, and review checks.

## 8. Feedback dimensions

V1 feedback should be separated into distinct dimensions:
- problem understanding;
- clarification quality;
- sample tracing;
- approach quality and correctness;
- reasoning and explanation clarity;
- use of hints;
- implementation correctness;
- edge-case handling;
- time and space complexity;
- variant transfer.

Do not collapse these into one opaque score. Show evidence and actionable next steps. Self-reported platform ratings are context only and must not directly determine a candidate's score.

## 9. Reliability and capacity goals

Initial planning assumptions (to validate with load tests):
- approximately 1,000 registered/supported users;
- design initially for roughly 100 simultaneous active interviews;
- begin with a modest bounded code-execution pool (around 10 concurrent executions) and scale based on queue latency;
- 99.5% monthly availability target for the core service;
- ordinary backend operations target P95 below 500 ms, excluding model calls and code execution;
- live AI turn latency target P95 below 5 seconds where provider/model behavior permits.

Model and sandbox latency are separate service indicators. Report degradation honestly rather than promising a hard latency that external providers cannot guarantee.

## 10. Success measures

- Interview sessions completed without technical failure.
- Candidate-reported usefulness and repeat practice.
- Improvement in rubric dimensions over repeated sessions.
- Variant performance compared with the original problem.
- Hint usage and successful recovery after a hint.
- Approach-matching precision and abstention quality.
- Model cost per completed session.
- Code-execution queue time and infrastructure failure rate.
- Content-pack correctness and review defect rate.

## 11. Safety, privacy, and trust

- Run candidate code as hostile, untrusted input in a separate sandbox boundary.
- Keep hidden expected outputs outside the candidate execution environment.
- Minimize personal data sent to model providers.
- Apply the selected retention and deletion policy: transcripts/session history 365 days; submitted source code 90 days; execution stdout/stderr 30 days; security/audit logs 90 days; raw candidate audio is not durably stored. The OpenAI audio endpoints process voice input/output; provider-side data controls must be checked before production.
- Record explicit consent notice version and acceptance before processing microphone audio.
- Do not expose API keys, internal prompts, reference answers, or hidden tests to the browser.
- Distinguish candidate-caused failures from infrastructure failures.
- Make AI-generated assessments explainable through evidence and versioned rubrics.

## 12. Selected V1 implementation decisions

These are the currently approved V1 defaults; changes must be recorded in the ADR register and propagated to affected contracts.

| Area | Selected baseline |
|---|---|
| Authentication | Clerk-managed authentication; backend verifies session tokens and maps provider subject to an internal stable user ID. Test identity adapter is development-only. |
| Voice | Turn-based candidate audio input, OpenAI transcription, visible text transcript, interviewer text plus separately generated speech. Text-only fallback remains available. No always-on/real-time voice in V1. |
| Programming languages | Python, C++, and Java. Runtime/compiler versions and image digests must be pinned before execution is enabled. |
| Text model provider | OpenAI only through the Model Gateway. `gpt-6.1-sol` for interview turns, approach assessment, hint wording/selection support, and feedback; `gpt-6-luna` for focused intent/stage classification; `gpt-6-astra` only as a measured, budget-gated escalation after evaluation. |
| Audio models | `gpt-transcribe` for bounded audio transcription; `gpt-4o-mini-tts` for interviewer speech output, behind the same provider gateway. These IDs must remain centrally configured and validated against current API availability. |
| Hosting/data | AWS ECS on Fargate for API and worker workloads; Amazon RDS for PostgreSQL; Amazon SQS Standard for async jobs with DLQs; AWS Secrets Manager, IAM task roles, and CloudWatch for operational controls. |
| Sandbox | Managed E2B sandbox for V1 behind the execution adapter; production exposure is gated on security, network isolation, provider data-processing, region, and cost checks. Do not run candidate code in the ECS API/worker process. |
| Retention | Session history/transcripts 365 days; source code 90 days; execution output 30 days; security/audit logs 90 days; raw candidate audio not durably stored; RDS automated backups initially 7 days, subject to restore testing. |
| Problem Pack governance | Author creates the draft; a different technical reviewer verifies correctness, alternatives, tests, hints, and provenance; only an authorized reviewer/publisher may publish. Authors cannot self-approve. |

## 13. V1 release gates

Before launch:
- core interview flow works end to end;
- state transitions are enforced server-side;
- problem packs are versioned and validated;
- code execution has resource limits and network isolation;
- hidden tests and expected outputs cannot be read by candidate code;
- model and execution calls have bounded timeouts;
- sessions survive refreshes and recover from transient failures;
- feedback is tied to evidence and versions;
- monitoring, backups, rollback, and incident runbooks are in place.

## 14. Key risks

| Risk | Mitigation |
|---|---|
| LLM deviates from the planned interview | Backend-owned state machine, structured outputs, allowed-action validation |
| Approach matcher forces a wrong classification | Confidence thresholds, abstention, candidate clarification, open-ended evaluation path |
| Hints reveal too much | Curated hint ladder, one hint at a time, record hint exposure |
| Incorrect or incomplete reference content | Provenance, automated validation, human review, versioned publication |
| Candidate code compromises infrastructure | Isolated execution plane, strict limits, no network, no production credentials |
| Model cost/latency grows unexpectedly | Budgets, usage tracking, bounded retries, rate limits, fallback policy |
| Candidate is penalized for infrastructure failure | Separate infrastructure error states and neutral scoring treatment |

## 15. Remaining implementation decisions and gates

The product-level V1 decisions are resolved in the decision register. The following details must be established during feature implementation rather than guessed:

- Select the AWS Region, VPC/subnet and egress pattern, public entry point, resource sizing, and infrastructure account boundaries.
- Verify E2B contract terms, data-processing/region controls, network restrictions, supported runtimes, quotas, and cost; candidate execution must remain disabled in production until security review passes.
- Pin Python, C++, and Java toolchains/runtime versions, image digests, and numerical CPU/memory/time/process/output limits.
- Benchmark the approved OpenAI model map against reviewed DSA conversation fixtures; configure per-operation timeout/token/cost limits and any `gpt-6-astra` escalation threshold.
- Finalize audio media types, maximum duration/size, consent wording/version, retries, and user-facing latency expectations.
- Implement deletion/expiry jobs, confirm provider-side data handling, and document how the seven-day backup window affects deletion from backups.
- Assign actual Problem Pack authors/reviewers/publishers and define a defect/escalation process.
- Validate capacity, availability targets, autoscaling, recovery-point objective (RPO), and recovery-time objective (RTO) with tests.

These are implementation/release gates, not unresolved choices about the selected V1 providers or product scope. See the Architecture Decision Records and `docs/02_build_sequencing/build_dependency_graph.md` for the controlling baseline.
