# Two Sum — draft pack preview

> Generated reading view of `pack.draft.json`; edit that draft and regenerate this view.
> Not independently approved or published. Hidden test payloads are intentionally omitted.

## Candidate question

Find the two different positions in an integer array whose values total the requested target. Return their zero-based indices; either index order is accepted. Each valid input has exactly one unordered answer pair.

Constraints:

- 2 <= nums.length <= 10000
- -1000000000 <= nums[i] <= 1000000000
- -1000000000 <= target <= 1000000000
- Exactly one valid unordered pair of distinct indices exists.

Examples:

- Input: `{"nums":[2,7,11,15],"target":9}` → output: `[0, 1]`. The values at positions 0 and 1 total 9.
- Input: `{"nums":[3,2,4],"target":6}` → output: `[1, 2]`. Positions 1 and 2 work; reusing position 0 is not allowed.
- Input: `{"nums":[3,3],"target":6}` → output: `[0, 1]`. Equal values at different positions may form the answer.

## Clarifications

- **May one position be reused?** No. Equal values at different positions may be used.
- **Can input values repeat?** Yes. Distinct positions, not distinct values, are required.
- **Can no answer or multiple answers occur?** The base contract promises exactly one valid unordered index pair. Changed guarantees belong to variants.
- **Does result order matter?** Either ordering of the two valid zero-based indices is accepted.
- **Is input sorted?** No. Preserve original positions if sorting internally.
- **Can numbers or target be negative or zero?** Yes, within the declared bounds.
- **May input be modified?** No additional immutability requirement is imposed here; original-index semantics must still be preserved.
- **Can these sums/complements overflow signed 32-bit integers?** No. With values/target within ±1,000,000,000, both sum and complement stay within ±2,000,000,000; this fits signed 32-bit arithmetic.

## Reference approaches

### Distinct-pair scan (`brute-force`)

Compare each unordered pair.

Time: O(n^2). Extra space: O(1).

1. For i in 0..n-1, visit j in i+1..n-1.
2. Return [i,j] when nums[i]+nums[j] equals target.

Correctness: Every pair of distinct positions appears once, so the promised unique answer is visited.

- Base problem constraints and distinct original indices.
- Simple baseline; does not meet the subquadratic follow-up.

### Scan the remaining suffix (`lookup-rest`)

For each element, search later elements for its complement.

Time: O(n^2). Extra space: O(n) peak for Python slicing; O(1) for a non-copying suffix scan.

1. For each i, search nums[i+1:] for target-nums[i].
2. If found, translate the suffix position back to an original index.

Correctness: Only later positions are searched, so indices differ; every valid pair is considered.

- Base problem constraints and distinct original indices.
- One visible loop does not imply linear time.

### Enumerate index combinations (`combinations`)

Enumerate all size-two combinations of positions.

Time: O(n^2). Extra space: O(n) for Python itertools.combinations input pool; O(1) pair-generator state beyond that.

1. Generate pairs (i,j) with i<j.
2. Return the first pair whose values reach target.

Correctness: The enumeration covers exactly the distinct unordered index pairs.

- Base problem constraints and distinct original indices.
- Correct output; still brute force.

### Sort indexed values, then two pointers (`sort-two-pointers`)

Preserve original positions while sorting by value.

Time: O(n log n). Extra space: O(n) for original-index records, including typical sort workspace.

1. Sort (value,originalIndex) pairs.
2. Set left=0 and right=n-1.
3. Compare their sum with target. Return original indices on equality.
4. If the sum is too small, increase left; otherwise decrease right.

Correctness: For a sum below target, the smallest remaining value cannot succeed with any remaining partner; the symmetric argument removes the largest value when the sum is too large.

- Base problem constraints and distinct original indices.
- Sorting values alone would lose the required original positions.

### Sort indexed values, then binary search (`sort-binary-search`)

Search for each complement in the sorted suffix.

Time: O(n log n). Extra space: O(n).

1. Sort records retaining original indices.
2. For sorted position k, binary-search positions k+1..n-1 for target-value[k].
3. Return the original indices when found.

Correctness: At the smaller sorted position of the answer, its partner is in the searched suffix.

- Base problem constraints and distinct original indices.
- After sorting, searches cost O(n log n), versus a linear two-pointer scan; both total bounds are O(n log n).

### Balanced-tree value-to-index map (`ordered-tree-map`)

Keep previous values in an actual balanced search tree.

Time: O(n log n) with an actual balanced tree. Extra space: O(n).

1. Look up target-x in the tree for each new x.
2. If found, return the stored original index and current index.
3. Otherwise insert or update x with its index.

Correctness: The earlier endpoint of a valid pair is available when the later endpoint arrives.

- Base problem constraints and distinct original indices.
- The supplied Python bisect/list simulation has O(n^2) worst-case time because insertion shifts elements.

### Two-pass hash map (`two-pass-hash`)

Build value-to-index mappings before searching.

Time: Expected O(n); generic collision worst case O(n^2). Extra space: O(n).

1. Store each value with an original index; later duplicates may replace earlier entries.
2. For each i, find j=map[target-nums[i]].
3. Return [i,j] only if j exists and j != i.

Correctness: A valid complement is retained; the different-index check prevents self-pairing, including when only one target/2 value exists.

- Base problem constraints and distinct original indices.

### One-pass hash map (`one-pass-hash`)

Look up a complement among earlier elements.

Time: Expected O(n); generic collision worst case O(n^2). Extra space: O(n).

1. Start with an empty value-to-index map.
2. For current index j and value x, look for target-x.
3. If present, return [storedIndex,j].
4. Otherwise store x -> j, after the lookup.

Correctness: Before index j, the map contains only earlier positions. When the later endpoint of the unique answer arrives, its complement is present and cannot equal j.

- Base problem constraints and distinct original indices.

### Hash values to lists of indices (`value-index-lists`)

Keep every occurrence of each value.

Time: Expected O(n); generic collision worst case O(n^2). Extra space: O(n).

1. Build value -> list of original indices.
2. For each value x, look for target-x.
3. If the values differ, use one index from each list; if equal, require two indices.

Correctness: Lists retain multiplicity; equal values use different stored positions.

- Base problem constraints and distinct original indices.
- More information than the base problem needs; useful foundation for all-index-pairs variants.

### Find values with a set, then locate positions (`set-then-locate`)

Find a value pair before mapping it to distinct original positions.

Time: Expected O(n); generic collision worst case O(n^2). Extra space: O(n).

1. Scan with a seen-value set to find a complement.
2. Scan the original input to locate both values.
3. For equal values, choose two different indices.

Correctness: The first scan establishes existence using an earlier position; the second reconstructs two valid distinct positions.

- Base problem constraints and distinct original indices.
- Repeated full-array searches inside the loop would change the complexity.

### Custom hash table (`custom-hash`)

Use the one-pass algorithm with a manually implemented table.

Time: Expected O(n) with suitable hashing; O(n^2) collision worst case. Extra space: O(n).

1. Allocate enough slots for bounded load.
2. Hash target-x and probe for an earlier match.
3. Return indices when found; otherwise insert x.
4. Use separate occupancy metadata so valid keys cannot collide with an empty sentinel.

Correctness: This implements the same earlier-element lookup invariant as one-pass hashing, provided collision resolution is correct.

- Base problem constraints and distinct original indices.
- Requires review of collisions, negative keys, capacity and termination. Fixed deterministic hashing is not an adversarial guarantee.

### Direct-address table for a small value range (`direct-address`)

Use a value-offset array when its range is small.

Time: O(n + R). Extra space: O(R).

1. Determine min/max and R=max-min+1.
2. Allocate R slots initialized as absent.
3. Look up complement offsets before recording the current position.

Correctness: Each allowed value has a unique slot; looking up before inserting prevents using one position twice.

- Only use when R is small enough for the approved memory budget.
- Full base constraints can span 2,000,000,001 values, so this is not a practical standalone base solution. The supplied implementation falls back to hashing for a wide range.

## Common mistakes

- **Insert before complement lookup:** The current element can match itself. Test references: `ex2`, `ex3`.
- **Omit j != i in a two-pass map:** A lone target/2 value can be returned twice. Test references: `ex2`, `e_half_once`.
- **Return sorted-array positions:** The required answer uses the original array positions. Test references: `ex2`.
- **Use the first value index twice:** Equal values need distinct occurrences, not the same first index. Test references: `ex3`, `e_indexof_dup`.
- **Check only adjacent elements:** A valid pair need not occupy neighboring positions. Test references: `e_first_last`.
- **Skip values larger than target:** Negative partners and negative targets invalidate that pruning. Test references: `e_min_len_neg`.
- **Call suffix searching a linear algorithm:** Each suffix membership/search may scan O(n) elements; slicing also allocates. Test references: `p_pair_at_end`.
- **Return a value set as the answer:** A set alone neither preserves original indices nor represents duplicate occurrences. Test references: `ex3`.

## Hint ladders

Only one backend-approved hint may be revealed per accepted action. These are separate paths, not one seven-hint sequence.

### hash-hints

1. What work is repeated when you compare every pair?
2. For a fixed x, what exact partner value would reach target?
3. How could you remember earlier values together with their positions for quick lookup?
4. Look for target-x among earlier entries before recording the current value and index. Why does this prevent using the same position twice?

### sorting-hints

1. How could you sort by value without losing the original positions?
2. Compare the smallest and largest remaining values. If their sum is too small, which endpoint can safely be discarded?
3. Move the smaller endpoint right when the sum is too small, or the larger endpoint left when it is too large; return their original indices on equality.

## Follow-ups and expected reasoning

All need independent review. The two concurrency prompts are new project drafts.

### subquadratic: How can you improve on comparing every pair?

- Explain complement lookup.
- Expected O(n) hashing with O(n) memory, or O(n log n) indexed sorting.

Skill: Time-space trade-off. Adapted and corrected from owner package.

### complexity: What assumptions are behind your complexity claim?

- Separate expected hash behavior from collision worst cases.
- State auxiliary memory.
- An actual balanced tree offers logarithmic operations.

Skill: Complexity precision. Adapted and corrected from owner package.

### lookup-order: Why does lookup come before insertion?

- Earlier-only map contents enforce distinct indices.
- Explain ex2.

Skill: Invariant reasoning. Adapted and corrected from owner package.

### duplicate-values: What happens when the two values are equal?

- Two different occurrences are needed.
- The second occurrence can find the first.
- A two-pass map must reject a self-index.

Skill: Multiplicity. Adapted and corrected from owner package.

### sorted-input: What changes if input is already sorted?

- Use two pointers in O(n) time and O(1) extra space.
- State the variant indexing convention explicitly.

Skill: Exploiting order. Adapted and corrected from owner package.

### constant-space: If only constant extra memory is allowed, what must be clarified?

- Does the output still require original indices?
- Sorting plain values loses original positions.
- If values suffice and mutation is allowed, consider in-place sorting and its workspace.
- Otherwise offer the pair-scan baseline; do not claim a proved lower bound.

Skill: Contract trade-offs. Adapted and corrected from owner package.

### readonly-space: What can you do with read-only input and constant extra memory?

- Give the O(n^2) distinct-pair baseline.
- Discuss the computational model before asserting impossibility of improvements.

Skill: Reasoning under constraints. Adapted and corrected from owner package.

### no-solution: How would you handle inputs with no pair?

- Agree on an empty result or explicit outcome.
- Ensure the scan terminates without inventing indices.

Skill: Failure contract. Adapted and corrected from owner package.

### multiple-pairs: If more than one pair exists, what should be returned?

- Clarify any pair, first-found, lexicographic or all pairs.
- Revise tests and checker before implementation.

Skill: Requirement clarification. Adapted and corrected from owner package.

### all-pairs: How do all index pairs differ from unique value pairs?

- Keep lists of earlier indices for all index pairs.
- Output cost k can be quadratic.
- Expected O(n+k) time with hashing; O(n) working memory plus output.
- Unique value pairs need value-pair deduplication.

Skill: Output-sensitive complexity. Adapted and corrected from owner package.

### count-pairs: How would you count distinct index pairs?

- Add the earlier frequency of target-x before incrementing frequency[x].
- Handle equal values through multiplicity.
- Expected O(n) time.

Skill: Counting. Adapted and corrected from owner package.

### sum-bound: How does a sum-below-K question change the algorithm?

- Sort values.
- For counting <=K, a valid endpoint sum contributes right-left pairs.
- For maximum sum <K, track the best valid sum instead of counting.
- These are separate output contracts.

Skill: Inequality queries. Adapted and corrected from owner package.

### closest-sum: How would you find a pair closest to target?

- Sort and use two pointers while tracking the best absolute difference.
- Define tie-breaking and whether indices or values are returned.

Skill: Optimization. Adapted and corrected from owner package.

### ksum: How does the idea extend to 3Sum?

- Sort, fix an element, use a two-pointer search on the remainder.
- Deduplicate according to the required output.
- For fixed k>=3, the usual recursive sorted method has O(n^(k-1)) search time, plus sorting/output.

Skill: Generalization. Adapted and corrected from owner package.

### streaming: Design add(x) and find(target) over an evolving multiset.

- Frequency-map baseline: expected O(1) add, O(d) find for d distinct values.
- Equal complements need count>=2.
- Precomputed pair sums shift work/memory toward add; potentially O(d^2) sums.

Skill: Workload design. Adapted and corrected from owner package.

### bst-input: What changes if input is a binary search tree?

- A traversal with a seen set uses O(n) memory.
- Two directional iterators can use O(h) memory with O(n) total traversal.
- Prevent matching a node with itself.

Skill: Representation transfer. Adapted and corrected from owner package.

### external-data: What if the input does not fit in memory?

- Define storage, index output and I/O budget.
- External sorting needs a bidirectional/indexed access plan; one forward stream alone is insufficient.
- Hash partitioning must route complementary keys to coordinated partition pairs and preserve original indices.
- Do not claim a complete algorithm from partition-local search alone.

Skill: Data placement. Adapted and corrected from owner package.

### small-range: What if values lie in a small known integer range?

- Direct addressing trades O(R) memory and initialization for constant lookup.
- Check the actual range and memory budget.

Skill: Constraint-based structure choice. Adapted and corrected from owner package.

### integer-bounds: Do sums or complements overflow signed 32-bit arithmetic here?

- Both are in [-2,000,000,000,2,000,000,000], within signed 32-bit.
- If the variant widens inputs, re-evaluate expression types before arithmetic.

Skill: Numeric bounds. Adapted and corrected from owner package.

### hash-adversary: How would you handle unfavorable hash collisions?

- Expected constant-time operations are an assumption.
- Consider actual language implementation guarantees, randomized hashing or balanced-tree alternatives.
- Do not infer guarantees from an observed runtime percentile.

Skill: Robustness. Adapted and corrected from owner package.

### parallel-static: Could workers search different portions of a fixed array?

- Independent local searches miss cross-partition pairs.
- One correct design builds a complete immutable value-to-index-list map, waits for construction, then parallelizes lookups.
- Keep distinct-index checks for equal values.
- Explain build barrier, result coordination, O(n) memory/work and overhead; speedup is not guaranteed.

Skill: Parallel correctness. New project draft inspired by the owner request; not attributed to a verified LeetCode thread.

### concurrent-service: How would you make an add/find service thread-safe?

- Define whether find observes one consistent snapshot of completed adds.
- A simple correct baseline protects the entire add/find operation with the same lock and keeps frequencies.
- Thread-safe individual map calls do not make a multi-step query atomic.
- Analyze contention before proposing finer-grained schemes.

Skill: Concurrency semantics. New project draft inspired by the owner request; not attributed to a verified LeetCode thread.

## Reasoning-only variants

No variant is enabled for execution; dedicated contracts/checkers/test suites are not supplied.

- **sorted-input:** Sorted input; define zero- or one-based output before use. O(n) time / O(1) extra space.
- **streaming:** Evolving multiset with add/find operations. Frequency-map baseline: expected O(1) add, O(d) find, O(d) storage.
- **bst-input:** Tree input with boolean pair-existence output. O(n) traversal time; O(h) space with two iterators.
- **sum-less-than-k:** Return maximum pair sum strictly below K; define no-pair behavior. O(n log n) time including sorting.
- **count-pairs:** Return count of all distinct unordered index pairs. Expected O(n) time, O(d) frequency storage.
- **unique-value-pairs:** Return every distinct unordered value pair. O(n log n + k) time including output; memory depends on mutation/output.
- **closest-sum:** Minimize distance to target; specify tie-breaking. O(n log n) time including sorting.
- **ksum:** Use k distinct indices; define deduplication of output values. For fixed k>=3, usual O(n^(k-1)) search plus sorting/output.
- **difference:** Find distinct indices with a-b=target; define direction of output. Expected O(n) time and O(n) memory.
- **two-arrays:** Choose one value from each of two arrays. Expected O(n+m) time and O(n) lookup memory.
- **external-data:** Disk/distributed input with preserved original positions. I/O model and implementation-specific; no universal bound asserted.

## Evaluation guidance

### understanding

- Strong: Explains distinct positions, original indexing, duplicates and uniqueness.
- Partial: Clarifies ambiguities after prompting.
- Incorrect: Returns values or reuses one index.

### reasoning

- Strong: States a valid invariant and correctness argument.
- Partial: Knows a pattern but cannot yet justify ordering.
- Incorrect: Uses unsupported pruning or two pointers on unsorted values.

### complexity

- Strong: Accounts for memory, sorting, slicing and expected hash behavior.
- Partial: Gives the headline bound without assumptions.
- Incorrect: Treats list insertion as logarithmic or asserts nonexistent overflow.

### transfer

- Strong: Adapts to explicitly changed contracts with clear assumptions.
- Partial: Needs guidance to identify changed guarantees.
- Incorrect: Applies the base algorithm despite incompatible requirements.

Evidence-linked qualitative guidance only; no new numeric score weights. Unassessed dimensions remain unassessed.

## Test material and provenance

Selected input profile: `two-sum-base-v1`. Checker descriptor:
`distinct-index-pair-unordered`. Their executable runtime implementation is
not supplied by this draft.

The draft retains all 37 input/expected-output pairs and their visibility. The 34 hidden cases are owner-generated, not LeetCode private tests. See the JSON and validation report for structural/data checks; supplied solver code has not been executed.

Source files and SHA-256 references are preserved in `source/` and `intake-report.json`. Community crawl totals and prior run claims are not adopted. See `normalization-notes.md` for corrections and remaining publication gates.
