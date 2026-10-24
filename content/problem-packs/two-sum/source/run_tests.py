"""Run a Two Sum solution against two-sum_tests.json.

Usage:
    python run_tests.py my_solution.py            # all cases
    python run_tests.py my_solution.py --public   # only the 3 public examples
    python run_tests.py my_solution.py --category edge-overflow

my_solution.py may define either a LeetCode-style `class Solution` with
`twoSum(self, nums, target)`, or a plain function `twoSum(nums, target)`.
A result is accepted in any order, must be two distinct valid indices,
and must equal the unique expected pair.
"""
import argparse
import importlib.util
import json
import os
import time
from typing import List  # noqa: F401  (so LeetCode-style annotations resolve)


def load_solver(path):
    spec = importlib.util.spec_from_file_location("user_solution", path)
    mod = importlib.util.module_from_spec(spec)
    mod.__dict__["List"] = List
    spec.loader.exec_module(mod)
    if hasattr(mod, "Solution"):
        return mod.Solution().twoSum
    if hasattr(mod, "twoSum"):
        return mod.twoSum
    raise SystemExit("No `Solution.twoSum` or `twoSum` found in " + path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("solution")
    ap.add_argument("--tests", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "two-sum_tests.json"))
    ap.add_argument("--public", action="store_true")
    ap.add_argument("--category")
    a = ap.parse_args()

    solve = load_solver(a.solution)
    cases = json.load(open(a.tests))["cases"]
    if a.public:
        cases = [c for c in cases if c["visibility"] == "public"]
    if a.category:
        cases = [c for c in cases if c["category"] == a.category]

    passed = 0
    for c in cases:
        nums, target = list(c["input"]["nums"]), c["input"]["target"]
        t0 = time.perf_counter()
        try:
            out = solve(nums, target)
            err = None
        except Exception as e:  # noqa: BLE001
            out, err = None, repr(e)
        dt = time.perf_counter() - t0
        n = len(c["input"]["nums"])
        good = (err is None and out is not None and len(out) == 2 and out[0] != out[1]
                and sorted(out) == c["expected"])
        passed += good
        shown = c["input"]["nums"] if n <= 12 else f"<{n} numbers>"
        status = "PASS" if good else "FAIL"
        line = f"{status} {c['id']:22s} {dt*1000:8.1f} ms  [{c['category']}]"
        if not good:
            line += f"\n     nums={shown} target={c['input']['target']}\n     expected={c['expected']} got={out if err is None else err}\n     why: {c['description']}"
        print(line)
    print(f"\n{passed}/{len(cases)} passed")


if __name__ == "__main__":
    main()
