# Two Sum — supplied seed material

**Status:** Structured draft content plus preserved source material; not an
independently approved seed or published version.
**Received:** 2026-10-23. **Supplied by:** project owner.

These five files are the selected starting material for Feature 3's sample
problem. They were copied unchanged from the owner's Downloads directory.
The originals remain there. [intake-report.json](intake-report.json) records the
copied file sizes, SHA-256 checksums and observed intake checks.

## Adapted project draft

- [Structured editable pack](pack.draft.json): candidate/interview/evaluation/provenance sections.
- [Readable preview](pack-preview.md): approaches, mistakes, hints, follow-ups and variants without hidden test payloads.
- [Normalization notes](normalization-notes.md): corrections, format mapping and remaining approval gates.
- [Draft validation evidence](draft-validation.json): observed data/reference/size checks; not runtime or publication acceptance.

The owner authorized extraction/adaptation on 2026-10-23. Corrections below have
been applied in the structured draft; preserved sources retain their original
wording. `authorId` and rights review remain unresolved, so this cannot publish.

## Files and intended use

| File                                                                        | Use during pack preparation                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [two-sum_package.md](source/two-sum_package.md)                             | Draft statement, approaches, mistakes, hints, follow-ups, variants and evaluation guidance |
| [two-sum_tests.json](source/two-sum_tests.json)                             | Authored test data and expected index pairs; retains public/hidden visibility              |
| [two-sum_tests_leetcode_paste.txt](source/two-sum_tests_leetcode_paste.txt) | Small-case input export for manual comparison; includes inputs marked hidden in the JSON   |
| [approaches.py](source/approaches.py)                                       | Reference examples and deliberately incorrect implementations for review                   |
| [run_tests.py](source/run_tests.py)                                         | Supplied local runner example; not the application's evaluator or sandbox                  |

Keep `source/` byte-for-byte intact. Corrections belong in a later normalized
pack, with traceability back to these inputs. Formatting excludes this source
directory to preserve the received evidence. Nothing here belongs in `public/`,
browser bundles, candidate responses or general model context.

## Checks actually performed

- Parsed the JSON and confirmed 37 distinct case IDs: 3 public and 34 generated
  hidden cases. These are supplied/generated cases, not LeetCode's private tests.
- Checked integer types, lengths and numeric limits against the declared bounds.
- Independently counted complement/index pairs for each case: all 37 have exactly
  one valid distinct-index pair and their expected indices match it. This check
  does not import or execute either supplied Python file.
- Parsed all 29 input/target pairs in the paste export; every pair matches a JSON
  case. Eight JSON cases contain 10,000 elements each and are not in that export.
- Parsed both Python files using `ast.parse`; syntax is valid. The supplied
  approaches/runner were not executed, benchmarked or qualified as an evaluator.
- Compared every copied file with its supplied original and recorded SHA-256.

These checks establish test-data consistency, not independent human content
approval or proof that every approach/hint/follow-up is correct.

## Intake findings addressed in the draft or retained as review gates

1. **Integer-range explanation is incorrect.** The package says ±2 billion can
   overflow signed 32-bit arithmetic. Both sums and complements under the stated
   ±1 billion bounds stay within ±2 billion, which fits in the signed 32-bit
   range −2,147,483,648 through 2,147,483,647. The proposed wraparound/undefined
   behavior warnings do not apply to these operations under these constraints.
   Retain useful boundary cases, but correct the explanations, follow-up F19 and
   associated evaluation guidance. Wider-constraint overflow can be a separate
   explicitly changed variant.
2. **The Python ordered-map simulation is not a balanced tree.**
   `ordered_map_bst` uses `bisect.insort` on a list, whose insertion can shift
   O(n) elements. Its worst-case total time is O(n²); that does not invalidate
   O(n log n) for an actual balanced-tree implementation.
3. **Sorting comparison needs precision.** Sort plus binary search and sort plus
   two pointers both take O(n log n) overall. Binary search adds work after the
   sort, but does not add an asymptotic log factor to the overall complexity.
   General hash-map complexity claims must also say expected/average where needed.
4. **The runner is research scaffolding.** It imports a supplied solver directly,
   prints hidden failures/expected results, does not enforce integer index types
   and does not return a failing process exit status when cases fail. Never wire
   it into the trusted API, candidate execution, CI acceptance or model tools.
   Future execution/evaluation must use the canonical isolation contract.
5. **Source coverage claims are unverified here.** The package claims 6,118
   solutions, 2,151 discussion threads and 1,316 replies, with theme counts and
   prior execution results. Raw exports, retrieval manifests and run evidence
   were not supplied. Preserve these as attributed source claims, not verified
   project research. Author/reviewer identities and source-use rights also need
   explicit evidence.
6. **Some advanced claims need review.** Do not accept the claim that brute force
   is the only general read-only/O(1)-space option as a proved lower bound. Specify
   full semantics for all-pairs, streaming and external/distributed variants
   before turning summaries into executable interview requirements. The requested
   multithreaded follow-up is not present in these supplied files.
7. **The structured draft adapts the raw inputs.** It supplies stable IDs,
   schema/content/suite/rubric versions and explicit eligibility/exposure rules.
   The sorting hint has its own ladder. Verified author identity and independent
   exact-content/source-rights approval remain pending.

## Owning requirements and next use

Use these inputs for P-04/P-05 in the
[engineering design](../../../docs/03_features/problem_catalogue/specifications/engineering/eng_design.md).
The [requirements](../../../docs/03_features/problem_catalogue/requirements/feature_req.md)
and [technical design](../../../docs/03_features/problem_catalogue/specifications/technical/tech_design.md)
remain authoritative. The implemented strict schema and data checks now validate
this draft. Finalize its identity/review fields, obtain independent human approval
for the exact resulting revision, then use the implemented authorized publication command. Structural success does not complete K-008 or K-009.
