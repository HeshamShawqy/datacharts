function drawCirclePack(json, W, H, container) {
  const root = buildHierarchy(json.data);
  d3.pack().size([W, H]).padding(4)(root);

  let focus = root;
  let g = container.select("g.pack-inner");
  if (g.empty()) {
    g = container.append("g").attr("class", "pack-inner");
  }
  g.attr("transform", null);

  let bg = g.select("rect.pack-bg");
  if (bg.empty()) {
    bg = g.append("rect").attr("class", "pack-bg").attr("fill", "none").attr("pointer-events", "all");
  }
  bg.attr("width", W).attr("height", H)
    .on("click", () => { if (focus !== root) zoomTo(root); });

  const T = 450;
  const circles = g.selectAll("circle.pack-node").data(root.descendants(), nodeKey);
  circles.exit().transition("data").duration(T / 2).attr("r", 0).remove();
  circles.enter().append("circle").attr("class", "pack-node")
    .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 0)
    .merge(circles)
    .attr("fill", d => {
      if (!d.parent) return "none";
      if (d.children) return "none";
      return nodeColor(d);
    })
    .attr("stroke", d => d.children ? groupColor(d.data, color(d.data.name)) : "#fff")
    .attr("stroke-width", d => d.children ? 1 : 1.5)
    .style("pointer-events", "all")
    .style("cursor", d => d.parent && d.children ? "pointer" : "default")
    .on("mouseover", function(e, d) {
      if (!d.children && d.parent) {
        d3.select(this).attr("opacity", 0.75);
        showTT(e, d.data.name, d.value, d.parent.data.name !== "Total" ? d.parent.data.name : "");
      }
    })
    .on("mousemove", moveTT)
    .on("mouseout", function() { d3.select(this).attr("opacity", 1); hideTT(); })
    .on("click", function(e, d) {
      e.stopPropagation();
      if (d.children && focus !== d) zoomTo(d);
      else if (focus !== root) zoomTo(root);
    })
    .transition("data").duration(T).ease(d3.easeCubicOut)
    .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", d => d.r);

  const labelG = g.selectAll("g.lbl").data(root.descendants(), nodeKey);
  labelG.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
  const labelGM = labelG.enter().append("g").attr("class", "lbl")
    .style("pointer-events", "none")
    .merge(labelG)
    .style("opacity", 1);

  labelGM.selectAll("*").remove();

  labelGM.filter(d => d.children && d.parent)
    .append("text")
    .attr("x", d => d.x)
    .attr("y", d => d.y - d.r - 18)
    .attr("text-anchor", "middle")
    .style("fill", d => groupColor(d.data, color(d.data.name)))
    .style("font-weight", typeWeight("groupTitle"))
    .style("font-size", typeSize("groupTitle"))
    .text(d => d.data.name);

  labelGM.filter(d => d.children && d.parent)
    .append("text")
    .attr("x", d => d.x)
    .attr("y", d => d.y - d.r - 5)
    .attr("text-anchor", "middle")
    .style("fill", "#666")
    .style("font-size", typeSize("groupTotal"))
    .style("font-weight", typeWeight("groupTotal"))
    .text(d => formatValue(d.value, true));

  labelGM.filter(d => !d.children)
    .append("text")
    .attr("x", d => d.x).attr("y", d => d.y)
    .attr("text-anchor", "middle")
    .attr("dy", d => d.r > 18 ? "-0.15em" : "-0.05em")
    .style("fill", "#000")
    .style("font-weight", typeWeight("itemName"))
    .style("font-size", d => typeSize("itemName", Math.max(6.5, Math.min(11, d.r * 0.32))))
    .text(d => d.data.name !== "Total" ? d.data.name : "");

  labelGM.filter(d => !d.children)
    .append("text")
    .attr("x", d => d.x).attr("y", d => d.y)
    .attr("text-anchor", "middle").attr("dy", d => d.r > 18 ? "1.05em" : "0.95em")
    .style("fill", "#000000").style("font-weight", typeWeight("itemValue"))
    .style("font-size", d => typeSize("itemValue", Math.max(5.8, Math.min(9.5, d.r * 0.24))))
    .text(d => formatValue(d.value, true));

  labelGM.selectAll("text").style("opacity", 0)
    .transition("data").duration(T).ease(d3.easeCubicOut)
    .style("opacity", 1);

  function zoomTo(v) {
    focus = v;
    const k = Math.min(W, H) / (v.r * 2.2);
    const tx = W / 2 - v.x * k;
    const ty = H / 2 - v.y * k;
    g.transition().duration(500).ease(d3.easeCubicInOut)
      .attr("transform", `translate(${tx},${ty}) scale(${k})`);
    labelGM.selectAll("text").transition().duration(500)
      .style("font-size", function() {
        const base = d3.select(this.parentNode).datum();
        const size = base.children ? 11 : Math.max(6, Math.min(11, base.r * 0.32));
        return `${size / k}px`;
      });
  }

  scheduleScreenshot(json.config);
}
