function drawTreemap(json, W, H, container) {
  const root = buildHierarchy(json.data);
  const hasGroups = root.height > 1;
  d3.treemap().size([W, H]).paddingOuter(4).paddingTop(hasGroups ? 32 : 4).paddingInner(2).round(true)(root);
  const T = 600;

  const nodes = container.selectAll(".node").data(root.leaves(), nodeKey);
  nodes.exit().transition("data").duration(T / 2).style("opacity", 0).remove();

  const nodesE = nodes.enter().append("g").attr("class", "node").style("opacity", 0)
    .attr("transform", d => `translate(${d.x0},${d.y0})`);
  nodesE.append("rect").attr("rx", 3).attr("stroke", "#fff").attr("stroke-width", "2px")
    .on("mouseover", (e, d) => showTT(e, d.data.name, d.value, d.parent ? d.parent.data.name : ""))
    .on("mousemove", moveTT).on("mouseout", hideTT);

  const nodesM = nodesE.merge(nodes);
  nodesM.transition("data").duration(T).ease(d3.easeCubicOut)
    .style("opacity", 1)
    .attr("transform", d => `translate(${d.x0},${d.y0})`);
  nodesM.select("rect").transition("data").duration(T).ease(d3.easeCubicOut)
    .attr("width", d => Math.max(0, d.x1 - d.x0))
    .attr("height", d => Math.max(0, d.y1 - d.y0))
    .attr("fill", d => nodeColor(d));

  nodesM.selectAll("clipPath, .cell-text").remove();
  nodesM.each(function(d) {
    const w = d.x1 - d.x0;
    const h = d.y1 - d.y0;
    const el = d3.select(this);
    if (w <= 0 || h <= 0) return;

    const uid = "tm-" + (d.data._id || d.data.name).replace(/\W/g, "_");
    el.append("clipPath").attr("id", uid).append("rect")
      .attr("x", 2).attr("y", 2).attr("width", Math.max(0, w - 4)).attr("height", Math.max(0, h - 4));

    const tg = el.append("g").attr("class", "cell-text").attr("clip-path", `url(#${uid})`);
    if (w > 45 && h > 25) {
      tg.append("text").attr("x", 8).attr("y", 18)
        .style("font-size", typeSize("itemName", 11)).style("font-weight", typeWeight("itemName")).style("fill", "#000")
        .text(d.data.name);
    }
    if (w > 40 && h > 24) {
      tg.append("text").attr("x", 8).attr("y", 34)
        .style("font-size", typeSize("itemValue", Math.max(6.5, Math.min(9.5, Math.min(w / 10, h / 4)))))
        .style("font-weight", typeWeight("itemValue"))
        .style("fill", "#000000")
        .text(formatValue(d.value, true));
    }
  });

  const pLabels = container.selectAll(".plabel").data(hasGroups ? (root.children || []) : [], nodeKey);
  pLabels.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
  const pLabelsE = pLabels.enter().append("g").attr("class", "plabel parent-label").style("opacity", 0);
  pLabelsE.append("text").attr("class", "plabel-name")
    .style("font-weight", "700");
  pLabelsE.append("text").attr("class", "plabel-total")
    .style("fill", "#666");
  const pLabelsM = pLabelsE.merge(pLabels);
  pLabelsM.transition("data").duration(T)
    .style("opacity", 1);
  pLabelsM.select(".plabel-name").transition("data").duration(T)
    .style("font-size", typeSize("groupTitle"))
    .style("font-weight", typeWeight("groupTitle"))
    .style("fill", d => groupColor(d.data, color(d.data.name)))
    .attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 14)
    .text(d => d.data.name);
  pLabelsM.select(".plabel-total").transition("data").duration(T)
    .style("font-size", typeSize("groupTotal"))
    .style("font-weight", typeWeight("groupTotal"))
    .attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 30)
    .text(d => formatValue(d.value, true));

  scheduleScreenshot(json.config);
}
