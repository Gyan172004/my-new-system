# 1. Two Sum: Problem Package

> Built from LeetCode's problem page plus **6,118 community solutions** (the full reachable Solutions section: the union of the Most Votes, Hot and Newest lists, which LeetCode caps at 3,000 each) and **2,151 discussion threads with 1,316 replies**. Every approach and mistake below was run against the test suite in `two-sum_tests.json` (see §8).

---

## 1. Basic details

| Field | Value |
|---|---|
| Problem | 1. Two Sum |
| URL | https://leetcode.com/problems/two-sum/ |
| Difficulty | Easy |
| Topics / tags | Array, Hash Table |
| Related | Two Sum II (sorted input, #167), Two Sum III (data structure design, #170), Two Sum IV (BST, #653), 3Sum (#15), 4Sum (#18), Two Sum Less Than K (#1099) |

---

## 2. Problem statement

Given an integer array `nums` and an integer `target`, return the **indices** of the two numbers whose sum equals `target`.

**Input**
- `nums`: array of integers
- `target`: integer

**Output**
- An array of two distinct indices `[i, j]` with `nums[i] + nums[j] == target`, in **any order**.

**Constraints**
- `2 <= nums.length <= 10^4`
- `-10^9 <= nums[i] <= 10^9`
- `-10^9 <= target <= 10^9`
- **Exactly one valid answer exists.**

**Assumptions stated by the problem**
- The same element may not be used twice. The two indices must differ, but the two *values* may be equal.
- The answer may be returned in any order.

**Official follow-up:** *Can you come up with an algorithm that is less than O(n²) time complexity?*

---

## 3. Examples

| # | Input | Output | Explanation |
|---|---|---|---|
| 1 | `nums = [2,7,11,15], target = 9` | `[0,1]` | 2 + 7 = 9 |
| 2 | `nums = [3,2,4], target = 6` | `[1,2]` | 2 + 4 = 6. Note that `[0,0]` (3 + 3) is invalid because it reuses index 0. |
| 3 | `nums = [3,3], target = 6` | `[0,1]` | Equal values at different indices are allowed. |

---

## 4. Clarifications

These are the questions that come up most often across the solutions and discussion. The "mentions" column counts posts touching the theme, out of 6,118 solutions + 3,467 discussion posts.

| Question | Answer | Mentions |
|---|---|---|
| Can I use the same element twice? | No. The indices must differ. Example 2 is built to catch this: `3 + 3 = 6`, but there is only one 3. | 340 |
| What if there is no solution? | Can't happen here: exactly one answer is guaranteed. In an interview, ask anyway. Common conventions are returning `[]`, `[-1, -1]`, or throwing. | 443 |
| What if several pairs work? | Can't happen here either (exactly one answer). The inputs are constructed so this holds. If it could happen, the interviewer must say which pair to return (first found, all pairs, etc.). | 197 |
| Can values repeat? | Yes. Duplicates are allowed, e.g. `[3,3]`. The answer is still unique, so a duplicated value is either both halves of the answer or not in it at all. | 178 |
| Can values or the target be negative or zero? | Yes, both can be anywhere in `[-10^9, 10^9]`. Never prune with `if x > target: skip`. | 44 |
| Is the array sorted? | No. If it were, that's Two Sum II (#167), with an O(1)-space two-pointer solution. | 93 |
| Must the indices be in increasing order? | No, any order is accepted. Most solutions naturally return `[smaller, larger]`. | 27 |
| 0-indexed or 1-indexed? | 0-indexed here. Two Sum II uses 1-indexed. | 3 |
| Do I return values or indices? | Indices. This rules out "just sort and return positions" (see §6). | 12 |
| Can I modify the input (e.g. sort it in place)? | Not forbidden, but sorting destroys the original indices, so you must sort `(value, index)` pairs or an index array. | 15 |
| Is O(n²) acceptable? | It is accepted on LeetCode with n ≤ 10^4 (~5×10^7 pair checks), though some posters report TLE in slower languages. The follow-up asks for better. | 119 |
| Can `nums[i] + nums[j]` overflow 32-bit `int`? | Sums can reach ±2×10^9 > INT32_MAX. Under these constraints any wrapped value lands below −2.1×10^9 or above 2.1×10^9, so it can never equal a valid target. A wrapped result therefore can't produce a wrong answer, but signed overflow is still **undefined behaviour in C/C++**. Use `long long`/`long`, or compare `nums[j] == target - nums[i]` with 64-bit arithmetic. | 20 |

---

## 5. Solution approaches

Usage share in the community solutions (keyword/code signatures; one solution can show several):

| Approach | Solutions |
|---|---|
| Hash map (one- or two-pass) | ~4,170 |
| Brute force (nested loops) | ~2,370 |
| Sorting-based (two pointers / binary search) | ~480 |
| `x in nums[i+1:]` / `indexOf` lookups | ~190 |
| Ordered map / BST (`std::map`) | 83 |
| Hand-written hash table (C: chaining, open addressing, uthash) | ~24 |
| Other (recursion, `itertools.combinations`, direct-address arrays) | <20 |

All 12 correct approaches below pass all 37 tests (`approaches.py`).

### A. Brute force: check every pair. O(n²) time, O(1) space

**Steps**
1. For each `i` from 0 to n−1:
2. For each `j` from i+1 to n−1:
3. If `nums[i] + nums[j] == target`, return `[i, j]`.

```python
def twoSum(nums, target):
    n = len(nums)
    for i in range(n):
        for j in range(i + 1, n):
            if nums[i] + nums[j] == target:
                return [i, j]
```

**Correctness:** every unordered pair `{i, j}` with `i < j` is examined exactly once, so the unique answer is found. Starting `j` at `i+1` guarantees distinct indices.

**Variants seen in the community** (same complexity):
- **`itertools.combinations(range(n), 2)`**: the same loop, written idiomatically.
- **Recursion on head/tail** (functional languages such as Elixir): look for `target - head` in `tail`, otherwise recurse on `tail`.
- **Lookup in the rest of the array**: `if target - x in nums[i+1:]` (Python) or `indexOf(target - x, i + 1)` (JS/Java). This *looks* like one loop but is O(n²): the membership test is linear, and slicing also copies O(n) memory per step.

### B. Sort + two pointers. O(n log n) time, O(n) space

**Steps**
1. Build `idx = [0..n-1]` sorted by `nums[idx[k]]`. Sort indices, not values, so original positions survive.
2. Set `lo = 0, hi = n−1`.
3. While `lo < hi`: let `s = nums[idx[lo]] + nums[idx[hi]]`.
   If `s == target`, return `[idx[lo], idx[hi]]`. If `s < target`, `lo++`. Otherwise `hi--`.

```python
def twoSum(nums, target):
    idx = sorted(range(len(nums)), key=nums.__getitem__)
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[idx[lo]] + nums[idx[hi]]
        if s == target:
            return [idx[lo], idx[hi]]
        if s < target:
            lo += 1
        else:
            hi -= 1
```

**Correctness:** let the answer sit at sorted positions `a < b`. If `s < target` while `lo < a`, then `nums[lo]` can't pair with anything at or below `hi`, so discarding `lo` is safe. The case `s > target` is symmetric. Neither pointer ever passes the answer, so it is found.

**When to prefer:** the input is already sorted (Two Sum II: O(1) extra space), or you need *all* pairs or *unique* pairs, where the sorted order makes skipping duplicates easy.

### C. Sort + binary search. O(n log n) time, O(n) space

**Steps**
1. Sort `(value, index)` pairs.
2. For each position `k`, binary-search for `target − value[k]` in positions `k+1..n−1` only. Searching only to the right prevents matching an element with itself.
3. Map both positions back to their original indices.

```python
import bisect
def twoSum(nums, target):
    idx = sorted(range(len(nums)), key=nums.__getitem__)
    vals = [nums[i] for i in idx]
    for k, v in enumerate(vals):
        p = bisect.bisect_left(vals, target - v, k + 1)
        if p < len(vals) and vals[p] == target - v:
            return [idx[k], idx[p]]
```

**Correctness:** if the answer is at sorted positions `a < b`, the search at `k = a` scans `[a+1, n)`, which contains `b`. This approach is strictly worse than B (extra log factor, same space), but it is a good stepping stone in an interview.

### D. Ordered map / balanced BST. O(n log n) time, O(n) space

This is the same logic as E, but with `std::map` / `TreeMap` (a red-black tree) instead of a hash map. 83 C++ solutions use `std::map`.

```cpp
vector<int> twoSum(vector<int>& nums, int target) {
    map<long long, int> seen;                 // value -> index
    for (int i = 0; i < nums.size(); ++i) {
        auto it = seen.find((long long)target - nums[i]);
        if (it != seen.end()) return {it->second, i};
        seen[nums[i]] = i;
    }
    return {};
}
```

**When it matters:** you get a guaranteed O(log n) worst case per lookup (no hash-collision blow-up), and the map supports ordered queries. This makes it the natural base for "closest sum" or "count pairs below K".

### E. Two-pass hash map. O(n) average time, O(n) space

**Steps**
1. Pass 1: store `value → index` for every element. With duplicates, the later index wins.
2. Pass 2: for each `i`, look up `j = map[target − nums[i]]`. If it exists **and `j != i`**, return `[i, j]`.

```python
def twoSum(nums, target):
    pos = {x: i for i, x in enumerate(nums)}
    for i, x in enumerate(nums):
        j = pos.get(target - x)
        if j is not None and j != i:
            return [i, j]
```

**Correctness with duplicates:** for `[3,3]`, the map holds `3 → 1`. At `i = 0` the lookup gives `j = 1 ≠ 0`, which is correct. If `target/2` appears only once, the `j != i` check rejects the self-match.

### F. One-pass hash map (the expected optimal answer). O(n) average time, O(n) space

**Steps**
1. Start with an empty map `seen: value → index`.
2. For each `j, x`: if `target − x` is in `seen`, return `[seen[target − x], j]`.
3. Otherwise set `seen[x] = j`. Insert **after** checking.

```python
def twoSum(nums, target):
    seen = {}
    for j, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], j]
        seen[x] = j
```

```java
public int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> seen = new HashMap<>();
    for (int j = 0; j < nums.length; j++) {
        Integer i = seen.get(target - nums[j]);
        if (i != null) return new int[]{i, j};
        seen.put(nums[j], j);
    }
    return new int[0];
}
```

**Correctness:** let the answer be `(i, j)` with `i < j`. When the loop reaches `j`, index `i` has already been inserted. Because the answer is unique, no other index holds the value `nums[i]` before `j` (another copy would form a second valid pair), so `seen[target − nums[j]]` is exactly `i`. Also, no earlier `j' < j` can trigger a return, since that would be another valid pair. The lookup happens before inserting `nums[j]`, so an element is never matched with itself.

**Complexity notes:** O(1) *average* per hash operation, O(n) worst case under adversarial collisions (234 posts discuss this). The loop usually stops early.

### G. Hash map of value → list of indices. O(n) time, O(n) space

Store every index for every value. If `target − x == x`, you need at least two indices. Otherwise take the first index of each value. This is overkill for the unique-answer version, but it **generalises directly to "return all pairs"**.

```python
from collections import defaultdict
def twoSum(nums, target):
    where = defaultdict(list)
    for i, x in enumerate(nums):
        where[x].append(i)
    for x, ids in where.items():
        y = target - x
        if y == x and len(ids) >= 2:
            return ids[:2]
        if y != x and y in where:
            return [ids[0], where[y][0]]
```

### H. Hash set, then locate the indices. O(n) time, O(n) space

1. Use a set to find the two **values** `(a, b)`.
2. Do a second scan to find their indices, taking care that `j != i` when `a == b`.

This is popular in Python/JS solutions. Step 2 is where the `indexOf` bug lives (§6, M4).

### I. Hand-written hash table (C). O(n) average time, O(n) space

C has no built-in map, so C solutions implement one: separate chaining with `malloc`'d nodes, open addressing with linear probing, or the `uthash` macros. The algorithm is F. The interview-relevant points are:
- the table capacity is about 2n (keeps the load factor ≤ 0.5);
- the hash must handle **negative keys**, e.g. `((unsigned)key * 2654435761u) & mask` rather than `key % size`, which is negative for negative keys in C;
- a deleted/empty sentinel must not collide with real values, since 0 and −1 are valid values here.

### J. Direct-address (counting) array. O(n + R) time, O(R) space, where R = max − min

Use `table[value − min] = index` instead of a hash map. It is **not applicable to the stated constraints** (R up to 2×10^9), but it is the right answer to the follow-up "what if values are small, e.g. in [0, 10^5]?". It is faster than hashing, with no collisions.

### Summary

| Approach | Time | Extra space | Keeps original indices? | Notes |
|---|---|---|---|---|
| A Brute force | O(n²) | O(1) | yes | Baseline; accepted at n ≤ 10^4 |
| B Sort + two pointers | O(n log n) | O(n) | only if you sort indices or pairs | O(1) if already sorted (#167) |
| C Sort + binary search | O(n log n) | O(n) | same as B | Strictly dominated by B |
| D Ordered map | O(n log n) | O(n) | yes | Guaranteed worst case |
| E Two-pass hash | O(n) avg | O(n) | yes | Needs the `j != i` check |
| **F One-pass hash** | **O(n) avg** | **O(n)** | yes | **Expected answer** |
| G Value → index list | O(n) | O(n) | yes | Generalises to all pairs |
| H Set, then locate | O(n) | O(n) | yes | Watch duplicate indices |
| I Custom hash (C) | O(n) avg | O(n) | yes | Negative keys, sentinels |
| J Direct address | O(n + R) | O(R) | yes | Only for small value ranges |

---

## 6. Common mistakes

Each wrong version below is implemented in `approaches.py`. The failing test IDs come from the actual run.

| # | Mistake | Why it fails | Counterexample (test ID) | Tests failed |
|---|---|---|---|---|
| M1 | **Insert before checking** in the one-pass map (`seen[x]=j; if target-x in seen`) | `x` can match itself when `x == target/2` | `[3,2,4], 6` → returns `[0,0]` (`ex2`); also `[3,3]` | 10 / 37 |
| M2 | Two-pass map **without `j != i`** | Pairs an element with itself | `[3,2,4], 6` → `[0,0]` (`ex2`); `[5,1,9], 10` (`e_half_once`) | 2 / 37 |
| M3 | **Sort the values and return the sorted positions** | Sorting destroys the original indices, so the output describes the sorted array | `[3,2,4], 6` → `[0,2]` instead of `[1,2]` (`ex2`) | 25 / 37 |
| M4 | Sort, then map values back with **`indexOf`/`index()`** | Equal values return the same (first) index twice | `[3,3], 6` → `[0,0]` (`ex3`); `[4,9,4], 8` (`e_indexof_dup`) | 6 / 37 |
| M5 | Check **only adjacent** elements, or assume the pair is consecutive | The pair can be anywhere | `[4,1,5,3,6], 10` → indices 0 and 4 (`e_first_last`) | 13 / 37 |
| M6 | **Prune `x > target`** ("too big to be part of the sum") | Negative numbers break it: −5 + −7 = −12, yet −5 > −12 | `[-5,-7], -12` (`e_min_len_neg`); all-negative inputs | 9 / 37 |
| M7 | `x in nums[i+1:]` and believing it's O(n) | Slicing and membership are both O(n), so the whole thing is O(n²) time and makes an O(n) copy per step | Correct output, but quadratic on `p_*` cases | 0 (slow) |
| M8 | Using a **set** of values and losing duplicates | `{3,3}` collapses to `{3}`, so `[3,3], 6` can't be answered unless indices are tracked | `ex3` (if index tracking is dropped) | (variant-dependent) |
| — | *Misconception:* "32-bit overflow gives wrong answers" | Wrapped sums can't equal any target in `[-10^9, 10^9]` (see §4). The code still has **UB in C/C++**, so fix it with 64-bit math anyway. | `e_big_pos`, `e_complement_overflow`, `p_overflow_bulk` all *pass* with wrapped `int32` | 0 |

---

## 7. Hints, in increasing strength

1. A brute-force solution that checks every pair is correct. What does it cost, and which work is repeated?
2. Fix one number `x`. You aren't looking for "any pair" any more; you're looking for one specific value. Which value?
3. You need to answer "have I seen value `target − x` before, and where?" quickly. Which data structure gives fast lookup by value?
4. Store each number's index in a hash map as you scan. For each new `x`, look up `target − x` **before** inserting `x`, so an element can't pair with itself.
5. (Alternative path) If you could sort while keeping the original indices, how would the smallest and largest remaining elements tell you which pointer to move?

---

## 8. Tests

The full suite is in a separate file: **`two-sum_tests.json`** (37 cases). **`two-sum_tests_leetcode_paste.txt`** holds the small cases in LeetCode's "custom testcase" format (one line `nums`, one line `target`), ready to paste into the editor. **`run_tests.py`** runs any solution against the suite: `python run_tests.py my_solution.py`.

- **Public (3):** the three examples from the problem statement.
- **Hidden (34):** a generated suite, because LeetCode doesn't publish its hidden tests. Each case is validated against the constraints, checked to have **exactly one** valid pair, and its expected output is confirmed by an independent brute-force solver.

| Category | Count | What it covers |
|---|---|---|
| example | 3 | Statement examples (public) |
| normal | 5 | Unsorted, ascending, descending, answer skipping index 0, last-two-only |
| edge-size | 2 | Minimum length n = 2 (positive and negative) |
| edge-position | 2 | Answer at indices (0, n−1) and (0, 1) |
| edge-same-element | 2 | `target/2` present once (must not self-pair) and twice (must pair the copies) |
| edge-zero | 2 | Two zeros with target 0; 0 paired with `target` |
| edge-negative | 3 | All negative, `x + (−x)`, negative target from mixed signs |
| edge-duplicates | 2 | Repeated values that are not part of the answer |
| edge-overflow | 6 | Values and targets at ±10^9; sums and complements outside the 32-bit range |
| edge-sorting | 2 | Sorted positions differ from original ones; equal values breaking `indexOf` |
| performance | 8 | n = 10^4: pair at end / start / ends / random; 9,998 duplicates; consecutive ±1..10^4; values near 10^9 |

Outputs are compared order-insensitively (`sorted(out) == expected`), and must be two distinct indices.

---

## 9. Follow-up questions

| # | Question | Expected answer points | What it checks |
|---|---|---|---|
| F1 | Can you beat O(n²)? *(official)* | One-pass hash map, O(n) average time, O(n) space. Mention sort + two pointers at O(n log n) as an alternative. | Recognising the time-for-space trade-off |
| F2 | What are the time and space complexities, exactly? | O(n) **average**; worst case O(n²) with adversarial hash collisions; O(n) space. An ordered map gives a guaranteed O(n log n). | Precision about average vs. worst case |
| F3 | Why check before inserting? | Prevents pairing an element with itself when `x == target/2`. Show `[3,2,4], 6`. | Off-by-one / self-match reasoning |
| F4 | What if duplicates exist? *(the most-upvoted interview question in the discussion)* | Duplicates are fine. The map keeps one index per value, and the second copy finds the first. With a unique answer, overwriting doesn't matter. | Reasoning about map semantics on duplicate keys |
| F5 | What if the array is sorted? | Two pointers, O(n) time, **O(1)** space (Two Sum II, #167). | Exploiting structure to save space |
| F6 | What if you must use O(1) extra space and may modify the input? | Sort in place + two pointers: O(n log n). Indices are then lost unless sorting indices (O(n) space), so ask whether values suffice. | Trade-offs under constraints |
| F7 | What if the array is read-only and memory is O(1)? | Brute force, O(n²), is the only general option. Note the lower-bound intuition. | Understanding the limits of each approach |
| F8 | What if there may be no solution? | Return `[]` / `[-1,-1]` / throw, as agreed. The loop must terminate cleanly. | Defensive API design |
| F9 | What if there are multiple valid pairs? | Clarify: first found, lexicographically smallest, or all of them. Approach G or sort + two pointers handle "all". | Requirements clarification |
| F10 | Return **all** pairs, or all **unique value** pairs? | All index pairs: O(n + k), where k is the output size, using value → index lists. Unique value pairs: sort + two pointers, skipping duplicates, or a hash set of seen values plus a set of used values. | Output-sensitive complexity; duplicate handling |
| F11 | **Count** the pairs that sum to target. | Hash map of counts: for each `x`, add `count[target − x]`, then increment `count[x]`. O(n). | Turning search into counting |
| F12 | Pairs with sum **≤ K** / **< K**, or the maximum sum < K (#1099)? | Sort + two pointers: when `nums[lo] + nums[hi] <= K`, add `hi − lo` pairs and move `lo++`. O(n log n). | Recognising when hashing stops working |
| F13 | The pair whose sum is **closest** to target? | Sort + two pointers tracking the best |diff|. O(n log n). | Same as above |
| F14 | **3Sum / kSum?** | Sort, fix one element, run two pointers: O(n²) for 3Sum; O(n^(k−1)) for kSum by recursion. | Generalising the pattern |
| F15 | Numbers arrive in a **stream**; support `add(x)` and `find(t)` (Two Sum III, #170). | Trade-off: a hash of counts gives `add` O(1) and `find` O(n); a set of all pairwise sums gives `add` O(n) and `find` O(1). Choose by the read/write ratio. | Data-structure design for a workload |
| F16 | Input is a **BST** (Two Sum IV, #653)? | In-order traversal into a sorted list plus two pointers, or DFS with a hash set. O(n). Or use two BST iterators (forward and reverse) for O(h) space. | Transferring the idea to trees |
| F17 | Data **doesn't fit in memory** / is distributed? | External sort + two-pointer merge pass; or hash-partition by `x mod P` with complement partition `(target − x) mod P`, then solve each partition pair. | Scaling and partitioning |
| F18 | Values in a **small range** (e.g. 0..10^5)? | Direct-address array instead of a hash map: no hashing, cache-friendly. | Choosing structures from constraints |
| F19 | Could `nums[i] + nums[j]` overflow? | Yes, in 32-bit (up to ±2×10^9). Here it can't produce a wrong match (wrapped values are out of range), but it's UB in C/C++; use 64-bit arithmetic. | Integer-range awareness |
| F20 | Adversarial inputs vs. your hash map? | Hash flooding can force O(n²). Mitigations: randomised hashing, a tree fallback (Java 8+ treeifies buckets), or an ordered map. | Production robustness |

---

## 10. Variants

| Variant | Change | Expected approach | Complexity |
|---|---|---|---|
| Two Sum II (#167) | Sorted input, 1-indexed, O(1) space required | Two pointers | O(n) time, O(1) space |
| Two Sum III (#170) | Streaming `add`/`find` | Hash of counts (cheap `add`) or set of sums (cheap `find`) | Depends on workload |
| Two Sum IV (#653) | Input is a BST; return true/false | DFS + hash set, or in-order two pointers / two BST iterators | O(n) time; O(h) space with iterators |
| Two Sum Less Than K (#1099) | Max sum strictly < K | Sort + two pointers | O(n log n) |
| Count pairs = target | Count instead of finding | Hash of counts | O(n) |
| All unique value pairs | Every distinct `(a, b)` | Sort + two pointers, skipping duplicates | O(n log n) |
| Closest sum | Minimise `|a + b − target|` | Sort + two pointers | O(n log n) |
| 3Sum (#15) / 4Sum (#18) / kSum | More addends | Sort + fixed outer loops + two pointers | O(n^(k−1)) |
| Two Sum with a difference | Find `a − b = target` | Hash lookup of `x + target` and `x − target` | O(n) |
| Two Sum in two arrays | One element from each array | Hash one array, scan the other; or sort both + two pointers | O(n + m) |
| Huge / external data | Doesn't fit in memory | External sort + merge, or hash partitioning | O(n log n) I/O-bound |

---

## 11. Evaluation guidance

**Strong understanding**
- Asks the clarifying questions in §4 before coding: duplicates, same element twice, uniqueness or absence of an answer, negatives, sortedness, output order.
- States brute force first with its complexity, then motivates the hash map ("fix `x` and look for `target − x`").
- Writes the one-pass hash map correctly, with lookup **before** insert, and can explain why that order matters using `[3,2,4], 6`.
- Gives **average vs. worst-case** complexity for hashing, and knows the ordered-map alternative.
- Handles duplicates correctly and explains *why* overwriting the map entry is harmless here.
- Tests mentally against Example 2, `[3,3]`, negatives and the n = 2 edge case.
- Answers follow-ups F5, F10, F11 and F14 fluently, and knows when hashing must be replaced by sorting (≤ K, closest, unique pairs).

**Partial understanding**
- Reaches the hash map but inserts before checking (M1), or forgets `j != i` in the two-pass version (M2), and fixes it when prompted with an example.
- Gives "O(n)" without mentioning the average case or the O(n) space.
- Proposes sorting but loses the original indices (M3) and needs a hint to sort index pairs.
- Can't adapt to the variants beyond Two Sum II.

**Incorrect reasoning**
- Claims the `x in nums[i+1:]` / `indexOf` version is O(n) (M7).
- Prunes `x > target` (M6), assuming non-negative input.
- Uses `indexOf` after sorting and gets `[0,0]` on `[3,3]` (M4).
- Says a value set alone is enough, losing duplicate positions (M8).
- Believes 32-bit overflow produces wrong answers here, or conversely believes overflow is "fine" in C++ (it's UB).
- Returns values instead of indices, or indices of the sorted array.
