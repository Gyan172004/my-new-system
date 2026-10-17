# Development workflow setup audit

Inspected and configured on 2026-10-17. This is an installation audit and usage
guide. Project task status remains in the existing Kanban. Operational workflow
rules are maintained in [AGENTS.md](../AGENTS.md).

## Outcome and boundaries

The native Spec Kit Codex integration is installed project-locally, with a
constitution and project template overrides. Superpowers and Project Memory
installation remain blocked by this environment; neither is claimed available.
Safe memory scaffolding is prepared separately from skill installation.
No feature specification, feature plan, product code, tests, deployment resources
or project-task status changes were created by this setup.

The project root is `/home/gyandeep.katiyar/Desktop/hackassess/my-new-system`.
During the initial 2026-10-17 audit, the supplied workspace started one directory
above it. Both locations returned
`fatal: not a git repository (or any of the parent directories): .git` for Git
status/root checks. The parent's `.git` is an empty read-only directory in this
environment, not usable repository metadata. No Git initialization, commits,
stashes, branches or changes to that directory were attempted. Consequently a
normal Git diff/status comparison was unavailable during that audit.

On 2026-10-18, the owner requested Git/GitHub setup. The project was initialized
with `git init -b main` using approved access outside the sandbox because its
`.git` directory is mounted read-only inside the sandbox. Local commit identity
is configured separately from GitHub authentication; no account password is
stored in this repository. Git status/root checks now work. GitHub browser/device
authentication is a separate step and initialization alone does not establish
a remote, push, hosted CI run or feature completion.

There was no existing project or ancestor `AGENTS.md` found. The README,
architecture/ADR baseline, sequencing, feature structure and technical contracts,
API/event contracts and project-management documents were inspected. A SHA-256
snapshot of all 36 original files was taken before changes. The initial 14
feature/template directories retained all four required directory locations;
many canonical document slots are intentionally empty pending feature design.

## Tool inventory

| Tool | Observed version / availability | Location | Verification |
| --- | --- | --- | --- |
| Codex CLI, pre-existing | `0.162.1` | `/home/gyandeep.katiyar/.local/npm/bin/codex` | `command -v codex`; `codex --version` |
| Git, pre-existing | `2.34.1` | `/usr/bin/git` | `command -v git`; `git --version` |
| uv, pre-existing | `0.11.8` | `/home/gyandeep.katiyar/.local/bin/uv` | `command -v uv`; `uv --version` |
| Specify CLI, pre-existing | `1.1.3.dev0` | `/home/gyandeep.katiyar/.local/bin/specify` | `command -v specify`; `specify --version`; `specify init --help` |
| Spec Kit Codex integration, added here | Bundled with `1.1.3.dev0` | `.agents/skills/speckit-*/`; shared infrastructure in `.specify/` | `specify integration status`; `specify artifact list --json`; skill metadata inspection |
| Superpowers | Not installed/discoverable in inspected locations | No project skill/plugin installation; no `~/.codex/superpowers` | User/project skill scans; plugin cache scan; `codex plugin list --available --json` |
| skilz | Not on PATH; dependency installation failed | No persistent installation created | `command -v skilz`; isolated `uv tool install skilz` attempt |
| Project Memory skill | Not installed | Safe notes in `docs/project_notes/` are scaffolding only | User/project skill scans; absence of a `project-memory/SKILL.md` installation |

The Specify receipt identifies `https://github.com/github/spec-kit.git` and
installed commit `1e933c49fd6d5d5390b28f18faefa5728c95b2e3`. Its package is at
`/home/gyandeep.katiyar/.local/share/uv/tools/specify-cli/`.
The existing CLI was reused, not upgraded or reinstalled.

Existing user skills were present in `~/.agents/skills/` and `~/.codex/skills/`,
with system skills in `~/.codex/skills/.system/` and plugin packages under
`~/.codex/plugins/cache/`. The project's `.agents/skills/` and `.specify/` were
absent before setup. User/global configuration and existing skills were preserved.
`uv tool list` could not acquire its lock in the read-only global directories;
package receipt and executable inspection established the Specify installation.

## Spec Kit adoption and adaptation

The [official existing-project guide](https://github.github.io/spec-kit/guides/existing-projects.html)
was reviewed along with the installed help and initialization code. Its example
uses `--force`; the user's prohibition takes precedence. A separate empty
temporary directory was initialized first to inspect the exact output. The
preview contained 30 files and had zero path collisions with the project.
Then this command was run from the project root, answering the merge prompt only
after that collision check:

```bash
printf 'y\n' | specify init --here --integration codex --integration-options="--skills" --script sh
```

No force flag, extra workflow extension, Git initialization or global Codex
configuration was used. The generated paths comprise ten skills, integration
metadata/manifests, six Bash scripts, five base templates, a constitution scaffold
and its provenance, the shared ignore file, and bundled workflow metadata.

The constitution scaffold was completed using the installed
`speckit-constitution` skill and its runtime template resolver. Version `1.0.0`
summarizes existing principles and references canonical architecture/contracts;
it makes no new product or architecture choices. Its temporary sync-impact
comment is review material to remove before committing.

Four supported project overrides in `.specify/templates/overrides/` adapt the
specification, plan, tasks and checklist templates. Upstream generated skills,
scripts and base templates remain unchanged. The task override removes the
upstream optional-test default for production behavior. All four overrides
identify output as non-authoritative and direct accepted results back to the
canonical feature documents. Initially the root `.gitignore` excluded only
`/.specify/work/`. The 2026-10-18 Git setup additionally excludes machine-local
credential/configuration directories, `.env` files, private-key files, generated
caches and downloaded `skills/vendor/` checkouts. Shared project skills, canonical
documents, previews and Spec Kit infrastructure remain eligible for version
control; `.specify/.gitignore` excludes the machine-local feature pointer.

The installed skill and scripts support `SPECIFY_FEATURE_DIRECTORY`. Use
`.specify/work/<existing_feature_slug>` for disposable drafts, preserving the
upstream file names internally. The mapping and reconciliation gates live in
`AGENTS.md`. This is the smallest adaptation used: no upstream script fork,
feature-folder reorganization, permanent `specs/` tree or second accepted plan.
Working drafts are not a durable handoff; accepted information belongs in the
four canonical documents, root contracts and existing ADR register.

The bundled full-cycle automation is retained as installed infrastructure but
must not bypass the project's extra review/reconciliation gates. Likewise,
`speckit-taskstoissues` is shipped upstream but must not create a second tracker.

## Installation blockers and recovery

### Superpowers

The supplied official `.codex/INSTALL.md` URL returned HTTP 404 through browsing.
The [current official README](https://github.com/obra/superpowers#codex-cli)
instead directs Codex users to the official plugin marketplace: run `/plugins`,
search for Superpowers, then select **Install Plugin**. No obsolete bootstrap or
manual-clone instructions were substituted.

`codex plugin list --available --json` returned empty installed/available lists
with this warning:

```text
failed to list remote marketplace plugins: failed to send remote plugin catalog request to
https://chatgpt.com/backend-api/ps/plugins/installed?scope=GLOBAL
```

An additional CLI attempt with the unverified `openai-curated` marketplace name
returned `plugin 'superpowers' was not found in marketplace 'openai-curated'`.
That name is not a verified recovery command. No plugin was installed or enabled.
Shell access to GitHub also failed with `Could not resolve host:
raw.githubusercontent.com`; global Codex directories are read-only.

Recovery: in a normal network-enabled Codex client, follow the current official
`/plugins` installation flow. Inspect the installed version/location, then use
`/skills` or the `$` selector to verify all six requested discipline skills:
`using-superpowers`, `test-driven-development`, `systematic-debugging`,
`verification-before-completion`, `requesting-code-review`, and
`receiving-code-review`. Apply the responsibility boundaries in `AGENTS.md`.
Do not claim the setup correct until actual plugin/skill discovery succeeds.

### Project Memory and skilz

The [Project Memory README](https://github.com/SpillwaveSolutions/project-memory#installation)
and [skill instructions](https://github.com/SpillwaveSolutions/project-memory/blob/main/SKILL.md)
were inspected before preparing notes. The documented project-level Codex
installation is:

```bash
skilz install -g https://github.com/SpillwaveSolutions/project-memory --project --agent codex
```

The [skilz repository](https://github.com/SpillwaveSolutions/skilz-cli#installation)
documents installing its package with pip. Since skilz was absent and global tool
paths were read-only, an equivalent isolated uv tool installation was attempted
with its tool, executable and cache directories under `/tmp`:

```bash
UV_TOOL_DIR=/tmp/hackassess-uv-tools \
UV_TOOL_BIN_DIR=/tmp/hackassess-uv-bin \
UV_CACHE_DIR=/tmp/hackassess-uv-cache \
UV_HTTP_TIMEOUT=10 UV_HTTP_RETRIES=0 \
uv tool install skilz --no-python-downloads
```

It failed fetching `https://pypi.org/simple/skilz/` with `dns error` and
`Temporary failure in name resolution`. No skilz version can be reported, and
the dependent skill installation was not executed.

Recovery: install skilz in an isolated tool environment with network access,
check `skilz --version` and `skilz install --help`, and review the then-current
project-level Codex instructions before executing the skill installation.
Inspect any proposed `AGENTS.md` or memory changes and preserve the existing
project rules. The upstream skill suggests a separate decision log and includes
credential examples; this project's explicit rules prohibit those uses.

If the installer uses the documented legacy `.codex/skills/project-memory/`
location and Codex does not discover it, expose that same installed folder in
`.agents/skills/` with a relative symlink after checking for a name collision.
Do not maintain a second copied skill. Codex's
[official skill documentation](https://developers.openai.com/codex/skills/)
documents `.agents/skills/`, symlink support, `/skills` and `$` invocation.

Four note files are already prepared: bugs, safe continuity facts, a pointer to
the canonical ADR register, and a pointer to Kanban with room for useful handoff
context. This is a safe adaptation of memory defaults, not evidence of skill
installation. No secrets, duplicate ADR entries or task-status records were added.

### Runtime discovery verification

A live local discovery check was attempted with `codex app-server --stdio` and
the locally generated protocol's `initialize` / `skills/list` methods. The
server exited before initialization with:

```text
Error: Read-only file system (os error 30)
```

A retry directing logs and SQLite state to `/tmp` failed with the same error.
No user configuration or credential files were copied or modified to bypass it.
Therefore this audit verifies installation layout, metadata and Spec Kit's CLI
integration checks, but cannot claim successful live Codex skill discovery.
Launch Codex from the project root in a normal writable client and confirm the
skills in `/skills`; restart if newly installed skills do not appear.

## Future sessions

From the supplied workspace, launch the project context:

```bash
cd /home/gyandeep.katiyar/Desktop/hackassess/my-new-system
codex
```

In Codex chat, `/skills` or the `$` selector should expose these installed skills:

```text
$speckit-constitution
$speckit-specify
$speckit-clarify
$speckit-plan
$speckit-checklist
$speckit-tasks
$speckit-analyze
$speckit-implement
$speckit-converge
$speckit-taskstoissues
```

The constitution is already established. For an authorized production feature,
follow specify → clarify → plan → checklist → tasks → analyze, reviewing results
and reconciling canonical documents before implementation. Explicitly provide the
working-directory override; for example, a future feature prompt can begin:

```text
$speckit-specify SPECIFY_FEATURE_DIRECTORY=.specify/work/<existing_feature_slug>
Read AGENTS.md and the canonical feature documents first. Prepare the requested
bounded change; do not implement until the required reviews and checks pass.
```

Replace the angle-bracket placeholder with an existing feature slug. Supply the
same override to tool calls, or launch Codex with it in the environment as shown
in `AGENTS.md`. Verify `.specify/feature.json` before switching features.
After implementation use `$speckit-converge` alongside actual test evidence.
After installing Superpowers, select its discipline skills through `$` or
`/skills`; after installing Project Memory, use `$project-memory` for useful
continuity under the existing safeguards. These are agent invocations, not shell
commands. No future feature is initiated by these examples.

Spillwave SDD, the PostgreSQL specialist, the AWS CLI specialist, and any CDK
skill/plugin were deliberately not installed. Their gates are in `AGENTS.md`.

## Verification evidence

The following setup checks were executed and their outputs inspected:

- `specify integration status`: **OK**; default/installed integration `codex`,
  zero modified managed files, missing files, invalid paths or unchecked manifests.
- `specify preset resolve` for `spec-template`, `plan-template`, `tasks-template`
  and `checklist-template`: all resolve to the project's override directory.
- `specify artifact list --json`: parsed successfully; 23 exposed artifacts.
- Skill-file inspection: all ten native Codex `SKILL.md` files have matching
  names and descriptions. This establishes layout, not live client discovery.
- `bash -n` for all six installed Bash scripts: syntax checks passed.
- `SPECIFY_FEATURE_DIRECTORY=.specify/work/_setup_path_probe
  SPECIFY_FEATURE_NO_PERSIST=1 .specify/scripts/bash/check-prerequisites.sh
  --paths-only --json`: resolved the project and working artifact paths correctly;
  created neither a feature directory nor `.specify/feature.json`.
- SHA-256 comparison with the pre-setup snapshot: all 36 original files remain
  byte-for-byte unchanged, with none missing. All 14 original feature/template
  directories retain their four directory locations.
- Relative Markdown links in the new constitution and memory files resolve;
  configuration JSON parses successfully. No permanent `specs/` tree exists.

No unit, integration, contract or end-to-end product tests were run: this task
adds workflow configuration/documentation only, and the project has no application
implementation yet. No feature acceptance or convergence result is claimed.
The successful setup checks do not remove the installation and live-discovery
blockers described above.

## Project-local spreadsheets capability (2026-10-17)

The requested skill source is
[`skills/spreadsheets/SKILL.md`](../skills/spreadsheets/SKILL.md), with UI metadata,
an XLSX helper, behavioral tests and a focused workflow reference. Root AGENTS.md
links it for project use. The skill was initialized with the installed
`skill-creator` initializer. Native registration under `.agents/skills/` was
rejected as read-only, so selector discovery is not claimed. The workflow
reference documents the single source-preserving symlink to create from a
writable host terminal.

It reuses installed openpyxl 3.1.5, Pillow, LibreOffice 7.3.7.2, `pdfinfo` and
`pdftoppm`; no dependency was installed. Scalar edits patch a cloned ZIP package
instead of round-tripping every template object through openpyxl. Recalculation
uses a disposable Office copy and transfers cell caches back. Charts/pivots keep
their original opaque parts and are reported as having unrefreshed object caches.
Unsupported features and unexpected package changes prevent a successful build.
Successful deliverables are an XLSX, PDF/PNG previews and a fidelity report;
visual review and task-specific formula assertions remain separate checks.

Observed checks:

- `python3 skills/spreadsheets/scripts/test_workbook.py`: 14 tests, 12 passed,
  2 Office integration tests skipped by default. This includes actual Poppler
  rasterization of a synthetic PDF, which does not establish Office rendering.
- `python3 /home/gyandeep.katiyar/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/spreadsheets`:
  skill metadata/scaffolding validation passed.
- An independent forward test verified 13 preservation assertions against a
  styled workbook with a chart, named range, formulas and validation. It verified
  scalar editing and the unchanged source hash; it did not verify recalculation.
- Actual LibreOffice conversion returned exit 1 and produced no workbook. The
  helper retained a failure report and published no final XLSX or previews.
  A separate Unix socket bind returned `EPERM`; this is relevant evidence, not a
  proven complete explanation of the conversion failure. Runtime tracing was
  also denied. No runtime restrictions were bypassed.

In an authorized environment where Office conversion works, execute
`RUN_OFFICE_TESTS=1 python3 skills/spreadsheets/scripts/test_workbook.py` before
relying on finished XLSX/previews. These additions do not implement a product
feature or change canonical Kanban/CSV status.

### Follow-up verification after native registration

The `.agents/skills/spreadsheets` symlink is now present and the skill is exposed
in the session's available-skills list. Restricted sandbox Office execution
still fails. An approved execution outside that sandbox passed:

```bash
RUN_OFFICE_TESTS=1 python3 skills/spreadsheets/scripts/test_workbook.py
```

Observed result after the template-driven fixes: **18 tests passed, zero skipped**.
Actual usage exposed greedy matching of self-closing cells, date serial versus
Python datetime comparison, and typed empty-string caches. Regression checks
cover these cases. Existing formula caches can remain stale during plain format
conversion, so the installed Python UNO bridge now explicitly invokes
LibreOffice `calculateAll` on a disposable copy before cache transfer. A test
with deliberately stale caches verifies recalculation. No dependency was added.

The resulting derived Project Tracker and its verification report are at
[`artifacts/project-tracker/kanban-snapshot-2026-10-17/`](../artifacts/project-tracker/kanban-snapshot-2026-10-17/report.json).
All 29 canonical task rows, cached summaries and 655 retained formulas were
checked. Template, Kanban and CSV hashes remain unchanged. All five PNGs produced
from inherited print settings and a separate full-sheet overview were visually
reviewed. The overview changes PDF export behavior only; XLSX print settings,
styles, dimensions, validations and original package parts remain preserved.
This is a derived snapshot, not another project-status source.
