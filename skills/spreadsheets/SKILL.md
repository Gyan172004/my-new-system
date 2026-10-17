---
name: spreadsheets
description: Create or edit local XLSX workbooks from existing templates, recalculate formulas, render PDF/PNG previews, and check template fidelity using openpyxl, LibreOffice, and pdftoppm.
---

# Local Spreadsheets

Use this local workflow for Excel file deliverables. It is not the hosted OpenAI
spreadsheet engine. Read [workflow.md](references/workflow.md) for commands, edit
format, supported features and verification details before operating a workbook.

## Workflow

1. Identify the requested output and authoritative source data. For templates,
   read the template manifest and inspect the retained workbook, existing preview
   and actual cell layout before choosing edits. Never invent owners, dates or
   progress. In this repository, Kanban owns status; spreadsheet exports are
   derived views, not another accepted tracker.
2. Run `scripts/workbook.py doctor` and `inspect` from this skill's directory or
   with its resolved full path. Binary installation alone is not evidence that
   conversion works. Honor actual runtime permissions; report unavailable
   recalculation/rendering without attempting to bypass sandbox restrictions.
3. Clone the full original workbook, never rebuild its sheets from an empty
   workbook. Keep the retained source unchanged and use a new output directory.
   For ordinary scalar edits, prepare explicit cell edits and use the bundled
   `build` command. Strings are literal; only `formula` entries create formulas.
4. The helper preserves ZIP parts outside edited cell payloads, recalculates a
   disposable copy with an isolated LibreOffice profile and UNO `calculateAll`, and transfers only
   formula caches back. It does not publish LibreOffice's rewritten XLSX as the
   final file. Review its fidelity report, formula results and limitations.
5. Open **every generated PNG** with the available image viewer. Check labels,
   clipping, dimensions, chart presentation and layout against the template.
   Check task-specific totals, date formats and table/validation semantics.
   Structural verification cannot establish visual or business correctness.
6. Return the finished `workbook.xlsx`, preview images (PDF if useful), and
   `report.json`, with any unsupported or intentionally changed features. Do not
   call a failed, partial or unrendered build a finished/verified workbook. If the
   runtime is unavailable, return the diagnostic and remaining setup requirement.

## Boundaries

- Preserve formulas, names, styles, table definitions, validation, conditional
  formatting, panes, dimensions, print settings, charts and drawing parts unless
  the user explicitly requests a corresponding change. The helper checks
  unrequested package changes; it is not a universal Excel compatibility engine.
- Scalar cell edits do not expand tables, add rows/sheets, restyle objects or
  refresh pivot/chart caches. If those changes are needed, handle them as explicit
  adaptations with their own acceptance checks; do not silently delete features
  or claim the scalar helper verified them. Preserve the original in all cases.
- Report and stop before converting macros, signatures, external data or blocked
  formula features. Do not enable links, macros or provider authentication to
  make a workbook work. Use a different authorized workflow when necessary.
- Treat report `verified` as package/cache/preview-generation verification only;
  it leaves `visual_review` pending. State the observed visual review separately.
  No dependency install, global configuration edit, publication or account action
  is implied by this skill.

## Validation of the skill

Run `python3 scripts/test_workbook.py` for local deterministic checks. In an
environment that permits LibreOffice execution and its local IPC, run
`RUN_OFFICE_TESTS=1 python3 scripts/test_workbook.py` for actual recalculation and
rendering checks. Report passing, skipped and unavailable checks separately.
