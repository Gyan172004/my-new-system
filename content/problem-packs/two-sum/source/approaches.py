"""Reference implementations of every Two Sum approach (correct and incorrect),
run against two-sum_tests.json. Incorrect ones are expected to fail and the
first failing case is reported as the counterexample."""
import bisect
import ctypes
import json
import sys
import time
from collections import defaultdict


# ---------------------------------------------------------------- correct
def brute_force(nums, target):
    n = len(nums)
    for i in range(n):
        for j in range(i + 1, n):
            if nums[i] + nums[j] == target:
                return [i, j]


def brute_force_lookup_rest(nums, target):          # "x in nums[i+1:]" – still O(n^2)
    for i, x in enumerate(nums):
        need = target - x
        rest = nums[i + 1:]
        if need in rest:
            return [i, i + 1 + rest.index(need)]


def sort_two_pointers(nums, target):
    idx = sorted(range(len(nums)), key=nums.__getitem__)
    lo, hi = 0, len(idx) - 1
    while lo < hi:
        s = nums[idx[lo]] + nums[idx[hi]]
        if s == target:
            return sorted([idx[lo], idx[hi]])
        if s < target:
            lo += 1
        else:
            hi -= 1


def sort_binary_search(nums, target):
    idx = sorted(range(len(nums)), key=nums.__getitem__)
    vals = [nums[i] for i in idx]
    for k, v in enumerate(vals):
        p = bisect.bisect_left(vals, target - v, k + 1)  # search only to the right of k
        if p < len(vals) and vals[p] == target - v:
            return sorted([idx[k], idx[p]])


def two_pass_hash(nums, target):
    pos = {x: i for i, x in enumerate(nums)}          # last index of each value
    for i, x in enumerate(nums):
        j = pos.get(target - x)
        if j is not None and j != i:
            return [i, j]


def one_pass_hash(nums, target):
    seen = {}
    for j, x in enumerate(nums):
        i = seen.get(target - x)
        if i is not None:
            return [i, j]
        seen[x] = j


def hash_value_to_indices(nums, target):
    where = defaultdict(list)
    for i, x in enumerate(nums):
        where[x].append(i)
    for x, ids in where.items():
        y = target - x
        if y == x and len(ids) >= 2:
            return ids[:2]
        if y != x and y in where:
            return sorted([ids[0], where[y][0]])


def set_then_locate(nums, target):                   # find the values first, then their indices
    seen = set()
    a = b = None
    for x in nums:
        if target - x in seen:
            a, b = target - x, x
            break
        seen.add(x)
    i = nums.index(a)
    j = next(k for k in range(len(nums)) if nums[k] == b and k != i)
    return sorted([i, j])


def counting_offset_array(nums, target):             # direct addressing; only when value range is small
    lo, hi = min(nums), max(nums)
    if hi - lo > 2_000_000:                          # not applicable to the full ±1e9 range
        return one_pass_hash(nums, target)
    table = [-1] * (hi - lo + 1)
    for j, x in enumerate(nums):
        y = target - x
        if lo <= y <= hi and table[y - lo] != -1:
            return [table[y - lo], j]
        table[x - lo] = j


def combinations_brute(nums, target):                # itertools.combinations – brute force in disguise
    from itertools import combinations
    for i, j in combinations(range(len(nums)), 2):
        if nums[i] + nums[j] == target:
            return [i, j]


def ordered_map_bst(nums, target):                   # balanced-BST map (C++ std::map / Java TreeMap), O(n log n)
    keys, val = [], {}                               # sorted keys simulate the BST; lookups are O(log n)
    for j, x in enumerate(nums):
        need = target - x
        p = bisect.bisect_left(keys, need)
        if p < len(keys) and keys[p] == need:
            return [val[need], j]
        if x not in val:
            bisect.insort(keys, x)
            val[x] = j


def open_addressing_hash(nums, target):              # hand-rolled hash table (what C solutions do)
    cap = 1
    while cap < 2 * len(nums):
        cap <<= 1
    keys, vals, used = [0] * cap, [0] * cap, [False] * cap
    mask = cap - 1

    def slot(k):
        h = (k * 0x9E3779B1) & 0xFFFFFFFF          # multiplicative hash; handles negatives
        return h & mask

    for j, x in enumerate(nums):
        need = target - x
        s = slot(need)
        while used[s]:                               # linear probing lookup
            if keys[s] == need:
                return [vals[s], j]
            s = (s + 1) & mask
        s = slot(x)
        while used[s] and keys[s] != x:
            s = (s + 1) & mask
        if not used[s]:
            used[s], keys[s], vals[s] = True, x, j


# ---------------------------------------------------------------- wrong (common mistakes)
def wrong_store_before_check(nums, target):          # inserts x before looking for target-x
    seen = {}
    for j, x in enumerate(nums):
        seen[x] = j
        if target - x in seen:
            return [seen[target - x], j]


def wrong_two_pass_no_self_check(nums, target):      # forgets j != i
    pos = {x: i for i, x in enumerate(nums)}
    for i, x in enumerate(nums):
        if target - x in pos:
            return [i, pos[target - x]]


def wrong_sort_returns_sorted_positions(nums, target):
    s = sorted(nums)
    lo, hi = 0, len(s) - 1
    while lo < hi:
        t = s[lo] + s[hi]
        if t == target:
            return [lo, hi]
        lo, hi = (lo + 1, hi) if t < target else (lo, hi - 1)


def wrong_indexof_after_sort(nums, target):          # maps values back with index(): fails on equal values
    s = sorted(nums)
    lo, hi = 0, len(s) - 1
    while lo < hi:
        t = s[lo] + s[hi]
        if t == target:
            return sorted([nums.index(s[lo]), nums.index(s[hi])])
        lo, hi = (lo + 1, hi) if t < target else (lo, hi - 1)


def wrong_int32_sum(nums, target):                   # C++/Java `int` sum: overflow wraps
    n = len(nums)
    for i in range(n):
        for j in range(i + 1, n):
            if ctypes.c_int32(nums[i] + nums[j]).value == target:
                return [i, j]


def wrong_adjacent_only(nums, target):               # only checks neighbours
    for i in range(len(nums) - 1):
        if nums[i] + nums[i + 1] == target:
            return [i, i + 1]


def wrong_early_break_positive(nums, target):        # "skip x > target" – assumes non-negative values
    for i, x in enumerate(nums):
        if x > target:
            continue
        for j in range(i + 1, len(nums)):
            if x + nums[j] == target:
                return [i, j]


MISCONCEPTION = [wrong_int32_sum]  # passes: wrapped sums never land in [-1e9, 1e9]
CORRECT = [brute_force, brute_force_lookup_rest, sort_two_pointers, sort_binary_search,
           two_pass_hash, one_pass_hash, hash_value_to_indices, set_then_locate, counting_offset_array,
           combinations_brute, ordered_map_bst, open_addressing_hash]
WRONG = [wrong_store_before_check, wrong_two_pass_no_self_check, wrong_sort_returns_sorted_positions,
         wrong_indexof_after_sort, wrong_adjacent_only, wrong_early_break_positive]


def ok(out, nums, target):
    return (isinstance(out, list) and len(out) == 2 and out[0] != out[1]
            and all(0 <= k < len(nums) for k in out) and nums[out[0]] + nums[out[1]] == target)


def main(path="two-sum_tests.json"):
    cases = json.load(open(path))["cases"]
    report = {}
    for fn in CORRECT + WRONG + MISCONCEPTION:
        t0 = time.perf_counter()
        fails = []
        for c in cases:
            nums, target = c["input"]["nums"], c["input"]["target"]
            out = fn(nums, target)
            good = ok(out, nums, target) and sorted(out) == c["expected"]
            if not good:
                fails.append((c["id"], out))
        dt = time.perf_counter() - t0
        report[fn.__name__] = {"passed": len(cases) - len(fails), "total": len(cases),
                               "first_fail": fails[0] if fails else None,
                               "fail_ids": [f[0] for f in fails], "seconds": round(dt, 3)}
        tag = "OK  " if not fails else "FAIL"
        print(f"{tag} {fn.__name__:38s} {len(cases)-len(fails):3d}/{len(cases)}  {dt:7.3f}s  "
              f"{'' if not fails else 'e.g. ' + str(fails[0][0]) + ' -> ' + str(fails[0][1])}")
    json.dump(report, open("approach_results.json", "w"), indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:])
