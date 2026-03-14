"""
GH Dashboard — Viewport (Final)
INPUTS:
  names      - List str
  values     - List float
  parents    - List str (optional)
  chart_type - Item str ("treemap", "bar", "pack", "radial", "sankey")
  title      - Item str
  subtitle   - Item str
  trigger    - Item any
  enable     - Item bool
  x, y       - Item int
  w          - Item int
"""

import json, os, datetime, threading, traceback
import scriptcontext as sc
import Rhino
import Rhino.Display as rd
import System.Drawing as sd
import System.IO
import System
from http.server import HTTPServer, SimpleHTTPRequestHandler

SERVE_DIR   = r"D:\00_HS\GSS24\code\New folder\datacharts\mvp"
OUTPUT_JSON = os.path.join(SERVE_DIR, "gh_dashboard.json")
PORT        = 8080
URL         = "http://localhost:{}".format(PORT)

out = "starting..."

try:
    _names      = globals().get("names")   or[]
    _values     = globals().get("values")  or []
    _parents    = globals().get("parents") or[]
    _chart_type = str(globals().get("chart_type") or "treemap").lower()
    _title      = str(globals().get("title") or "Grasshopper Dashboard")
    _subtitle   = str(globals().get("subtitle") or "Live Data Feed")
    _font_scale = float(globals().get("font_scale") or 1.0)
    _enable     = globals().get("enable",  True)
    _x          = int(globals().get("x") or 20)
    _y          = int(globals().get("y") or 60)
    _w          = int(globals().get("w") or 500)

    sc.sticky["GH_VP_ENABLED"] = bool(_enable)
    sc.sticky["GH_VP_X"]       = _x
    sc.sticky["GH_VP_Y"]       = _y
    sc.sticky["GH_VP_W"]       = _w

    # firing up the server
    if "GH_VP_STARTED" not in sc.sticky:
        class _H(SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw):
                super().__init__(*a, directory=SERVE_DIR, **kw)
            def do_POST(self):
                if self.path == "/screenshot":
                    n = int(self.headers.get("Content-Length", 0))
                    sc.sticky["GH_VP_PNG_BYTES"] = self.rfile.read(n)
                    self.send_response(200)
                    self.end_headers()
                    sc.sticky["GH_VP_NEEDS_REDRAW"] = True
                else:
                    self.send_response(404)
                    self.end_headers()
            def end_headers(self):
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                super().end_headers()
            def log_message(self, *a): pass

        threading.Thread(target=lambda: HTTPServer(("", PORT), _H).serve_forever(), daemon=True).start()

        import Eto.Forms as ef, Eto.Drawing as ed
        _wv           = ef.WebView()
        _wv.Url       = System.Uri(URL)
        _form         = ef.Form()
        _form.Title   = "GH Dashboard"
        _form.Size    = ed.Size(1100, 750)
        _form.Content = _wv
        _form.Show()

        sc.sticky["GH_VP_STARTED"] = True
        sc.sticky["GH_VP_FORM"]    = _form

    # safe guard bitmap updates
    if "GH_VP_IDLE" not in sc.sticky:
        def _idle(sender, e):
            if sc.sticky.get("GH_VP_NEEDS_REDRAW"):
                sc.sticky["GH_VP_NEEDS_REDRAW"] = False
                data = sc.sticky.get("GH_VP_PNG_BYTES")
                if data:
                    try:
                        ms  = System.IO.MemoryStream(System.Array[System.Byte](data))
                        raw = sd.Bitmap(ms)
                        
                        old_bmp = sc.sticky.get("GH_VP_BMP")
                        if old_bmp:
                            try: old_bmp.Dispose()
                            except: pass
                            
                        new_bmp = sd.Bitmap(raw)
                        sc.sticky["GH_VP_BMP"] = rd.DisplayBitmap(new_bmp)
                        raw.Dispose()
                        ms.Dispose()
                    except Exception as ex:
                        sc.sticky["GH_VP_ERR"] = str(ex)
                Rhino.RhinoDoc.ActiveDoc.Views.Redraw()

        Rhino.RhinoApp.Idle += _idle
        sc.sticky["GH_VP_IDLE"] = _idle

    # handler
    if "GH_VP_CH" in sc.sticky:
        try:    rd.DisplayPipeline.DrawForeground -= sc.sticky["GH_VP_CH"]
        except: pass
        del sc.sticky["GH_VP_CH"]

    def _draw(sender, e):
        if not sc.sticky.get("GH_VP_ENABLED", True): return
        try:
            bmp = sc.sticky.get("GH_VP_BMP")
            if bmp: e.Display.DrawBitmap(bmp, sc.sticky.get("GH_VP_X", 20), sc.sticky.get("GH_VP_Y", 60))
        except Exception as ex:
            sc.sticky["GH_VP_ERR"] = str(ex)

    rd.DisplayPipeline.DrawForeground += _draw
    sc.sticky["GH_VP_CH"] = _draw

    #json making
    if _names and _values and len(_names) == len(_values):
        _parents = (_parents + [""] * len(_names))[:len(_names)]
        rows =[{"name": str(n), "value": float(v), **({"parent": str(p)} if p else {})}
                for n, v, p in zip(_names, _values, _parents) if n is not None and v is not None]
        
        payload = {
            "updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "config": {
                "type": _chart_type,
                "title": _title,
                "subtitle": _subtitle,
                "w": _w,
                "font_scale": _font_scale
            },
            "data": rows
        }
        
        with open(OUTPUT_JSON, "w") as f:
            json.dump(payload, f, indent=2)
            
        out = "OK | {} rows | {} | overlay:{}".format(len(rows), _chart_type.upper(), "ON" if _enable else "OFF")
    else:
        out = "waiting for data"

except Exception:
    out = "ERROR: " + traceback.format_exc()