# Code Execution

**Purpose:** Threat model, sandbox boundary, worker/coordinator, test evaluation, result handling and neutral infrastructure failures.

**Selected V1:** managed E2B sandbox behind an adapter; SQS Standard + DLQ; Python, C++, and Java.

**Related Kanban work:** K-020–K-022

## Canonical documents

- `requirements/feature_req.md`
- `specifications/technical/tech_design.md`
- `specifications/engineering/eng_design.md`
- `pseudo_code/logic_and_state.md`

## Existing cross-cutting contract(s)

- `specifications/technical/execution_contract.md` — retain as a cross-cutting contract and reconcile the feature design with it.

