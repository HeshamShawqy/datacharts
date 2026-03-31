function drawSankey(json, W, H, container) {
  const nodeByName = new Map();
  const nodes = [];
  const links = [];

  json.data.forEach(d => {
    if (!d.value) return;
    const pName = (d.parent || "Total") + " ";
    if (!nodeByName.has(pName)) {
      nodeByName.set(pName, { name: pName, color: d.group_color || null, is_group: true });
      nodes.push(nodeByName.get(pName));
    } else if (!nodeByName.get(pName).color && d.group_color) {
      nodeByName.get(pName).color = d.group_color;
    }
    if (!nodeByName.has(d.name)) {
      nodeByName.set(d.name, { name: d.name, color: d.color || null, is_group: false });
      nodes.push(nodeByName.get(d.name));
    } else if (!nodeByName.get(d.name).color && d.color) {
      nodeByName.get(d.name).color = d.color;
    }
    links.push({ source: nodeByName.get(pName), target: nodeByName.get(d.name), value: d.value });
  });

  const maxName = d3.max(nodes, d => (d.name || "").trim().length) || 8;
  const leftLabelW = Math.min(160, Math.max(88, maxName * 6));
  const rightLabelW = Math.min(180, Math.max(96, maxName * 6));
  const sankey = d3.sankey().nodeWidth(15).nodePadding(6)
    .extent([[leftLabelW + 20, 12], [W - rightLabelW - 18, H - 20]]);
  const { nodes: sNodes, links: sLinks } = sankey({ nodes, links });
  const T = 600;

  let g = container.select("g.sankey-inner");
  if (g.empty()) g = container.append("g").attr("class", "sankey-inner");

  const linkSel = g.selectAll(".sankey-link").data(sLinks, d => d.source.name.trim() + "->" + d.target.name.trim());
  linkSel.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
  linkSel.enter().append("path").attr("class", "sankey-link").attr("fill", "none")
    .on("mouseover", function(e, d) {
      g.selectAll(".sankey-link").attr("stroke-opacity", l => l === d ? 1 : 0.18);
      showTT(e, d.source.name.trim() + " -> " + d.target.name.trim(), d.value, "");
    })
    .on("mousemove", moveTT)
    .on("mouseout", function() {
      g.selectAll(".sankey-link").attr("stroke-opacity", 1);
      hideTT();
    })
    .merge(linkSel).transition("data").duration(T).ease(d3.easeCubicOut)
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke-width", d => Math.max(1, d.width))
    .attr("stroke-opacity", 1)
    .attr("stroke", d => d.target.color || d.source.color || color(d.target.name.trim()));

  const nodeSel = g.selectAll(".snode").data(sNodes, d => d.name);
  nodeSel.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
  const nodeE = nodeSel.enter().append("g").attr("class", "snode").style("opacity", 0);
  nodeE.append("rect").attr("stroke", "#fff")
    .on("mouseover", function(e, d) {
      g.selectAll(".snode rect").attr("opacity", n => n === d ? 1 : 0.28);
      g.selectAll(".sankey-link").attr("stroke-opacity", l => (l.source === d || l.target === d) ? 1 : 0.16);
      showTT(e, d.name.trim(), d.value, "");
    })
    .on("mousemove", moveTT)
    .on("mouseout", function() {
      g.selectAll(".snode rect").attr("opacity", 1);
      g.selectAll(".sankey-link").attr("stroke-opacity", 1);
      hideTT();
    });
  nodeE.append("text").attr("class", "sn-text")
    .style("pointer-events", "none").style("fill", "#222");
  const nodeM = nodeE.merge(nodeSel);
  nodeM.transition("data").duration(T).ease(d3.easeCubicOut).style("opacity", 1);
  nodeM.select("rect").transition("data").duration(T).ease(d3.easeCubicOut)
    .attr("x", d => d.x0).attr("y", d => d.y0).attr("height", d => d.y1 - d.y0).attr("width", sankey.nodeWidth())
    .attr("fill", d => d.color || groupColor(d, color(d.name.trim())));

  const labelFont = Math.max(6.2, Math.min(10.5, 380 / Math.max(sNodes.length, 1)));

  nodeM.select("text")
    .attr("x", d => d.is_group ? d.x0 - 8 : d.x1 + 8).attr("y", d => (d.y1 + d.y0) / 2)
    .attr("text-anchor", d => d.is_group ? "end" : "start")
    .style("font-size", d => sz(d.is_group ? Math.max(labelFont + 0.8, 7.2) : labelFont))
    .each(function(d) {
      const t = d3.select(this);
      t.selectAll("*").remove();
      if (d.is_group) {
        t.append("tspan")
          .attr("dy", "-0.2em")
          .style("font-weight", "800")
          .style("letter-spacing", "0.02em")
          .text(d.name.trim());
        t.append("tspan")
          .attr("x", d.x0 - 8)
          .attr("dy", "1.15em")
          .style("font-size", sz(Math.max(labelFont - 0.4, 6)))
          .style("font-weight", "400")
          .text(formatValue(d.value, true));
      } else {
        t.append("tspan")
          .attr("dy", "0.35em")
          .style("font-weight", "700")
          .text(d.name.trim());
        t.append("tspan")
          .attr("dx", 4)
          .style("font-weight", "400")
          .text(formatValue(d.value, true));
      }
    });

  scheduleScreenshot(json.config);
}
