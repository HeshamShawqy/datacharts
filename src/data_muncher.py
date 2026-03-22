"""
Data Muncher - Grasshopper Dashboard Component
Rhino 8 Script Component (Python 3)

INPUTS:
  names      : list[str]   - Data item labels
  values     : list[float] - Data item values
  parents    : list[str]   - Parent group for each item (optional)
  chart_type : str         - "treemap", "bar", "pie", "sunburst", "sankey"
  title      : str         - Dashboard title
  subtitle   : str         - Dashboard subtitle
  units      : str         - Value units label  (default: m²)
  enable     : bool        - Show viewport overlay
  x          : int         - Viewport overlay X position
  y          : int         - Viewport overlay Y position
  w          : int         - Export width in pixels
  font_scale : float       - Global font scale factor (1.0 = default)
  viewport   : str|list    - Viewport name(s) to show overlay (default: "Perspective")
  trigger    : object      - Wire any changing value to force update

OUTPUTS:
  a          : str         - Status message
"""

a = "initializing..."

_PFX = "DMUNCH_"
_WEB_ASSETS = ("index.html", "d3.min.js", "d3-sankey.min.js")

try:
    import json, os, datetime, threading, traceback, shutil, tempfile
    import scriptcontext as sc
    import Rhino
    import Rhino.Display as rd
    import System.Drawing as sd
    import System.IO
    import System
    from http.server import HTTPServer, SimpleHTTPRequestHandler
except Exception as ex:
    a = "IMPORT ERROR: " + str(ex)
    raise


def _get_pkg_dir():
    roots = []
    try:
        import Grasshopper
        for lib in Grasshopper.Instances.ComponentServer.Libraries:
            if "data_muncher" in lib.Name.lower() or "datamuncher" in lib.Name.lower():
                roots.append(os.path.dirname(lib.Location))
                break
    except Exception:
        pass
    try:
        asm = ghenv.Component.GetType().Assembly.Location
        if asm:
            roots.append(os.path.dirname(asm))
    except Exception:
        pass
    for root in roots:
        for sub in ("shared", "web", ""):
            check = os.path.join(root, sub) if sub else root
            if os.path.isfile(os.path.join(check, "index.html")):
                return check
    return os.getcwd()


def _ensure_work_dir(port):
    work = os.path.join(tempfile.gettempdir(), "data-muncher", str(port))
    os.makedirs(work, exist_ok=True)
    pkg = _get_pkg_dir()
    for fname in _WEB_ASSETS:
        src = os.path.join(pkg, fname)
        dst = os.path.join(work, fname)
        if os.path.isfile(src):
            if not os.path.isfile(dst) or os.path.getmtime(src) > os.path.getmtime(dst):
                shutil.copy2(src, dst)
    return work


try:
    g = globals()
    _names      = g.get("names")      or []
    _values     = g.get("values")     or []
    _parents    = g.get("parents")    or []
    _chart_type = str(g.get("chart_type") or "treemap").lower()
    _title      = str(g.get("title")      or "Grasshopper Dashboard")
    _subtitle   = str(g.get("subtitle")   or "Live Data Feed")
    _units      = str(g.get("units")      or "m²")
    _font_scale = float(g.get("font_scale") or 1.0)
    _enable     = bool(g.get("enable")) if g.get("enable") is not None else True
    _x          = int(g.get("x") or 20)
    _y          = int(g.get("y") or 60)
    _w          = int(g.get("chart_size") or 500)

    # viewport: Non ["Perspective"], single str, or list of str
    _vp_raw = g.get("viewport")
    if not _vp_raw:
        _new_vp = {"Perspective"}
    elif isinstance(_vp_raw, str):
        _new_vp = {_vp_raw.strip()} if _vp_raw.strip() else {"Perspective"}
    else:
        _new_vp = {str(v).strip() for v in _vp_raw if v}

    _iter = getattr(ghenv.Component, "IterationCount", 0)
    if _iter == 0:
        _viewports = _new_vp
    else:
        _viewports = sc.sticky.get(_PFX + "VIEWPORTS", set()) | _new_vp

    sc.sticky[_PFX + "VIEWPORTS"] = _viewports

    if _PFX + "PORT" not in sc.sticky:
        import socket as _sock
        with _sock.socket() as _s:
            _s.bind(('', 0))
            sc.sticky[_PFX + "PORT"] = _s.getsockname()[1]
    PORT = sc.sticky[_PFX + "PORT"]
    URL  = "http://127.0.0.1:{}".format(PORT)

    WORK_DIR    = _ensure_work_dir(PORT)
    OUTPUT_JSON = os.path.join(WORK_DIR, "gh_dashboard.json")

    sc.sticky[_PFX + "ENABLED"] = _enable
    sc.sticky[_PFX + "X"]       = _x
    sc.sticky[_PFX + "Y"]       = _y
    sc.sticky[_PFX + "W"]       = _w

    if _PFX + "LOCK" not in sc.sticky:
        sc.sticky[_PFX + "LOCK"] = threading.Lock()
    _lock = sc.sticky[_PFX + "LOCK"]

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
            def log_message(self, *a):
                pass

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
            try:
                _wv.ExecuteScript("window.__GH_PORT={}".format(PORT))
            except Exception:
                pass
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

    # Re-show the form on every component run so that reset / re-compute brings it back
    _frm = sc.sticky.get(_PFX + "FORM")
    if _frm is not None and _enable:
        _frm.Visible = True

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
                        except Exception: pass
                    sc.sticky[_PFX + "BMP"] = rd.DisplayBitmap(sd.Bitmap(raw))
                    raw.Dispose()
                    ms.Dispose()
                except Exception as ex:
                    sc.sticky[_PFX + "ERR"] = str(ex)
                Rhino.RhinoDoc.ActiveDoc.Views.Redraw()

        Rhino.RhinoApp.Idle += _idle
        sc.sticky[_PFX + "IDLE"] = _idle

    if _PFX + "CH" not in sc.sticky:
        def _draw(sender, e):
            if not sc.sticky.get(_PFX + "ENABLED", True):
                return
            vps = sc.sticky.get(_PFX + "VIEWPORTS", {"Perspective"})
            if e.Display.Viewport.Name not in vps:
                return
            try:
                bmp = sc.sticky.get(_PFX + "BMP")
                if bmp:
                    e.Display.DrawBitmap(
                        bmp,
                        sc.sticky.get(_PFX + "X", 20),
                        sc.sticky.get(_PFX + "Y", 60),
                    )
            except Exception as ex:
                sc.sticky[_PFX + "ERR"] = str(ex)

        rd.DisplayPipeline.DrawForeground += _draw
        sc.sticky[_PFX + "CH"] = _draw

    if _names and _values and len(_names) == len(_values):
        _parents = (_parents + [""] * len(_names))[:len(_names)]
        rows = [
            {"name": str(n), "value": float(v), **({"parent": str(p)} if p else {})}
            for n, v, p in zip(_names, _values, _parents)
            if n is not None and v is not None
        ]
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
            len(rows), _chart_type.upper(), "ON" if _enable else "OFF"
        )
    else:
        a = "waiting for data..."

except Exception:
    a = "ERROR: " + traceback.format_exc()
    Rhino.RhinoApp.WriteLine("[DataMuncher] " + a)
