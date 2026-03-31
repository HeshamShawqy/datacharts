"""
List Partitioner - Grasshopper Script Component

Splits a flat list or DataTree into N equal branches.
For DataTree input, each branch is partitioned independently into N sub-branches.
If the item count is not evenly divisible by N, the last branch gets the remainder.

INPUTS:
  data : DataTree / List  - items to partition
  n    : int              - number of output partitions per branch

OUTPUTS:
  out  : DataTree         - partitioned data, one branch per partition
  info : str              - summary message
"""

import math
import System
import Grasshopper
from Grasshopper import DataTree
from Grasshopper.Kernel.Data import GH_Path

out  = DataTree[object]()
info = ""

# ── helpers ───────────────────────────────────────────────────────────────────

def _is_tree(x):
    return x is not None and hasattr(x, "Branches") and hasattr(x, "Paths")


def _partition(items, n):
    """Split a list into n chunks. Last chunk may be smaller."""
    total = len(items)
    if n <= 0 or total == 0:
        return []
    chunk_size = math.ceil(total / n)
    chunks = []
    for i in range(n):
        start = i * chunk_size
        if start >= total:
            break
        chunks.append(items[start : start + chunk_size])
    return chunks


def _make_path(*indices):
    """Build a GH_Path from a sequence of ints."""
    arr = System.Array[int](list(indices))
    return GH_Path(arr)


# ── main ──────────────────────────────────────────────────────────────────────

try:
    _n = int(n) if n is not None else 1
    if _n < 1:
        _n = 1

    total_items   = 0
    total_branches = 0

    if _is_tree(data):
        # each existing branch gets split into _n sub-branches
        for path, branch in zip(data.Paths, data.Branches):
            items  = [i for i in branch if i is not None]
            chunks = _partition(items, _n)
            base   = list(path.Indices)
            for idx, chunk in enumerate(chunks):
                new_path = _make_path(*(base + [idx]))
                for item in chunk:
                    out.Add(item, new_path)
            total_items   += len(items)
            total_branches += len(chunks)

    elif data is not None:
        # flat list → split into _n top-level branches {0}, {1}, …
        items  = [i for i in data if i is not None]
        chunks = _partition(items, _n)
        for idx, chunk in enumerate(chunks):
            path = _make_path(idx)
            for item in chunk:
                out.Add(item, path)
        total_items   = len(items)
        total_branches = len(chunks)

    if total_items > 0:
        info = "OK | {} items → {} branches".format(total_items, total_branches)
    else:
        info = "waiting for data..."

except Exception as ex:
    import traceback
    info = "ERROR: " + traceback.format_exc()
