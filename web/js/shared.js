window.onerror = function(msg, src, line) {
  var el = document.getElementById("err-overlay");
  if (el) {
    el.style.display = "block";
    el.textContent = "JS error: " + msg + " (line " + line + ")";
  }
};

const DATA_FILE = "gh_dashboard.json";
const POLL_MS = 1000;
const color = d3.scaleOrdinal(d3.schemeTableau10);
const numberFmt = d3.format(",.3~f");

let UNIT = "m²";
let fontScale = 1.0;
let lastUpdated = null;
let lastChartType = null;
let activeGroup = null;
let placeholderOn = false;
let latestJson = null;
let resizeTimer = null;
let _shotTimer = null;

const svg = d3.select("#chart");
const tooltip = d3.select("body").append("div").attr("id", "tooltip");
const titleEl = document.getElementById("chart-title");
const subtitleEl = document.getElementById("chart-subtitle");
const metaEl = document.getElementById("chart-meta");
const errOverlay = document.getElementById("err-overlay");

const PLACEHOLDER = {
  updated: null,
  config: {
    type: "treemap",
    title: "Data Muncher",
    subtitle: "Connect data in Grasshopper",
    units: "-",
    w: 500,
    font_scale: 1.0,
  },
  data: [
    { name: "Item A", value: 4, parent: "Group 1" },
    { name: "Item B", value: 3, parent: "Group 1" },
    { name: "Item C", value: 5, parent: "Group 2" },
    { name: "Item D", value: 2, parent: "Group 2" },
    { name: "Item E", value: 3, parent: "Group 3" },
  ]
};

const zoomGroup = svg.append("g").attr("class", "zoom-root");
const zoom = d3.zoom()
  .scaleExtent([0.05, 10])
  .on("zoom", e => zoomGroup.attr("transform", e.transform.toString()));

svg.call(zoom).on("dblclick.zoom", null);
svg.on("dblclick", () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity));

function sz(px) {
  return (px * fontScale) + "px";
}

function formatNumber(value) {
  return numberFmt(+value || 0);
}

function formatValue(value, withUnit = true) {
  const text = formatNumber(value);
  return withUnit && UNIT ? `${text} ${UNIT}` : text;
}

function showTT(e, name, val, group) {
  const groupLine = (group && group !== "Total" && group !== name)
    ? `<div class="tt-val">Group: ${group}</div>`
    : "";
  tooltip
    .style("opacity", 1)
    .html(`<div class="tt-name">${name}</div><div class="tt-val">${formatValue(val)}</div>${groupLine}`);
  moveTT(e);
}

function moveTT(e) {
  let left = e.pageX + 15;
  let top = e.pageY - 15;
  if (left + 150 > window.innerWidth) left = e.pageX - 165;
  tooltip.style("left", left + "px").style("top", top + "px");
}

function hideTT() {
  tooltip.style("opacity", 0);
}

function nodeColor(d) {
  if (d.data && d.data.color) return d.data.color;
  if (d.data && d.data.group_color) return d.data.group_color;
  if (!d.parent) return "#ccc";
  if (d.parent && d.parent.data && d.parent.data.color) return d.parent.data.color;
  const key = d.parent.data.name !== "Total" ? d.parent.data.name : d.data.name;
  return color(key);
}

function rowColor(row, fallback) {
  return row && row.color ? row.color : fallback;
}

function groupColor(row, fallback) {
  return row && row.group_color ? row.group_color : fallback;
}

function variantColor(base, offset) {
  const c = d3.hsl(base || "#888");
  c.s = Math.max(0, Math.min(1, c.s * 0.95));
  c.l = Math.max(0.24, Math.min(0.78, c.l + offset));
  return c.formatHex();
}

function nestedColor(base, index, total) {
  const t = total <= 1 ? 0.5 : index / Math.max(total - 1, 1);
  return variantColor(base, -0.04 + t * 0.16);
}

function sunburstColor(d) {
  let node = d;
  while (node) {
    if (node.data && node.data.color) return node.data.color;
    if (node.data && node.data.group_color) return node.data.group_color;
    node = node.parent;
  }
  let top = d;
  while (top.depth > 1) top = top.parent;
  return color(top.data.name);
}

function zoomExtents() {
  if (!activeGroup || !activeGroup.node()) {
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
    return;
  }

  const bounds = activeGroup.node().getBBox();
  const wrap = document.getElementById("chart-wrap");
  const W = wrap.clientWidth || 800;
  const H = wrap.clientHeight || 600;
  const pad = { top: 28, right: 70, bottom: 28, left: 28 };
  const bw = Math.max(bounds.width, 1);
  const bh = Math.max(bounds.height, 1);
  const scale = Math.min((W - pad.left - pad.right) / bw, (H - pad.top - pad.bottom) / bh, 10);
  const tx = pad.left + (W - pad.left - pad.right - bw * scale) / 2 - bounds.x * scale;
  const ty = pad.top + (H - pad.top - pad.bottom - bh * scale) / 2 - bounds.y * scale;
  const transform = d3.zoomIdentity.translate(tx, ty).scale(Math.max(scale, 0.05));
  svg.transition().duration(400).call(zoom.transform, transform);
}

function updateHeader(json) {
  const config = json.config || {};
  const title = config.title || "Data Muncher";
  const subtitle = config.subtitle || "";
  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;
  metaEl.textContent = json.updated ? `updated ${json.updated}` : "";
  document.title = title;
}

function showErrorOverlay(message) {
  if (!errOverlay) return;
  errOverlay.style.display = "block";
  errOverlay.textContent = message || "";
}

function hideErrorOverlay() {
  if (!errOverlay) return;
  errOverlay.style.display = "none";
  errOverlay.textContent = "";
}

function clearChart() {
  if (activeGroup) activeGroup.remove();
  activeGroup = zoomGroup.append("g").attr("class", "chart-layer");
  svg.call(zoom.transform, d3.zoomIdentity);
}

function refreshChart() {
  if (!latestJson) return;
  const wrap = document.getElementById("chart-wrap");
  let W = wrap.clientWidth;
  let H = wrap.clientHeight;
  if (!W || !H || W < 100 || H < 100) {
    W = 800;
    H = 600;
  }
  renderChart(latestJson, W, H);
}

function buildHierarchy(data) {
  const hasParents = data.some(d => d.parent);
  if (!hasParents) {
    return d3.hierarchy({ name: "Total", children: data })
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);
  }

  const idOf = d => d.parent ? (d.parent + "|" + d.name) : d.name;
  const idByName = new Map();
  data.forEach(d => idByName.set(d.name, idOf(d)));
  const groupColorByParent = new Map();
  data.forEach(d => {
    if (d.parent && d.group_color && !groupColorByParent.has(d.parent)) {
      groupColorByParent.set(d.parent, d.group_color);
    }
  });
  const rows = data.map(d => {
    const row = { ...d };
    if (!row.group_color && groupColorByParent.has(row.name)) {
      row.group_color = groupColorByParent.get(row.name);
    }
    return row;
  });

  const parentNames = [...new Set(rows.map(d => d.parent).filter(Boolean))];
  const missing = parentNames.filter(p => !idByName.has(p));
  const all = [
    { _id: "Total", name: "Total", _pid: null },
    ...missing.map(p => ({
      _id: p,
      name: p,
      _pid: "Total",
      group_color: groupColorByParent.get(p) || null,
    })),
    ...rows.map(d => ({
      ...d,
      _id: idOf(d),
      _pid: d.parent ? (idByName.get(d.parent) || d.parent) : "Total",
    })),
  ];

  return d3.stratify()
    .id(d => d._id)
    .parentId(d => d._pid)(all)
    .sum(d => d.value)
    .sort((a, b) => b.value - a.value);
}

function nodeKey(d) {
  const parts = [];
  let node = d;
  while (node) {
    parts.unshift(node.data.name);
    node = node.parent;
  }
  return parts.join("|");
}
