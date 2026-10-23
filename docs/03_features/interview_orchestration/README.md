# Interview Orchestration and Conversation

**Purpose:** Stage-aware prompts, structured model proposals, allowed-action policy and safe fallbacks.

**Related Kanban work:** K-018

## Canonical documents

- `requirements/feature_req.md`
- `specifications/technical/tech_design.md`
- `specifications/engineering/eng_design.md`
- `pseudo_code/logic_and_state.md`

## Existing cross-cutting contract(s)

- `specifications/technical/llm_interaction_policy.md` — retain as a cross-cutting contract and reconcile the feature design with it.

## Stage 5 scoping decisions (2026-10-24)

- `stage_classification`/`intent_classification` (`gpt-6-luna`) are designed in
  `specifications/technical/tech_design.md` §6 and `pseudo_code/logic_and_state.md` §5,
  but their implementation is a deferred task group (`IO-07` in the engineering
  design) — not part of this stage's build scope.
- Prompt templates are plain, immutable, versioned TypeScript modules (no new
  templating dependency), consistent with the Model Gateway's own
  prompt-version/hash approach.
- Curated follow-up/variant ID containment is out of scope for this feature;
  it belongs to Stage 10 (K-025). This feature's `variants_and_followups`
  stage prompt accepts only a candidate response or explicit skip.

## Finding from the 2026-10-24 analyze pass

The Model Gateway's actual Stage 4 implementation hardwires dispatch to the
single literal `gateway_probe` (confirmed by reading
`src/modules/model-gateway/application/{types,operations,invoke}.ts`), not a
generic registry-driven dispatch as earlier design text assumed. `interview_turn`
cannot be dispatched until this is generalized. Added as `FR-013`
(`requirements/feature_req.md`) and task `IO-00` (`specifications/engineering/eng_design.md`
§1/§4), which must land before `IO-01`. Scope is strictly limited to the
operation-identity/schema-selection switch — never provider adapters,
transport, or budget/retry/usage logic — with a regression test proving
`gateway_probe`'s existing behavior is unchanged.

