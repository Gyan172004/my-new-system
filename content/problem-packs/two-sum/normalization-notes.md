# Two Sum — normalization notes

**Date:** 2026-10-23. **Authority:** owner-authorized content adaptation.

[pack.draft.json](pack.draft.json) is the editable structured content draft.
[pack-preview.md](pack-preview.md) is its generated reading view. Neither is an
approved release or a substitute for the four canonical feature documents.

## Mapping to the planned format

| Planned section | Draft contents                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate       | Reworded statement, constraints and three public examples                                                                                                                  |
| Interview       | Eight clarifications, invariants, 12 approach records, eight mistakes, two hint ladders with seven hints, 22 follow-ups, 11 reasoning-only variants and qualitative rubric |
| Evaluation      | All 37 supplied cases with unchanged input/expected pairs/visibility, rationale, independent data-check evidence and proposed checker metadata                             |
| Provenance      | Original filenames/checksums, external reference, transformation notes and pending rights review                                                                           |

Stable section IDs let future references point to a particular approach, hint,
follow-up or test. Version labels and eligibility/checker identifiers are
**selected version-1 authoring values**, reconciled in the canonical technical
design after owner acceptance on 2026-10-23. Runtime schema, input-profile and rule-descriptor validation now pass
the implemented Group 01 checks. The checker ID is a descriptor; executable qualification remains later
execution work. The input profile is `two-sum-base-v1`.

**Update, 2026-10-24:** the owner (Gyandeep Katiyar) is recorded as both
author and approving reviewer under ADR-025's one-time V1-seed-only
exception (`docs/01_macro_architecture/05_architecture_decision_records.md`),
having reviewed `pack-preview.md` and the source-rights question around the
retained `source/two-sum_tests_leetcode_paste.txt` material directly — see
`draft-validation.json`'s `humanReviewApprovalRecord`. This is a documented
exception to ADR-020's standing different-author/reviewer rule for this one
pack only; it does not invent a second reviewer or fabricate approval. The
`authorId` field in `pack.draft.json` still reads null pending the actual
`scripts/content-pack.ts review`/`publish` database command, which is what
assigns the verified internal author/reviewer IDs, computes the exact
finalized checksum, and actually publishes the pack — that operational step
has not run yet. No publication receipt is invented.

## Corrections and additions

- Corrected numeric-range reasoning: sums and complements stay inside signed
  32-bit bounds for the base problem. Existing case IDs remain stable; category
  `edge-overflow` becomes `edge-numeric-boundary`, with corrected rationale.
- Distinguished an actual balanced-tree map from the supplied Python
  `bisect.insort` simulation, which can take quadratic total time.
- Accounted for Python suffix copies and the input pool retained by
  `itertools.combinations`, instead of calling every brute-force example
  constant-space.
- Clarified that sort-plus-binary-search and sort-plus-two-pointers are both
  O(n log n) overall. Hashing bounds explicitly state expected behavior.
- Removed unsupported claims about a proved constant-memory lower bound and
  community popularity/counts. The raw source remains available for traceability.
- Separated hash-map and sorting hints into independently ordered ladders.
  Draft hints forbid paraphrasing until review deliberately permits it.
- Defined different output questions separately in follow-up guidance, including
  counting pairs versus maximum sum below a bound. Variants remain reasoning-only
  until their input/output contracts and dedicated tests are reviewed.
- Added two original draft concurrency follow-ups: parallel search on fixed
  input, and a shared add/find service. They discuss cross-partition pairs,
  synchronization and consistent query semantics. Their suggested designs and
  performance assumptions still need independent review; they are not attributed
  to an inaccessible LeetCode discussion.
- Kept the supplied Python runner as source material. Its unsafe import/output
  behavior and lack of CI failure signaling are not adopted by the application.

## Validation limits and remaining work

Extraction and the implemented validator check JSON structure, IDs/references,
ladder ordering, size/depth, test preservation, constraints and unique expected
pairs. Neither executes supplied approaches or proves algorithmic/source-rights
approval. The executable checker remains unimplemented. Observed checks are in
[draft-validation.json](draft-validation.json).

Before publication: assign a verified author and different reviewer with ADR-023 configuration grants; review content and source rights;
approve the exact final content revision; and use the reviewed authorized
publication command. Executable checker/harness qualification is required before
enabling submissions, not before metadata-only seed publication. Updating identity/content invalidates a previous
draft checksum. Kanban remains the project status source.
