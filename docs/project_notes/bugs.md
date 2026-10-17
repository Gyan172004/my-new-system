# Recurring bug knowledge

Store concise dated symptoms, root cause, verified fix, prevention and evidence
only when useful to future work. Search before investigating a recurring failure.
Do not store secrets or copy canonical designs. No product bug fixes recorded yet.

- 2026-10-17 — XLSX template tooling: greedy XML matching could consume adjacent
  cells after a self-closing cell; non-greedy attribute matching fixes it. Numeric
  Excel dates need epoch-aware comparison after openpyxl decodes them, and typed
  empty-string caches need to be distinguished from absent cache nodes. Plain
  LibreOffice format conversion can retain stale results; use UNO `calculateAll`
  before transferring caches. Regression and Office integration checks passed;
  see [the setup follow-up](../development_workflow_setup.md#follow-up-verification-after-native-registration)
  and [the behavioral tests](../../skills/spreadsheets/scripts/test_workbook.py).
