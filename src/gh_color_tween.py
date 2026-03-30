"""
GH Color Tween
Interpolates between input colours to produce a smooth gradient list.

INPUTS:
  colors  - DataTree / List Color  — gradient stop colours per branch
  count   - Item / List int        — number of output colours
                                     single value  → applied to every branch
                                     list / tree   → one per branch
OUTPUT:
  a       - DataTree / List Color  — interpolated result (same tree structure as input)
"""

import System.Drawing as sd
import traceback

# ── helpers ───────────────────────────────────────────────────────────────────

def _is_tree(x):
    return x is not None and hasattr(x, 'Branches') and hasattr(x, 'Paths')

def _lerp_color(c1, c2, t):
    return sd.Color.FromArgb(
        int(round(c1.A + (c2.A - c1.A) * t)),
        int(round(c1.R + (c2.R - c1.R) * t)),
        int(round(c1.G + (c2.G - c1.G) * t)),
        int(round(c1.B + (c2.B - c1.B) * t))
    )

def _tween(stops, n):
    stops = [s for s in stops if s is not None]
    if not stops or n <= 0: return []
    if n == 1:              return [stops[0]]
    if len(stops) == 1:     return [stops[0]] * n
    result = []
    for i in range(n):
        t   = i / (n - 1)
        seg = t * (len(stops) - 1)
        idx = min(int(seg), len(stops) - 2)
        result.append(_lerp_color(stops[idx], stops[idx + 1], seg - idx))
    return result

# ── main ──────────────────────────────────────────────────────────────────────

a = []

try:
    _colors = globals().get("colors")
    _count  = globals().get("count")

    # normalise count → flat list (one int per branch, or single broadcast value)
    if   _count is None:                                       counts = []
    elif isinstance(_count, (int, float)):                     counts = [int(_count)]
    elif _is_tree(_count):
        counts = [int(i) for b in _count.Branches for i in b if i is not None]
    else:
        counts = [int(i) for i in _count if i is not None]

    def _get_n(branch_idx):
        if not counts:           return 10
        if len(counts) == 1:     return counts[0]
        return counts[branch_idx] if branch_idx < len(counts) else counts[-1]

    if _is_tree(_colors):
        import Grasshopper as gh
        out_tree = gh.DataTree[sd.Color]()
        for i, (path, branch) in enumerate(zip(_colors.Paths, _colors.Branches)):
            for c in _tween(list(branch), _get_n(i)):
                out_tree.Add(c, path)
        a = out_tree
    else:
        stops = [c for c in (_colors or []) if c is not None]
        a = _tween(stops, _get_n(0))

except Exception:
    a = []
