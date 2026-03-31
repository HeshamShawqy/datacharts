function drawSunburst(json, W, H, container) {
  const root = buildHierarchy(json.data);
  d3.partition().size([2 * Math.PI, root.height + 1])(root);
  const maxR = Math.min(W, H) / 2 - 10;
  const radius = maxR / (root.height + 1);
  const T = 420;

  function fillOpacity(d) {
    if (!arcVisible(d.target)) return 0;
    return 1;
  }

  const arc = d3.arc()
    .startAngle(d => d.x0).endAngle(d => d.x1)
    .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005)).padRadius(radius * 1.5)
    .innerRadius(d => Math.max(0, d.y0) * radius)
    .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

  function arcVisible(d) {
    return d.y1 <= root.height + 1 && d.y0 >= 1 && d.x1 > d.x0;
  }

  function labelVisible(d) {
    return d.y1 <= root.height + 1 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.02;
  }

  function labelTransform(d) {
    const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
    const y = (d.y0 + d.y1) / 2 * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  }

  let g = container.select("g.sun-inner");
  if (g.empty()) g = container.append("g").attr("class", "sun-inner")
    .attr("transform", `translate(${W / 2},${H / 2})`);

  const prevState = new Map();
  g.selectAll("path.sun-arc").each(function(d) {
    if (d && d.current) prevState.set(nodeKey(d), { ...d.current });
  });

  const descs = root.descendants().filter(d => d.depth);
  const paths = g.selectAll("path.sun-arc").data(descs, nodeKey);
  paths.exit().transition("data").duration(T / 2).attr("fill-opacity", 0).remove();
  const pathsM = paths.enter().append("path").attr("class", "sun-arc").attr("fill-opacity", 0).merge(paths);
  pathsM.each(function(d) {
    const prev = prevState.get(nodeKey(d));
    d.current = prev || { x0: d.x0, x1: d.x0, y0: d.y0, y1: d.y1 };
    d.target = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 };
  });

  const lbls = g.selectAll("text.sun-lbl").data(descs, nodeKey);
  lbls.exit().transition("data").duration(T / 2).attr("fill-opacity", 0).remove();
  const lblsE = lbls.enter().append("text").attr("class", "sun-lbl")
    .style("fill", "#fff").style("pointer-events", "none").style("text-anchor", "middle").attr("fill-opacity", 0);
  lblsE.append("tspan").attr("class", "sun-name").attr("x", 0).attr("dy", "-0.25em").style("font-weight", "700");
  lblsE.append("tspan").attr("class", "sun-val").attr("x", 0).attr("dy", "1.15em").style("fill", "#ffffff");
  const lblsM = lblsE.merge(lbls);
  lblsM.select(".sun-name")
    .style("font-size", d => sz(Math.max(5.5, Math.min(10, (d.x1 - d.x0) * radius * 0.42))))
    .text(d => d.data.name);
  lblsM.select(".sun-val")
    .style("font-size", d => sz(Math.max(5, Math.min(8.8, (d.x1 - d.x0) * radius * 0.3))))
    .text(d => formatValue(d.value, true));
  lblsM.transition("data").duration(T).ease(d3.easeCubicInOut)
    .attrTween("transform", d => () => labelTransform(d.current))
    .attr("fill-opacity", d => +labelVisible(d.target));

  let center = g.select("circle.sun-center");
  if (center.empty()) center = g.append("circle").attr("class", "sun-center")
    .attr("fill", "none").attr("pointer-events", "all").style("cursor", "pointer");
  center.attr("r", radius).on("click", () => clicked(null, root));

  let cName = g.select("text.sun-cname");
  let cVal = g.select("text.sun-cval");
  if (cName.empty()) {
    cName = g.append("text").attr("class", "sun-cname").attr("text-anchor", "middle").attr("dy", "-0.4em")
      .style("font-weight", "700").style("fill", "#333").style("pointer-events", "none");
    cVal = g.append("text").attr("class", "sun-cval").attr("text-anchor", "middle").attr("dy", "1em")
      .style("fill", "#666").style("pointer-events", "none");
  }
  cName.style("font-size", sz(13));
  cVal.style("font-size", sz(11));

  function setCenter(node) {
    cName.text(node === root ? "Total" : node.data.name);
    cVal.text(formatValue(node.value));
  }

  function setArcHighlight(node) {
    const branch = new Set(node.ancestors());
    pathsM.interrupt().attr("fill-opacity", d => branch.has(d) ? 1 : 0.22);
  }

  function resetArcHighlight() {
    pathsM.interrupt().attr("fill-opacity", d => fillOpacity(d));
  }

  setCenter(root);

  pathsM.attr("fill", d => sunburstColor(d))
    .style("cursor", d => d.children ? "pointer" : "default")
    .on("mouseover", (e, d) => {
      setCenter(d);
      setArcHighlight(d);
      showTT(e, d.data.name, d.value, d.parent?.data.name !== "Total" ? d.parent?.data.name : "");
    })
    .on("mousemove", moveTT)
    .on("mouseout", () => {
      hideTT();
      setCenter(root);
      resetArcHighlight();
    })
    .on("click", (e, d) => {
      if (!d.children) return;
      clicked(e, d);
    })
    .transition("data").duration(T).ease(d3.easeCubicInOut)
    .tween("arcData", d => { const i = d3.interpolate(d.current, d.target); return t => { d.current = i(t); }; })
    .attrTween("d", d => () => arc(d.current))
    .attr("fill-opacity", d => fillOpacity(d));

  function clicked(event, p) {
    if (!p) p = root;
    root.each(d => {
      d.target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth),
      };
    });
    const t = g.transition("data").duration(600).ease(d3.easeCubicInOut);
    pathsM.transition(t)
      .tween("arcData", d => { const i = d3.interpolate(d.current, d.target); return t => { d.current = i(t); }; })
      .filter(function(d) { return +this.getAttribute("fill-opacity") || arcVisible(d.target); })
      .attr("fill-opacity", d => fillOpacity(d))
      .attrTween("d", d => () => arc(d.current));
    lblsM.filter(function(d) { return +this.getAttribute("fill-opacity") || labelVisible(d.target); })
      .transition(t).attr("fill-opacity", d => +labelVisible(d.target))
      .attrTween("transform", d => () => labelTransform(d.current));
    setCenter(p);
    resetArcHighlight();
  }

  scheduleScreenshot(json.config, T + 260);
}
