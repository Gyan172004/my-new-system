# Voice Interaction and Transcription (V1 scope)

**Purpose:** Turn-based candidate voice input, transcription, visible transcript, interviewer speech output, versioned consent, text fallback, and privacy controls.

**Related Kanban work:** K-027 (scope decision — Done); K-029 (implementation — Backlog)

**Selected model operations:** OpenAI `gpt-transcribe` for bounded transcription and `gpt-4o-mini-tts` for interviewer text-to-speech, both invoked through the Model Gateway/provider adapter.

## Canonical documents

- `requirements/feature_req.md`
- `specifications/technical/tech_design.md`
- `specifications/engineering/eng_design.md`
- `pseudo_code/logic_and_state.md`

## Cross-cutting contract

- [`specifications/technical/voice_interaction_contract.md`](specifications/technical/voice_interaction_contract.md)

## V1 invariants

- This is turn-based voice, not real-time/always-on audio.
- Voice input must enter the same backend-controlled action/state transition path as typed input.
- The candidate sees the transcript and can continue with text.
- Consent must be explicit and versioned before audio processing.
- The application does not durably store raw candidate audio; audio request bodies are excluded from logs/traces.
- Transcription/provider failure does not advance the session or count as candidate failure.
