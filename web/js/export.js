function downloadPNG() {
  const svgEl = document.getElementById("chart");
  const W = svgEl.clientWidth;
  const H = svgEl.clientHeight;
  const scale = 3;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
  st.textContent = [
    'text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    ".parent-label{font-size:11px;font-weight:bold;fill:#555;text-transform:uppercase;letter-spacing:0.05em}",
    ".sankey-link{fill:none;stroke-opacity:1}"
  ].join(" ");
  clone.insertBefore(st, clone.firstChild);

  const svgStr = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(img._url);

    const a = document.createElement("a");
    a.download = "chart_" + new Date().toISOString().slice(0, 10) + ".png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  img._url = URL.createObjectURL(blob);
  img.src = img._url;
}

function scheduleScreenshot(config, delayMs) {
  clearTimeout(_shotTimer);
  _shotTimer = setTimeout(() => {
    const el = document.getElementById("chart");
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 600;
    const ew = config.w || 500;

    const clone = el.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", W);
    clone.setAttribute("height", H);

    const zr = clone.querySelector(".zoom-root");
    if (zr) zr.removeAttribute("transform");

    const sty = document.createElementNS("http://www.w3.org/2000/svg", "style");
    const cssRules = [];
    for (var si = 0; si < document.styleSheets.length; si++) {
      try {
        var rules = document.styleSheets[si].cssRules;
        for (var ri = 0; ri < rules.length; ri++) cssRules.push(rules[ri].cssText);
      } catch (e) {}
    }
    sty.textContent = cssRules.join("\n");
    clone.insertBefore(sty, clone.firstChild);

    const FONT_FAMILY = "'Segoe UI', Helvetica, Arial, sans-serif";
    clone.querySelectorAll("text, tspan").forEach(function(t) {
      t.setAttribute("font-family", FONT_FAMILY);
    });
    sty.textContent += "\ntext, tspan { font-family: " + FONT_FAMILY + "; }";

    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" })
    );
    const eh = Math.round(H * ew / W);
    const dpr = window.devicePixelRatio || 2;
    const canvas = document.createElement("canvas");
    canvas.width = ew * dpr;
    canvas.height = eh * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, ew, eh);
      URL.revokeObjectURL(url);
      const port = window.__GH_PORT || location.port || 8080;
      canvas.toBlob(
        b => fetch(`http://127.0.0.1:${port}/screenshot`, { method: "POST", body: b }).catch(() => {}),
        "image/png"
      );
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, delayMs || 700);
}
