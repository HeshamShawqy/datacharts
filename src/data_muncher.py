"""
Data Muncher - Grasshopper Dashboard Component
Rhino 8 Script Component

INPUTS:
  names      : DataTree / List str    - display labels
  values     : DataTree / List float  - numeric values
  parents    : DataTree / List str    - grouping category (optional)
               Case A: same branch count & item count as names/values → 1-to-1
               Case B: same branch count, 1 item per branch → broadcast
  colors     : DataTree / List Color  - per-item colours (optional, same Cases A/B)
  chart_type : str   - treemap | bar | pack | pie | sunburst | sankey
  title      : str
  subtitle   : str
  units      : str   - value units label (default: m²)
  enable     : bool  - show viewport overlay
  x          : int   - viewport overlay X
  y          : int   - viewport overlay Y
  chart_size : int   - export bitmap width (px)
  font_scale : float
  viewport   : str   - Rhino viewport name (blank = Perspective)
  trigger    : object

OUTPUTS:
  a          : str   - status message
"""

a = "initializing..."

_PFX = "DMUNCH_"

try:
    import json, os, datetime, threading, traceback
    import scriptcontext as sc
    import Rhino
    import Rhino.Display as rd
    import System.Drawing as sd
    import System.IO
    import System
    import Grasshopper
    from http.server import HTTPServer, SimpleHTTPRequestHandler
except Exception as ex:
    a = "IMPORT ERROR: " + str(ex)
    raise


def _get_pkg_dir():
    return r"D:\00_HS\GSS24\code\New folder\datacharts\web"


def _ensure_work_dir(port):
    return _get_pkg_dir()


# ── DataTree helpers ──────────────────────────────────────────────────────────

def _is_tree(x):
    return x is not None and hasattr(x, 'Branches') and hasattr(x, 'Paths')

def _tree_branches(x):
    """DataTree → ordered list of (path_str, [non-None items])"""
    return [(str(p), [i for i in b if i is not None])
            for p, b in zip(x.Paths, x.Branches)]

def _flat_branches(x):
    """Flat list → [("flat", [non-None items])]"""
    return [("flat", [i for i in (x or []) if i is not None])]

def _color_to_hex(c):
    try:    return "#{:02x}{:02x}{:02x}".format(int(c.R), int(c.G), int(c.B))
    except: return None

def build_rows(names_raw, values_raw, parents_raw, colors_raw=None):
    """Always yields leaf-level rows {name, value, ?parent, ?color}.

    Parent/color matching per branch:
      Case A – same item count as names/values → 1-to-1
      Case B – exactly 1 item per branch       → broadcast to all items
    """
    n_branches = _tree_branches(names_raw)  if _is_tree(names_raw)  else _flat_branches(names_raw)
    v_branches = _tree_branches(values_raw) if _is_tree(values_raw) else _flat_branches(values_raw)

    if _is_tree(parents_raw):
        _p_branches = _tree_branches(parents_raw)
        p_map = dict(_p_branches)
    elif parents_raw:
        _p_branches = _flat_branches(parents_raw)
        p_map = dict(_p_branches)
    else:
        _p_branches = []
        p_map = {}

    if _is_tree(colors_raw):
        _c_branches = _tree_branches(colors_raw)
        c_map = dict(_c_branches)
    elif colors_raw:
        _c_branches = _flat_branches(colors_raw)
        c_map = dict(_c_branches)
    else:
        _c_branches = []
        c_map = {}

    v_map = dict(v_branches)
    rows  = []

    def _resolve(raw, count, to_str=True):
        """Apply Case A / Case B / empty for any optional per-branch list."""
        if len(raw) == 1:       return ([str(raw[0])] if to_str else [raw[0]]) * count
        elif len(raw) >= count: return ([str(r) for r in raw[:count]] if to_str else list(raw[:count]))
        else:                   return ([""] * count if to_str else [None] * count)

    def _lookup(mp, branches, path, i):
        """Path match first, then flat fallback, then index fallback."""
        r = mp.get(path)
        if r is not None: return r
        r = mp.get("flat")
        if r is not None: return r
        if i < len(branches): return branches[i][1]
        return []

    for i, (path, n_list) in enumerate(n_branches):
        v_list = v_map.get(path, v_branches[i][1] if i < len(v_branches) else [])
        count  = min(len(n_list), len(v_list))
        if count == 0:
            continue

        p_list = _resolve(_lookup(p_map, _p_branches, path, i), count, to_str=True)
        c_list = _resolve(_lookup(c_map, _c_branches, path, i), count, to_str=False)

        for n, v, p, c in zip(n_list[:count], v_list[:count], p_list, c_list):
            try:
                row = {"name": str(n), "value": float(v)}
                if str(p).strip():
                    row["parent"] = str(p).strip()
                hex_c = _color_to_hex(c) if c is not None else None
                if hex_c:
                    row["color"] = hex_c
                rows.append(row)
            except (ValueError, TypeError):
                pass

    return rows


# ── Main ──────────────────────────────────────────────────────────────────────

try:
    g = globals()
    _names      = g.get("names")
    _values     = g.get("values")
    _parents    = g.get("parents")
    _colors     = g.get("colors")
    _chart_type = str(g.get("chart_type") or "treemap").lower()
    _title      = str(g.get("title")      or "Grasshopper Dashboard")
    _subtitle   = str(g.get("subtitle")   or "Live Data Feed")
    _units      = str(g.get("units")      or "m²")
    _font_scale = float(g.get("font_scale") or 1.0)
    _enable     = g.get("enable", True)
    _x          = int(g.get("x") or 20)
    _y          = int(g.get("y") or 60)
    _w          = int(g.get("chart_size") or 500)
    _viewport   = str(g.get("viewport") or "").strip()

    sc.sticky[_PFX + "ENABLED"]  = bool(_enable)
    sc.sticky[_PFX + "X"]        = _x
    sc.sticky[_PFX + "Y"]        = _y
    sc.sticky[_PFX + "W"]        = _w
    sc.sticky[_PFX + "VIEWPORT"] = _viewport

    # grab a free port once per session
    if _PFX + "PORT" not in sc.sticky:
        import socket as _sock
        with _sock.socket() as _s:
            _s.bind(('', 0))
            sc.sticky[_PFX + "PORT"] = _s.getsockname()[1]
    PORT = sc.sticky[_PFX + "PORT"]
    URL  = "http://127.0.0.1:{}".format(PORT)

    WORK_DIR    = _ensure_work_dir(PORT)
    OUTPUT_JSON = os.path.join(WORK_DIR, "gh_dashboard.json")

    if _PFX + "LOCK" not in sc.sticky:
        sc.sticky[_PFX + "LOCK"] = threading.Lock()
    _lock = sc.sticky[_PFX + "LOCK"]

    # ── server + form ─────────────────────────────────────────────────────────
    if _PFX + "STARTED" not in sc.sticky:
        _serve_dir = WORK_DIR

        class _H(SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw):
                super().__init__(*a, directory=_serve_dir, **kw)
            def do_POST(self):
                if self.path == "/screenshot":
                    n = int(self.headers.get("Content-Length", 0))
                    data = self.rfile.read(n)
                    with _lock:
                        sc.sticky[_PFX + "PNG_BYTES"]    = data
                        sc.sticky[_PFX + "NEEDS_REDRAW"] = True
                    self.send_response(200)
                    self.end_headers()
                else:
                    self.send_response(404)
                    self.end_headers()
            def end_headers(self):
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                super().end_headers()
            def log_message(self, *a): pass

        _httpd = HTTPServer(("127.0.0.1", PORT), _H)
        threading.Thread(target=_httpd.serve_forever, daemon=True).start()

        import Eto.Forms as ef, Eto.Drawing as ed
        _wv           = ef.WebView()
        _form         = ef.Form()
        _form.Title   = "Data Muncher"
        _form.Size    = ed.Size(1100, 750)
        _form.Topmost = True
        _form.Content = _wv

        def _on_loaded(sender, e):
            try: _wv.ExecuteScript("window.__GH_PORT={}".format(PORT))
            except: pass
        _wv.DocumentLoaded += _on_loaded
        _wv.Url = System.Uri(URL)

        def _on_closing(sender, e):
            e.Cancel = True
            _form.Visible = False
        _form.Closing += _on_closing

        _form.Show()
        sc.sticky[_PFX + "STARTED"] = True
        sc.sticky[_PFX + "FORM"]    = _form
        Rhino.RhinoApp.WriteLine("[DataMuncher] Ready on port {}".format(PORT))

    _frm = sc.sticky.get(_PFX + "FORM")
    if _frm is not None and _enable:
        _frm.Visible = True

    # ── bitmap pipeline ───────────────────────────────────────────────────────
    if _PFX + "IDLE" not in sc.sticky:
        def _idle(sender, e):
            needs = False
            data  = None
            with sc.sticky.get(_PFX + "LOCK", threading.Lock()):
                if sc.sticky.get(_PFX + "NEEDS_REDRAW"):
                    sc.sticky[_PFX + "NEEDS_REDRAW"] = False
                    needs = True
                    data  = sc.sticky.get(_PFX + "PNG_BYTES")
            if needs and data:
                try:
                    ms  = System.IO.MemoryStream(System.Array[System.Byte](data))
                    raw = sd.Bitmap(ms)
                    old = sc.sticky.get(_PFX + "BMP")
                    if old:
                        try: old.Dispose()
                        except: pass
                    sc.sticky[_PFX + "BMP"] = rd.DisplayBitmap(sd.Bitmap(raw))
                    raw.Dispose(); ms.Dispose()
                except Exception as ex:
                    sc.sticky[_PFX + "ERR"] = str(ex)
                Rhino.RhinoDoc.ActiveDoc.Views.Redraw()

        Rhino.RhinoApp.Idle += _idle
        sc.sticky[_PFX + "IDLE"] = _idle

    if _PFX + "CH" not in sc.sticky:
        def _draw(sender, e):
            if not sc.sticky.get(_PFX + "ENABLED", True): return
            vp = sc.sticky.get(_PFX + "VIEWPORT", "")
            if vp and e.Display.Viewport.Name != vp: return
            try:
                bmp = sc.sticky.get(_PFX + "BMP")
                if bmp:
                    e.Display.DrawBitmap(bmp,
                        sc.sticky.get(_PFX + "X", 20),
                        sc.sticky.get(_PFX + "Y", 60))
            except Exception as ex:
                sc.sticky[_PFX + "ERR"] = str(ex)

        rd.DisplayPipeline.DrawForeground += _draw
        sc.sticky[_PFX + "CH"] = _draw

    # ── data → JSON ───────────────────────────────────────────────────────────
    rows = build_rows(_names, _values, _parents, _colors) if (_names and _values) else []

    if rows:
        payload = {
            "updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "config": {
                "type":       _chart_type,
                "title":      _title,
                "subtitle":   _subtitle,
                "units":      _units,
                "w":          _w,
                "font_scale": _font_scale,
            },
            "data": rows,
        }
        with open(OUTPUT_JSON, "w") as f:
            json.dump(payload, f, indent=2)
        a = "OK | {} rows | {} | overlay:{}".format(
            len(rows), _chart_type.upper(), "ON" if _enable else "OFF")
    else:
        a = "waiting for data..."

except Exception:
    a = "ERROR: " + traceback.format_exc()
    Rhino.RhinoApp.WriteLine("[DataMuncher] " + a)
