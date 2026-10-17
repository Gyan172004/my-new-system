# Workbook workflow and fidelity contract

Commands below run from this project's root. If the skill moves, resolve its
actual directory and use that path instead of copying the scripts elsewhere.

## Inspect first

```bash
python3 skills/spreadsheets/scripts/workbook.py doctor
python3 skills/spreadsheets/scripts/workbook.py inspect /absolute/path/reference.xlsx
```

Dependencies: Python 3 with openpyxl 3.1.x, Pillow and LibreOffice's installed
`uno` Python bridge; executables `libreoffice`,
`pdfinfo` and `pdftoppm`. The doctor checks paths and local Unix socket creation.
`ready_for_office_probe` means prerequisites are present, not that a real
conversion passed. A successful real workbook conversion is still necessary.
LibreOffice uses a disposable `UserInstallation` profile and a process-group
deadline; it never needs the user's normal Office profile or cloud credentials.

Use openpyxl to inspect actual sheet names, formulas, named ranges and cells.
Load formula-bearing workbooks with `data_only=False`. `data_only=True` reads
stored results; it does not calculate formulas. For structured/rich cell values,
use `rich_text=True` when inspecting. Do not save a data-only view over a template.
Read large sheets incrementally instead of dumping all user data into logs.

## Explicit scalar edits

Create a task-owned JSON file:

```json
{
  "edits": [
    {"sheet": "Example", "cell": "A2", "value": 3},
    {"sheet": "Example", "cell": "D2", "value": "=literal text"},
    {"sheet": "Example", "cell": "C2", "formula": "=A2*B2"}
  ]
}
```

Each entry has one existing sheet, one uppercase single-cell coordinate and
exactly one `value` or `formula`. Values are JSON null/string/boolean/finite number.
Dates supplied as strings stay text; native Excel date edits need an explicitly
chosen numeric date value and pre-existing date format, or a separately reviewed
date-edit adaptation. No implicit parsing of user text into formulas/dates occurs.

The helper rejects duplicate edits, protected sheets, non-anchor merged cells,
rich-text replacements, shared-formula cell edits, out-of-bounds edits and rows
absent from the template XML. Shared formulas can retain their structure while
their caches refresh, but editing a group member needs a group-aware adaptation.
It can add a previously
unstored cell within an existing materialized row and used range without changing
dimensions. It does not insert rows, expand tables, rewrite named ranges or alter
conditional formatting/validation. Supply only requested values; keep unknown
fields blank rather than fabricate content. Do not edit a table header without
also reconciling its table definition through an explicit adaptation.

```bash
python3 skills/spreadsheets/scripts/workbook.py build /absolute/path/reference.xlsx \
  --edits /absolute/path/edits.json \
  --output-dir /absolute/path/new-output-directory
```

Omit `--edits` for an unedited clone plus recalculation/rendering. Existing output
directories/files are refused. Parameters: `--timeout` seconds per external
process (default 60), `--max-pages` (default 20), `--dpi` (default 120, range
40–300). Page limits protect against unexpectedly huge print layouts; change
print settings only with task authorization, or deliberately raise the limit.

## Preservation and recalculation

The XLSX container is a ZIP of XML/resource parts. Instead of serializing the
whole workbook through openpyxl, the helper copies every member and changes only
requested scalar-cell XML. This retains shapes/charts and extensions that
openpyxl might drop on a save. It preserves original cell styling and unrelated
children. See [openpyxl's round-trip limitations](https://openpyxl.readthedocs.io/en/stable/tutorial.html).

LibreOffice recalculates a temporary copy through an isolated local UNO pipe.
The worker explicitly enables automatic calculation and calls `calculateAll`;
format conversion and Excel's recalculation flags alone can retain stale caches.
See the [LibreOffice calculation interface](https://api.libreoffice.org/docs/idl/ref/interfacecom_1_1sun_1_1star_1_1sheet_1_1XCalculatable.html).
The helper reads results and patches cached values into the preserved workbook;
the original formula expressions and other ZIP parts remain intact. Formula
errors or missing caches abort the build. A typed empty string with an existing
empty `<v>` cache is a valid blank result; an absent cache is rejected. Literal strings beginning with `=` stay
literal. Array/data-table formula objects, unsupported namespace layouts,
macro-enabled/signed workbooks, external connections and known external-capable
formula operations require another workflow and are reported, not approximated.
The preflight is a compatibility guard, not a complete workbook security audit.

Chart, drawing, pivot and other opaque parts remain byte-for-byte preserved;
their own cached datasets are not refreshed. Dependent chart/pivot changes require
additional validation and possibly an explicitly authorized specialized tool.
Refreshing cell caches does not prove all Excel-only features evaluated correctly.

Package verification compares every part and allows only intended cell payload
changes and formula cache changes. Original styling, formulas outside explicit
formula edits, names, dimensions, tables, panes, print settings, relationships,
validation and formatting parts must remain unchanged. Loss or unrequested
modification fails verification. ZIP compression/header differences are not a
change to workbook semantics; source SHA-256 must remain unchanged.

## Deliverables and review

A successful build returns:

- `workbook.xlsx`: preserved and edited final workbook with refreshed cell caches.
- `preview.pdf` and `page-*.png`: all pages using the retained print configuration.
- `report.json`: source hash, changes, preserved opaque parts, limitations, page
  count and verification status; `visual_review` remains `pending` until an agent
  actually inspects the images.

Open all PNGs; check clipping, page breaks, labels, number/date formatting, charts
and visual correspondence with the retained reference. Check representative
computed results using `openpyxl.load_workbook(..., data_only=True)` against
task-specific expected results. The PDF is LibreOffice's rendering, not a claim of
pixel-identical Microsoft Excel display.

A failed build retains `report.json`, returns nonzero and publishes no final
workbook/previews. Source files remain unchanged. Do not silently substitute a
generic workbook, fabricate previews, or call a failure/skip a pass.

If inherited print settings divide a wide sheet across pages, retain that PDF
and optionally add a full-sheet overview without rewriting workbook settings:

```bash
python3 skills/spreadsheets/scripts/office_worker.py /absolute/path/workbook.xlsx \
  /absolute/path/overview.pdf /absolute/path/new-temporary-office-profile --pdf-overview
pdftoppm -r 100 -png -singlefile /absolute/path/overview.pdf /absolute/path/overview
```

Run this only after the same source preflight as `build`; the worker is an
internal converter, not a substitute for the fidelity workflow. This overview
mode refuses hidden sheets, uses explicitly typed UNO PDF filter properties,
and keeps the XLSX unchanged. Verify its actual page count and image before
listing it in the task report. The standard `preview.pdf` still reflects the
retained workbook's print configuration.

## Current environment evidence and native discovery

Observed here: openpyxl 3.1.5, Pillow, the Python UNO bridge, LibreOffice 7.3.7.2 and Poppler tools are
installed. An actual LibreOffice conversion returned exit 1 without a conversion
artifact; a separate local Unix socket bind failed with `EPERM`. Isolated profile
and writable temporary runtime-directory checks did not make conversion succeed.
Runtime tracing is also denied. The socket restriction is relevant evidence, not
a proven complete explanation of every Office failure. Do not bypass restrictions
or claim recalculation/rendering passed in the restricted sandbox. A later
explicitly approved execution outside that sandbox passed all 18 helper tests,
including actual rendering and forced recalculation of existing stale caches.
Use the platform approval mechanism for a narrowly scoped Office operation when
available; approval for one command does not change the default sandbox policy.

The source skill lives at `skills/spreadsheets/` because `.agents/skills/` was
read-only during creation. Root AGENTS.md points to this source for project use.
Native discovery was subsequently enabled through the following symlink. In a
fresh checkout, create it from a writable terminal only if it is absent:

```bash
ln -s ../../skills/spreadsheets .agents/skills/spreadsheets
```

Then refresh/restart Codex if discovery does not update. This does not grant
LibreOffice additional runtime permissions. Run the Office integration checks in
the actual authorized execution environment before relying on finished outputs.
