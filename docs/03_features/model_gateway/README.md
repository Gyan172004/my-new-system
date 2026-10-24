# Model Gateway

**Purpose:** Provider abstraction, structured outputs, timeouts/retries, usage/cost telemetry and prompt/model version records.

**Selected staging/production provider:** OpenAI only, through the Model Gateway. Initial model map: `gpt-6.1-sol` (interview/approach/hints/feedback), `gpt-6-luna` (focused classification), conditional `gpt-6-astra` escalation, `gpt-transcribe` (audio transcription), `gpt-4o-mini-tts` (speech generation). Configure IDs centrally and verify model access/quality before production.

**Related Kanban work:** K-017

**Stage 4 design:** The four documents below define the text gateway boundary,
failure controls, test plan and later consumer integration. ADR-024 accepts
Groq `openai/gpt-oss-120b` for explicit local development with synthetic inputs
only (owner decision, 2026-10-23). OpenAI remains the production baseline.
Documentation does not establish feature completion.

## Canonical documents

- [Requirements](requirements/feature_req.md)
- [Technical design](specifications/technical/tech_design.md)
- [Engineering design](specifications/engineering/eng_design.md)
- [Pseudocode](pseudo_code/logic_and_state.md)
