function drawBarChart(json, W, H, container) {
  const hasParents = json.data.some(d => d.parent);
  const margin = { top: 8, right: 80, bottom: 8, left: 160 };
  const w = W - margin.left - margin.right;
  const nameHasChildren = new Set(json.data.filter(d => d.parent).map(d => d.parent));
  const isDepth3 = hasParents && json.data.some(d => d.parent && nameHasChildren.has(d.name));

  let rows = [];
  if (isDepth3) {
    const root = buildHierarchy(json.data);
    (root.children || []).sort((a, b) => b.value - a.value).forEach(l1 => {
      rows.push({
        type: "group",
        name: l1.data.name,
        total: l1.value,
        group_color: l1.data.group_color || l1.data.color || null,
      });
      (l1.children || []).sort((a, b) => b.value - a.value).forEach(l2 => {
        rows.push({
          type: "subgroup",
          name: l2.data.name,
          total: l2.value,
          parent: l1.data.name,
          group_color: l2.data.group_color || l1.data.group_color || l1.data.color || null,
        });
        l2.leaves().sort((a, b) => b.value - a.value).forEach(leaf => {
          rows.push({
            type: "bar",
            name: leaf.data.name,
            value: leaf.value,
            parent: l1.data.name,
            subparent: l2.data.name,
            color: leaf.data.color,
            group_color: leaf.data.group_color || l2.data.group_color || l1.data.group_color || l1.data.color || null,
          });
        });
      });
    });
  } else if (hasParents) {
    const leafData = json.data.filter(d => !nameHasChildren.has(d.name) && +d.value > 0);
    const groups = d3.group(leafData, d => d.parent || "Other");
    [...groups.entries()]
      .sort((a, b) => d3.sum(b[1], d => d.value) - d3.sum(a[1], d => d.value))
      .forEach(([parent, children]) => {
        rows.push({
          type: "group",
          name: parent,
          total: d3.sum(children, d => d.value),
          group_color: children.find(d => d.group_color)?.group_color || null,
        });
        children.sort((a, b) => b.value - a.value).forEach(d => rows.push({ type: "bar", ...d }));
      });
  } else {
    json.data.filter(d => +d.value > 0).sort((a, b) => b.value - a.value)
      .forEach(d => rows.push({ type: "bar", ...d }));
  }

  const GROUP_H = 32;
  const SUBGROUP_H = 26;
  const nBars = rows.filter(r => r.type === "bar").length;
  const nGroups = rows.filter(r => r.type === "group").length;
  const nSubgroups = rows.filter(r => r.type === "subgroup").length;
  const availH = H - margin.top - margin.bottom - nGroups * (GROUP_H + 2) - nSubgroups * (SUBGROUP_H + 2);
  const BAR_H = Math.max(10, Math.min(26, Math.floor(availH / Math.max(nBars, 1)) - 4));
  const BAR_PAD = Math.max(2, Math.floor(BAR_H * 0.18));
  const nameFont = Math.max(7.5, Math.min(12, BAR_H * 0.78));
  const valueFont = Math.max(6.8, Math.min(11, BAR_H * 0.72));
  let yPos = 0;
  rows.forEach(r => {
    r._y = yPos;
    yPos += r.type === "group" ? GROUP_H + 2 : r.type === "subgroup" ? SUBGROUP_H + 2 : BAR_H + BAR_PAD;
  });

  const xMax = d3.max(rows.filter(r => r.type === "bar"), d => d.value);
  const x = d3.scaleLinear().domain([0, xMax]).range([0, w]);
  const T = 600;

  let g = container.select("g.bar-inner");
  if (g.empty()) g = container.append("g").attr("class", "bar-inner")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const barData = rows.filter(r => r.type === "bar");
  const grpData = rows.filter(r => r.type === "group");
  const groupColorByName = new Map();
  grpData.forEach(d => {
    if (!groupColorByName.has(d.name) && d.group_color) {
      groupColorByName.set(d.name, d.group_color);
    }
  });
  barData.forEach(d => {
    if (!groupColorByName.has(d.parent) && d.group_color) {
      groupColorByName.set(d.parent, d.group_color);
    }
  });
  const gh = g.selectAll(".group-header").data(grpData, d => d.name);
  gh.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
  const ghE = gh.enter().append("g").attr("class", "group-header").style("opacity", 0);
  ghE.append("text").attr("class", "group-title").style("font-size", sz(11)).style("font-weight", "700").style("letter-spacing", "0.06em");
  ghE.append("text").attr("class", "group-total").style("font-size", sz(9)).style("fill", "#666");
  ghE.append("line").attr("stroke-width", 1).attr("opacity", 0.25);
  const ghM = ghE.merge(gh);
  ghM.transition("data").duration(T).style("opacity", 1);
  ghM.select(".group-title").transition("data").duration(T)
    .attr("x", -margin.left + 4).attr("y", d => d._y + 14)
    .style("fill", d => groupColorByName.get(d.name) || color(d.name)).style("font-size", sz(11))
    .text(d => d.name.toUpperCase());
  ghM.select(".group-total").transition("data").duration(T)
    .attr("x", -margin.left + 4).attr("y", d => d._y + 27)
    .style("font-size", sz(9))
    .text(d => formatValue(d.total, true));
  ghM.select("line").transition("data").duration(T)
    .attr("x1", -margin.left + 4).attr("x2", w)
    .attr("y1", d => d._y + 30).attr("y2", d => d._y + 30)
    .attr("stroke", d => groupColorByName.get(d.name) || color(d.name));

  const sghData = rows.filter(r => r.type === "subgroup");
  const sgh = g.selectAll(".subgroup-header").data(sghData, d => d.parent + ">" + d.name);
  sgh.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
  const sghE = sgh.enter().append("g").attr("class", "subgroup-header").style("opacity", 0);
  sghE.append("text").attr("class", "subgroup-title").style("font-size", sz(10)).style("font-weight", "600").style("letter-spacing", "0.03em");
  sghE.append("text").attr("class", "subgroup-total").style("font-size", sz(8.5)).style("fill", "#666");
  sghE.append("line").attr("stroke-width", 1).attr("opacity", 0.2);
  const sghM = sghE.merge(sgh);
  sghM.transition("data").duration(T).style("opacity", 1);
  sghM.select(".subgroup-title").transition("data").duration(T)
    .attr("x", -margin.left + 20).attr("y", d => d._y + 11)
    .style("fill", d => groupColorByName.get(d.parent) || color(d.parent)).style("font-size", sz(10))
    .text(d => d.name);
  sghM.select(".subgroup-total").transition("data").duration(T)
    .attr("x", -margin.left + 20).attr("y", d => d._y + 22)
    .style("font-size", sz(8.5))
    .text(d => formatValue(d.total, true));
  sghM.select("line").transition("data").duration(T)
    .attr("x1", -margin.left + 20).attr("x2", w)
    .attr("y1", d => d._y + 24).attr("y2", d => d._y + 24)
    .attr("stroke", d => groupColorByName.get(d.parent) || color(d.parent));

  const bars = g.selectAll(".bar").data(barData, d => (d.parent || "") + "|" + d.name);
  bars.exit().transition("data").duration(T / 2).attr("width", 0).style("opacity", 0).remove();
  bars.enter().append("rect").attr("class", "bar")
    .attr("x", 0).attr("width", 0).attr("rx", 2)
    .attr("height", BAR_H).attr("y", d => d._y)
    .on("mouseover", function(e, d) {
      d3.select(this).transition("hover").duration(100).attr("opacity", 0.75);
      showTT(e, d.name, d.value, d.parent);
    })
    .on("mousemove", moveTT)
    .on("mouseout", function() {
      d3.select(this).transition("hover").duration(150).attr("opacity", 1);
      hideTT();
    })
    .merge(bars).transition("data").duration(T).ease(d3.easeCubicOut)
    .attr("y", d => d._y).attr("height", BAR_H)
    .attr("width", d => x(d.value))
    .attr("fill", d => rowColor(d, color(d.parent || d.name)));

  const names = g.selectAll(".label-name").data(barData, d => (d.parent || "") + "|" + d.name);
  names.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
  names.enter().append("text").attr("class", "label-name")
    .attr("text-anchor", "end").style("font-size", sz(nameFont)).style("font-weight", "600").style("opacity", 0)
    .merge(names).transition("data").duration(T)
    .attr("x", -10).attr("y", d => d._y + BAR_H / 2 + 4)
    .style("font-size", sz(nameFont)).style("opacity", 1)
    .text(d => d.name);

  const vals = g.selectAll(".label-val").data(barData, d => (d.parent || "") + "|" + d.name);
  vals.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
  vals.enter().append("text").attr("class", "label-val")
    .style("font-size", sz(valueFont)).style("fill", "#666").style("opacity", 0)
    .merge(vals).transition("data").duration(T).ease(d3.easeCubicOut)
    .attr("x", d => x(d.value) + 8).attr("y", d => d._y + BAR_H / 2 + 4)
    .style("font-size", sz(valueFont)).style("opacity", 1)
    .text(d => formatValue(d.value, true));

  scheduleScreenshot(json.config);
}
