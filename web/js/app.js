const DATA_JOIN_TYPES = new Set(["bar", "treemap", "sunburst", "sankey", "pack"]);

const uiBar = document.getElementById("ui-bar");
if (uiBar) {
  uiBar.innerHTML = `
    <span id="ui-hints">scroll = zoom &nbsp;&middot;&nbsp; drag = pan &nbsp;&middot;&nbsp; dbl-click = reset &nbsp;&middot;&nbsp; hover for values</span>
    <button class="ui-btn" id="btn-extents" title="Zoom extents" aria-label="Zoom extents"></button>
    <button class="ui-btn" id="btn-dl" title="Download PNG" aria-label="Download PNG"></button>
  `;
}

function dispatchDraw(type, json, W, H, g) {
  if (type === "bar") drawBarChart(json, W, H, g);
  else if (type === "pack") drawCirclePack(json, W, H, g);
  else if (type === "sankey") drawSankey(json, W, H, g);
  else if (type === "sunburst") drawSunburst(json, W, H, g);
  else drawTreemap(json, W, H, g);
}

function renderChart(json, W, H) {
  latestJson = json;
  svg.attr("width", W).attr("height", H);
  fontScale = json.config.font_scale || 1.0;
  UNIT = json.config.units || "m²";
  updateHeader(json);

  const cats = [...new Set(json.data.map(d => d.parent).filter(Boolean))];
  color.domain(cats.length ? cats : [...new Set(json.data.map(d => d.name))]);

  const type = json.config.type;
  const typeChanged = type !== lastChartType;
  if (typeChanged) {
    lastChartType = type;
    svg.call(zoom.transform, d3.zoomIdentity);
  }

  if (!typeChanged && activeGroup && DATA_JOIN_TYPES.has(type)) {
    dispatchDraw(type, json, W, H, activeGroup);
    return;
  }

  const old = activeGroup;
  const next = zoomGroup.append("g").attr("class", "chart-layer").style("opacity", 0);
  activeGroup = next;
  dispatchDraw(type, json, W, H, next);
  next.transition().duration(400).ease(d3.easeCubicOut).style("opacity", 1);
  if (old) {
    old.transition().duration(300).style("opacity", 0).on("end", function() {
      d3.select(this).remove();
    });
  }
}

async function poll() {
  try {
    const res = await fetch(DATA_FILE + "?t=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if (json.error) {
      lastUpdated = json.updated || String(Date.now());
      latestJson = json;
      updateHeader(json);
      clearChart();
      showErrorOverlay("input error\n" + json.error);
      return;
    }
    hideErrorOverlay();
    if (!json.data || !Array.isArray(json.data)) return;

    const clean = json.data.filter(d => d.name != null && d.name !== "" && +d.value > 0);
    if (!clean.length) return;
    json.data = clean;

    if (json.updated !== lastUpdated) {
      lastUpdated = json.updated;
      latestJson = json;
      refreshChart();
    }
  } catch (e) {
    hideErrorOverlay();
    if (!placeholderOn && lastUpdated === null) {
      placeholderOn = true;
      latestJson = PLACEHOLDER;
      refreshChart();
    }
  }
}

document.getElementById("btn-extents").addEventListener("click", zoomExtents);
document.getElementById("btn-dl").addEventListener("click", downloadPNG);
document.getElementById("btn-extents").innerHTML = `
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6 3H3v3"></path>
    <path d="M10 3h3v3"></path>
    <path d="M3 10v3h3"></path>
    <path d="M13 10v3h-3"></path>
  </svg>
`;
document.getElementById("btn-dl").innerHTML = `
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2v7"></path>
    <path d="M5.5 7.5 8 10l2.5-2.5"></path>
    <path d="M3 12.5h10"></path>
  </svg>
`;

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(refreshChart, 120);
});

poll();
setInterval(poll, POLL_MS);
