"""
GH Color Map
Maps a list of values to gradient colours using a defined domain.

INPUTS:
  colors  - DataTree / List Color  — gradient stop colours per branch
  values  - DataTree / List float  — values to map to colours
  domain  - Item / List float      — [min, max] domain bounds
                                     two numbers: explicit min/max
                                     omit / None: auto-computed from values
OUTPUT:
  gradient       - DataTree / List Color  — colour per input value (same tree structure as values)
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

def _map_value(stops, t):
    """Map a normalised t in [0,1] to a colour across the gradient stops."""
    if len(stops) == 1:
        return stops[0]
    t = max(0.0, min(1.0, t))
    seg = t * (len(stops) - 1)
    idx = min(int(seg), len(stops) - 2)
    return _lerp_color(stops[idx], stops[idx + 1], seg - idx)

def _normalise(value, lo, hi):
    if hi == lo:
        return 0.0
    return (value - lo) / (hi - lo)

def _map_branch(stops, vals, lo, hi):
    stops = [s for s in stops if s is not None]
    if not stops:
        return []
    return [_map_value(stops, _normalise(float(v), lo, hi)) for v in vals if v is not None]

def _parse_domain(domain_input, fallback_vals):
    """Return (lo, hi) from domain input, falling back to value extents."""
    flat = []
    if domain_input is not None:
        if isinstance(domain_input, (int, float)):
            flat = [float(domain_input)]
        elif _is_tree(domain_input):
            flat = [float(i) for b in domain_input.Branches for i in b if i is not None]
        else:
            try:
                flat = [float(i) for i in domain_input if i is not None]
            except TypeError:
                flat = []

    if len(flat) >= 2:
        return float(flat[0]), float(flat[1])

    # auto-compute from values
    nums = [float(v) for v in fallback_vals if v is not None]
    if not nums:
        return 0.0, 1.0
    return min(nums), max(nums)

# ── main ──────────────────────────────────────────────────────────────────────

gradient = []

try:
    _colors = globals().get("colors")
    _values = globals().get("values")
    _domain = globals().get("domain")

    # ── collect all values for auto-domain ──────────────────────────────────
    if _is_tree(_values):
        _all_vals = [v for b in _values.Branches for v in b if v is not None]
    elif _values is not None:
        try:
            _all_vals = list(_values)
        except TypeError:
            _all_vals = [_values]
    else:
        _all_vals = []

    lo, hi = _parse_domain(_domain, _all_vals)

    # ── resolve colour stops ─────────────────────────────────────────────────
    if _is_tree(_colors):
        _color_branches = [list(b) for b in _colors.Branches]
    elif _colors is not None:
        try:
            _color_branches = [list(_colors)]
        except TypeError:
            _color_branches = [[_colors]]
    else:
        _color_branches = [[]]

    def _get_stops(branch_idx):
        if not _color_branches:
            return []
        if len(_color_branches) == 1:
            return _color_branches[0]
        return _color_branches[branch_idx] if branch_idx < len(_color_branches) else _color_branches[-1]

    # ── map values ──────────────────────────────────────────────────────────
    if _is_tree(_values):
        import Grasshopper as gh
        out_tree = gh.DataTree[sd.Color]()
        for i, (path, branch) in enumerate(zip(_values.Paths, _values.Branches)):
            for c in _map_branch(_get_stops(i), list(branch), lo, hi):
                out_tree.Add(c, path)
        gradient = out_tree
    else:
        vals = [v for v in (_values or []) if v is not None]
        gradient = _map_branch(_get_stops(0), vals, lo, hi)

except Exception:
    gradient = []
