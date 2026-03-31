"""
Data Muncher - Grasshopper Dashboard Component
Rhino 8 Script Component

INPUTS:
  labels      : DataTree / List str    - display labels
  values     : DataTree / List float  - numeric values
  groups    : DataTree / List str    - grouping category (optional)
               Case A: same branch count & item count as names/values → 1-to-1
               Case B: same branch count, 1 item per branch → broadcast
  item_colors     : DataTree / List Color  - per-item colours (optional, same Cases A/B)
  group_colors : DataTree / List Color - per-group colours (optional, same Cases A/B)
  chart_type : str   - treemap | bar | pack | sunburst | sankey
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

# set this to true when you want to serve files straight from your repo web folder
use_dev_web = False

# this is only used when use_dev_web is true
dev_web_dir = r"D:\00_HS\GSS24\code\New folder\datacharts\web"

try:
    import json, os, datetime, threading, traceback, tempfile, shutil
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


def _get_doc_dir():
    try:
        doc = ghenv.Component.OnPingDocument()
        if doc and doc.FilePath:
            return os.path.dirname(doc.FilePath)
    except:
        pass
    return None


def _find_web_source(extra=None):
    candidates = []
    if extra:
        candidates.append(str(extra))

    try:
        for lib in Grasshopper.Instances.ComponentServer.Libraries:
            name = (lib.Name or "").lower()
            if "data_muncher" in name or "datamuncher" in name:
                root = os.path.dirname(lib.Location)
                candidates.append(os.path.join(root, "shared"))
                candidates.append(os.path.join(root, "web"))
                candidates.append(root)
    except:
        pass

    try:
        asm = ghenv.Component.GetType().Assembly.Location
        if asm:
            root = os.path.dirname(asm)
            candidates.append(os.path.join(root, "shared"))
            candidates.append(os.path.join(root, "web"))
            candidates.append(root)
    except:
        pass

    doc_dir = _get_doc_dir()
    if doc_dir:
        candidates.append(os.path.join(doc_dir, "web"))
        candidates.append(os.path.abspath(os.path.join(doc_dir, "..", "web")))

    cwd = os.getcwd()
    candidates.append(os.path.join(cwd, "web"))
    candidates.append(cwd)

    for path in candidates:
        try:
            full = os.path.abspath(path)
            if os.path.isdir(full) and os.path.isfile(os.path.join(full, "index.html")):
                return full
        except:
            pass

    raise Exception("could not find source web folder")


def _sync_tree(src, dst):
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def _ensure_work_dir(port, dev_mode, dev_dir):
    if dev_mode:
        return _find_web_source(dev_dir)

    src_dir = _find_web_source()
    temp_root = os.path.join(tempfile.gettempdir(), "data_muncher_{}".format(port))
    work_dir = os.path.join(temp_root, "web")
    _sync_tree(src_dir, work_dir)
    return work_dir


def _find_icon_file():
    candidates = []

    try:
        asm = ghenv.Component.GetType().Assembly.Location
        if asm:
            root = os.path.dirname(asm)
            candidates.append(os.path.join(root, "assets", "data_muncher.png"))
            candidates.append(os.path.join(root, "shared", "data_muncher.png"))
            candidates.append(os.path.join(root, "shared", "assets", "data_muncher.png"))
    except:
        pass

    cwd = os.getcwd()
    candidates.append(os.path.join(cwd, "assets", "data_muncher.png"))
    candidates.append(os.path.join(cwd, "data_muncher.png"))

    for path in candidates:
        try:
            full = os.path.abspath(path)
            if os.path.isfile(full):
                return full
        except:
            pass

    return None


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


def _branch_map(raw):
    if _is_tree(raw):
        branches = _tree_branches(raw)
    elif raw:
        branches = _flat_branches(raw)
    else:
        branches = []
    return branches, dict(branches)


def _empty_stats():
    return {
        "skipped_rows": 0,
        "errors": [],
    }


def _make_payload(chart_type, title, subtitle, units, width, font_scale, rows, error=None):
    return {
        "updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "error": error,
        "config": {
            "type":       chart_type,
            "title":      title,
            "subtitle":   subtitle,
            "units":      units,
            "w":          width,
            "font_scale": font_scale,
        },
        "data": rows,
    }

def build_rows(names_raw, values_raw, parents_raw, colors_raw=None, group_colors_raw=None):
    """Always yields leaf-level rows {name, value, ?parent, ?color}.

    Parent/color matching per branch:
      Case A – same item count as names/values → 1-to-1
      Case B – exactly 1 item per branch       → broadcast to all items
    """
    n_branches = _tree_branches(names_raw)  if _is_tree(names_raw)  else _flat_branches(names_raw)
    v_branches = _tree_branches(values_raw) if _is_tree(values_raw) else _flat_branches(values_raw)

    _p_branches, p_map = _branch_map(parents_raw)
    _c_branches, c_map = _branch_map(colors_raw)
    _g_branches, g_map = _branch_map(group_colors_raw)

    v_map = dict(v_branches)
    rows  = []
    stats = _empty_stats()

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
        if len(n_list) != len(v_list):
            stats["errors"].append(
                "branch {} has {} labels but {} values, check the input lengths".format(
                    path, len(n_list), len(v_list)
                )
            )
        count  = min(len(n_list), len(v_list))
        if count == 0:
            continue

        p_list = _resolve(_lookup(p_map, _p_branches, path, i), count, to_str=True)
        c_list = _resolve(_lookup(c_map, _c_branches, path, i), count, to_str=False)
        g_list = _resolve(_lookup(g_map, _g_branches, path, i), count, to_str=False)

        for n, v, p, c, gc in zip(n_list[:count], v_list[:count], p_list, c_list, g_list):
            try:
                row = {"name": str(n), "value": float(v)}
                if str(p).strip():
                    row["parent"] = str(p).strip()
                hex_c = _color_to_hex(c) if c is not None else None
                if hex_c:
                    row["color"] = hex_c
                hex_gc = _color_to_hex(gc) if gc is not None else None
                if hex_gc:
                    row["group_color"] = hex_gc
                rows.append(row)
            except (ValueError, TypeError):
                stats["skipped_rows"] += 1

    return rows, stats


def teardown():
    idle = sc.sticky.get(_PFX + "IDLE")
    if idle:
        try: Rhino.RhinoApp.Idle -= idle
        except: pass

    ch = sc.sticky.get(_PFX + "CH")
    if ch:
        try: rd.DisplayPipeline.DrawForeground -= ch
        except: pass

    httpd = sc.sticky.get(_PFX + "HTTPD")
    if httpd:
        try: httpd.shutdown()
        except: pass
        try: httpd.server_close()
        except: pass

    bmp = sc.sticky.get(_PFX + "BMP")
    if bmp:
        try: bmp.Dispose()
        except: pass

    frm = sc.sticky.get(_PFX + "FORM")
    if frm:
        try: frm.Close()
        except: pass

    for key in [
        "STARTED", "FORM", "HTTPD", "IDLE", "CH", "BMP",
        "PNG_BYTES", "NEEDS_REDRAW", "ERR", "SERVE_MODE", "WORK_DIR",
    ]:
        sc.sticky.pop(_PFX + key, None)


def write_json(path, payload):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


# ── Main ──────────────────────────────────────────────────────────────────────

try:
    # this part reads the current gh inputs and local dev settings
    g = globals()
    _trigger    = str(g.get("trigger") or "").strip().lower()
    _names      = g.get("labels")
    _values     = g.get("values")
    _parents    = g.get("groups")
    _colors     = g.get("item_colors")
    _group_colors = g.get("group_colors")
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
    _dev_mode   = bool(use_dev_web)
    _dev_dir    = str(dev_web_dir or "").strip()

    if _trigger == "reset":
        teardown()
        a = "reset complete"
        raise SystemExit

    # this part stores the overlay settings Rhino needs between runs
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

    mode_key = "dev" if _dev_mode else "temp"
    prev_mode = sc.sticky.get(_PFX + "SERVE_MODE")
    if prev_mode and prev_mode != mode_key:
        teardown()
        sc.sticky[_PFX + "PORT"] = PORT

    WORK_DIR    = _ensure_work_dir(PORT, _dev_mode, _dev_dir)
    OUTPUT_JSON = os.path.join(WORK_DIR, "gh_dashboard.json")
    sc.sticky[_PFX + "SERVE_MODE"] = mode_key
    sc.sticky[_PFX + "WORK_DIR"] = WORK_DIR

    if _PFX + "LOCK" not in sc.sticky:
        sc.sticky[_PFX + "LOCK"] = threading.Lock()
    _lock = sc.sticky[_PFX + "LOCK"]

    # this part starts the local server and the preview window
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
        _icon_file = _find_icon_file()
        if _icon_file:
            try:
                _form.Icon = ed.Icon(_icon_file)
            except:
                pass

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
        sc.sticky[_PFX + "HTTPD"]   = _httpd
        Rhino.RhinoApp.WriteLine("[DataMuncher] Ready on port {}".format(PORT))

    _frm = sc.sticky.get(_PFX + "FORM")
    if _frm is not None:
        _frm.Visible = bool(_enable)

    # this part turns browser screenshots into a Rhino display bitmap
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

    # this part draws the latest bitmap into the chosen Rhino viewport
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

    # this part packs the gh data into the json file the browser reads
    has_input = _names is not None and _values is not None
    rows, stats = build_rows(_names, _values, _parents, _colors, _group_colors) if has_input else ([], _empty_stats())

    if stats["errors"]:
        message = " | ".join(stats["errors"][:3])
        payload = _make_payload(_chart_type, _title, _subtitle, _units, _w, _font_scale, [], error=message)
        write_json(OUTPUT_JSON, payload)
        a = "input error | " + message
    elif rows:
        payload = _make_payload(_chart_type, _title, _subtitle, _units, _w, _font_scale, rows)
        write_json(OUTPUT_JSON, payload)

        notes = []
        if stats["skipped_rows"]:
            notes.append("skipped rows:{}".format(stats["skipped_rows"]))

        a = "OK | {} rows | {} | overlay:{}".format(
            len(rows), _chart_type.upper(), "ON" if _enable else "OFF")
        if notes:
            a += " | " + " | ".join(notes)
    else:
        if has_input and stats["skipped_rows"]:
            a = "no valid rows | skipped rows:{}".format(stats["skipped_rows"])
        else:
            a = "waiting for data..."

except Exception:
    a = "ERROR: " + traceback.format_exc()
    Rhino.RhinoApp.WriteLine("[DataMuncher] " + a)
