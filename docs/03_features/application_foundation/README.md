# Application Foundation

**Purpose:** Repository conventions, module boundaries, configuration, migrations, logging, health, CI and test setup.

**Related Kanban work:** K-001–K-006, K-028

## Canonical documents

- [Requirements and reviewer checklist](requirements/feature_req.md)
- [Technical design and research](specifications/technical/tech_design.md)
- [Engineering design, tasks and validation journey](specifications/engineering/eng_design.md)
- [Logic and lifecycle pseudocode, with Hinglish walkthrough](pseudo_code/logic_and_state.md)

## Planning baseline — 2026-10-17

The owner selected TypeScript + Next.js during clarification; ADR-021 records the
choice. The four documents contain four user journeys, 15 functional requirements,
seven success criteria, a 24-item reviewer requirements checklist and 34
implementation steps mapped to the existing Kanban cards. The custom checklist
remains unchecked for the owner/designated reviewer; this is not runtime evidence.

Spec Kit working artifacts live only in ignored
`.specify/work/application_foundation/` and mirror or reference these canonical
documents. Planning does not implement the application or change Kanban/CSV
status. K-001 must pass before K-002 despite their shared Ready grouping.
K-028 retains its actual environment/secret-handling evidence gate.

