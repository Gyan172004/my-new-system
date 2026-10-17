# Model Gateway

**Purpose:** Provider abstraction, structured outputs, timeouts/retries, usage/cost telemetry and prompt/model version records.

**Selected provider:** OpenAI only, through the Model Gateway. Initial model map: `gpt-6.1-sol` (interview/approach/hints/feedback), `gpt-6-luna` (focused classification), conditional `gpt-6-astra` escalation, `gpt-transcribe` (audio transcription), `gpt-4o-mini-tts` (speech generation). Configure IDs centrally and verify model access/quality before production.

**Related Kanban work:** K-017

## Canonical documents

- `requirements/feature_req.md`
- `specifications/technical/tech_design.md`
- `specifications/engineering/eng_design.md`
- `pseudo_code/logic_and_state.md`

