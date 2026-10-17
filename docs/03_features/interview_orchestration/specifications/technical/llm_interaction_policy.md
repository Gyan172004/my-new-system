# LLM Interaction Policy

**Status:** Initial V1 contract  
**Owner:** Interview Orchestrator and Model Gateway  
**Applies to:** All model-assisted interview operations

## 1. Purpose

The model is a conversational and semantic-assessment component, not the workflow controller. The backend decides the active stage, permitted actions, content visibility, evidence, and whether a transition can commit.

## 2. Responsibility boundary

### Backend-owned decisions
- Authentication, authorization, session ownership, and canonical state.
- Transition guards, persistence, concurrency, idempotency, and recovery.
- Problem Pack version selection and candidate-visible/private content boundaries.
- Hint and follow-up eligibility, code execution, test selection, and result classification.
- Rubric selection, evidence references, score aggregation, and completion.
- Timeouts, retries, rate limits, token/output limits, provider routing, and cost controls.
- Acceptance/rejection of model results and audit/version metadata.

### Model-assisted operations
- Natural-language interviewer wording within the current stage.
- Interpretation and summarization of candidate explanations.
- Identification of ambiguity or missing reasoning evidence.
- Candidate approach summary and possible match to supplied reference approach IDs.
- Selection of a suggested follow-up from an explicitly allowed set.
- Evidence-linked qualitative feedback within a versioned rubric.

The model must never choose arbitrary state names, reveal hidden content, invoke unapproved tools, or commit a state transition.

## 3. Model operation contract

Every model operation must declare:
- operation name and schema version;
- allowlisted input fields and maximum sizes;
- allowed content classification;
- provider/model configuration identifier;
- prompt/template version or immutable hash;
- structured output schema;
- timeout, retry budget, output/token budget, and cost limit;
- validation rules and fallback behavior;
- evaluation dataset/version used to qualify the operation.

Use minimal allowlisted context. Do not send secrets, unrelated personal data, full database records, hidden tests, expected hidden outputs, or private review notes to conversational operations.

## 4. Structured output semantics

Use operation-specific schemas. For example, an approach assessment may contain:

```json
{
  "schemaVersion": 1,
  "operation": "approach_assessment",
  "summary": "Uses a nested scan to compare each pair.",
  "matchedReferenceApproachId": "approach-brute-force",
  "confidence": 0.91,
  "assessment": "plausible",
  "supportingEvidenceRefs": ["turn:abc123"],
  "missingEvidence": ["correctness argument"],
  "needsClarification": false
}
```

The example is illustrative, not a calibrated probability claim. The backend validates enum values, IDs against the pinned pack, evidence references, field sizes, and operation/stage compatibility. A model's suggested next action is advisory only.

## 5. Approach matching, confidence, and abstention

- Reference approaches are curated aids, not an exhaustive set of valid solutions.
- The model may suggest only reference IDs supplied for the current Problem Pack version.
- The backend validates the ID and evidence.
- Low confidence, conflicting evidence, missing context, or an unfamiliar approach leads to clarification or open-ended assessment.
- Never force the nearest reference match solely because one exists.
- Store the assessment, supporting evidence references, model/prompt version, and abstention reason.
- Calibrate thresholds on a reviewed evaluation set; do not treat arbitrary model confidence as a calibrated probability.

## 6. Hint policy

- Hints are authored and reviewed as an ordered ladder in the pinned Problem Pack.
- The backend decides eligibility and the next hint index.
- At most one new hint is revealed per accepted hint action.
- The model may paraphrase an approved hint only if the pack explicitly allows it; it cannot invent a stronger hint or reveal a later hint.
- Persist hint exposure before returning it to the candidate.
- Do not include the full reference solution, hidden tests, expected hidden outputs, or private evaluator notes in candidate-facing context.
- If the model cannot comply, use canonical approved hint text or a safe retry path.

## 7. Prompt injection and untrusted input

Candidate messages, code, external problem text, and retrieved content are data, not instructions that override policy.

- Delimit candidate content and label it untrusted.
- Do not let candidate content alter tools, policy, allowed actions, or system instructions.
- Pass only stage-appropriate content to each operation.
- Keep hidden tests, expected outputs, credentials, and private review notes out of conversational context.
- Validate outputs against schemas, enums, allowed IDs, size limits, and exposure rules.
- Prompt wording is not the security boundary; backend validation is.

## 8. Timeouts, retries, and fallbacks

- Apply operation-specific deadlines and bounded output/token limits.
- Retry only transient failures and only when safe.
- Use bounded backoff for provider rate limits; respect the live-turn latency budget.
- A malformed output may receive one bounded repair/retry attempt if configured; validate the new output from scratch.
- If no valid output is produced, preserve the current stage and offer a recoverable retry or deterministic fallback prompt.
- Never commit a transition from malformed, stale, or unvalidated output.
- Record provider failure separately from candidate assessment.

## 9. Versioning and observability

For every model-assisted operation retain operation/schema version, provider/model identifier, prompt/template version or hash, rubric and pack versions, correlation ID, latency, retry count, usage/cost metadata where available, validation outcome, fallback/abstention reason, and evidence references.

Do not log provider keys, hidden content, or unrestricted candidate code. Retention/deletion rules must be enforced consistently.

## 10. Evaluation and release gates

The reviewed evaluation set must cover correct, incomplete, incorrect, ambiguous, and unconventional approaches; paraphrases and communication styles; off-topic and prompt-injection attempts; invalid reference IDs/evidence; hint/full-solution requests; provider timeout/rate limit; malformed/empty output; and content-exposure checks.

Before enabling an operation:
- schema and backend policy tests pass;
- model output cannot trigger arbitrary transitions;
- restricted content is not exposed;
- abstention is tested and measured;
- material model/prompt/rubric changes trigger regression evaluation;
- objective execution facts remain sourced from the trusted evaluator.

## 11. Open decisions

V1 provider/model selection is recorded in ADR-012: OpenAI only; `gpt-6.1-sol` for interview turns, approach assessment, hint support, and feedback; `gpt-6-luna` for focused intent/stage classification; `gpt-6-astra` only after reviewed evaluation and explicit budget approval; `gpt-transcribe` for voice input; `gpt-4o-mini-tts` for speech output. The Model Gateway centralizes IDs/configuration and records them with each operation. Per-operation timeouts/token budgets and the Astra escalation trigger still require implementation tuning. Transcript/session history retention is 365 days; raw audio is not durably stored by the application; logs must exclude audio and unrestricted candidate text/source.
