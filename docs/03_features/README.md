# Feature Documentation Workspace

Each feature has four canonical design documents. Create/review them before substantial implementation:

1. `requirements/feature_req.md` — problem, users, scope/non-goals, acceptance criteria, edge/failure cases.
2. `specifications/technical/tech_design.md` — interfaces, data model, architecture, dependencies, decisions.
3. `specifications/engineering/eng_design.md` — module/file breakdown, migration plan, test plan, observability and rollout.
4. `pseudo_code/logic_and_state.md` — algorithms, state transitions, validation and edge cases.

Existing files such as `session_state_machine.md`, `llm_interaction_policy.md`, and `execution_contract.md` are **cross-cutting technical contracts**, not substitutes for `tech_design.md`. Reference and reconcile them rather than duplicating them with conflicting rules.

The `_template_feature/` directory is the folder template. Each feature folder contains these document locations; a slot is intentionally empty until its feature is designed. `voice_interaction_transcription/` is approved V1 scope: turn-based voice input/transcription and interviewer speech output. K-027 records the completed scope decision; K-029 tracks implementation. The detailed cross-cutting contract is in `voice_interaction_transcription/specifications/technical/voice_interaction_contract.md`.
