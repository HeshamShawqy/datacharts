function drawDonut(json, W, H, container) {
  const cx = W / 2;
  const cy = H / 2;
  const outerR = Math.min(W, H) / 2 - 20;
  const hasParents = json.data.some(d => d.parent);
  const total = d3.sum(json.data, d => d.value);
  const T = 700;

  let g = container.select("g.donut-inner");
  if (g.empty()) {
    g = container.append("g").attr("class", "donut-inner")
      .attr("transform", `translate(${cx},${cy})`);
  }

  let centerName = g.select(".dn-cname");
  let centerVal = g.select(".dn-cval");
  if (centerName.empty()) {
    centerName = g.append("text").attr("class", "dn-cname").attr("text-anchor", "middle").attr("dy", "-0.3em")
      .style("font-weight", "700").style("fill", "#111");
    centerVal = g.append("text").attr("class", "dn-cval").attr("text-anchor", "middle").attr("dy", "1.1em")
      .style("fill", "#666");
  }
  centerName.style("font-size", sz(14)).text("Total");
  centerVal.style("font-size", sz(12)).text(formatValue(total));

  function resetCenter() {
    centerName.text("Total");
    centerVal.text(formatValue(total));
  }

  const nameHasCh = new Set(json.data.filter(d => d.parent).map(d => d.parent));
  const hier3 = buildHierarchy(json.data);
  const isDepth3 = hier3.height >= 3;

  if (hasParents) g.selectAll(".slice, .slice-lbl").remove();
  else g.selectAll(".i-arc, .o-arc, .r1-arc, .r2-arc, .r3-arc, .ring-lbl, .ring3-lbl").remove();

  if (hasParents && isDepth3) {
    g.selectAll(".i-arc, .o-arc, .ring-lbl").remove();
    const r1in = outerR * 0.18;
    const r1out = outerR * 0.38;
    const r2in = outerR * 0.41;
    const r2out = outerR * 0.63;
    const r3in = outerR * 0.66;
    const arcR1 = d3.arc().innerRadius(r1in).outerRadius(r1out - 2).cornerRadius(2).padAngle(0.025);
    const arcR2 = d3.arc().innerRadius(r2in + 2).outerRadius(r2out - 2).cornerRadius(2).padAngle(0.006);
    const arcR3 = d3.arc().innerRadius(r3in + 2).outerRadius(outerR).cornerRadius(2).padAngle(0.004);
    const l1nodes = hier3.children || [];
    const l1pie = d3.pie().value(d => d.value).sort(null).padAngle(0.025)(l1nodes);
    const allL2 = [];
    const allL3 = [];

    l1pie.forEach(ps => {
      const l2nodes = ps.data.children || [];
      const l2pie = d3.pie().value(d => d.value).sort(null)
        .startAngle(ps.startAngle + 0.012).endAngle(ps.endAngle - 0.012).padAngle(0.005)(l2nodes);
      l2pie.forEach(l2s => {
        allL2.push({ ...l2s, _l1Name: ps.data.data.name });
        d3.pie().value(d => d.value).sort(null)
          .startAngle(l2s.startAngle + 0.005).endAngle(l2s.endAngle - 0.005).padAngle(0.003)(l2s.data.children || [])
          .forEach((l3s, i, arr) => {
            allL3.push({
              ...l3s,
              _l1Name: ps.data.data.name,
              _l2Name: l2s.data.data.name,
              _i: i,
              _n: arr.length,
            });
          });
      });
    });

    const r1a = g.selectAll(".r1-arc").data(l1pie, d => d.data.data.name);
    r1a.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
    r1a.enter().append("path").attr("class", "r1-arc").attr("stroke", "#fff").attr("stroke-width", 2).style("cursor", "pointer")
      .each(function(d) { this.__prev = { startAngle: d.startAngle, endAngle: d.startAngle }; })
      .on("mouseover", function(e, d) {
        d3.select(this).transition("hover").duration(100).attr("transform", "scale(1.05)");
        centerName.text(d.data.data.name);
        centerVal.text(formatValue(d.data.value));
        showTT(e, d.data.data.name, d.data.value, "");
      })
      .on("mousemove", moveTT)
      .on("mouseout", function() {
        d3.select(this).transition("hover").duration(150).attr("transform", "scale(1)");
        resetCenter();
        hideTT();
      })
      .merge(r1a).transition("data").duration(T).ease(d3.easeCubicOut)
      .attrTween("d", function(d) { const i = d3.interpolate(this.__prev || d, d); this.__prev = { ...d }; return t => arcR1(i(t)); })
      .attr("fill", d => groupColor(d.data.data, rowColor(d.data.data, color(d.data.data.name))));

    const r2a = g.selectAll(".r2-arc").data(allL2, d => d._l1Name + "|" + d.data.data.name);
    r2a.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
    r2a.enter().append("path").attr("class", "r2-arc").attr("stroke", "#fff").attr("stroke-width", 1.5).style("cursor", "pointer")
      .each(function(d) { this.__prev = { startAngle: d.startAngle, endAngle: d.startAngle }; })
      .on("mouseover", function(e, d) {
        d3.select(this).transition("hover").duration(100).attr("transform", "scale(1.04)");
        centerName.text(d.data.data.name);
        centerVal.text(formatValue(d.data.value));
        showTT(e, d.data.data.name, d.data.value, d._l1Name);
      })
      .on("mousemove", moveTT)
      .on("mouseout", function() {
        d3.select(this).transition("hover").duration(150).attr("transform", "scale(1)");
        resetCenter();
        hideTT();
      })
      .merge(r2a).transition("data").duration(T).ease(d3.easeCubicOut)
      .attrTween("d", function(d) { const i = d3.interpolate(this.__prev || d, d); this.__prev = { ...d }; return t => arcR2(i(t)); })
      .attr("fill", d => rowColor(d.data.data, nestedColor(groupColor({ group_color: d.data.data.group_color }, color(d._l1Name)), 0, 2))).attr("opacity", 1);

    const r3a = g.selectAll(".r3-arc").data(allL3, d => d._l1Name + "|" + d._l2Name + "|" + d.data.data.name);
    r3a.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
    r3a.enter().append("path").attr("class", "r3-arc").attr("stroke", "#fff").attr("stroke-width", 1).style("cursor", "pointer")
      .each(function(d) { this.__prev = { startAngle: d.startAngle, endAngle: d.startAngle }; })
      .on("mouseover", function(e, d) {
        d3.select(this).transition("hover").duration(100).attr("transform", "scale(1.03)");
        centerName.text(d.data.data.name);
        centerVal.text(formatValue(d.data.value));
        showTT(e, d.data.data.name, d.data.value, d._l1Name + " › " + d._l2Name);
      })
      .on("mousemove", moveTT)
      .on("mouseout", function() {
        d3.select(this).transition("hover").duration(150).attr("transform", "scale(1)");
        resetCenter();
        hideTT();
      })
      .merge(r3a).transition("data").duration(T).ease(d3.easeCubicOut)
      .attrTween("d", function(d) { const i = d3.interpolate(this.__prev || d, d); this.__prev = { ...d }; return t => arcR3(i(t)); })
      .attr("fill", d => rowColor(d.data.data, nestedColor(groupColor({ group_color: d.data.data.group_color }, color(d._l1Name)), d._i, d._n)))
      .attr("opacity", 1);

    g.selectAll(".ring3-lbl").remove();
    l1pie.forEach(s => {
      if (s.endAngle - s.startAngle < 0.18) return;
      const mid = (s.startAngle + s.endAngle) / 2;
      const r = (r1in + r1out - 2) / 2;
      const t = g.append("text").attr("class", "ring3-lbl").attr("transform", `translate(${Math.sin(mid) * r},${-Math.cos(mid) * r})`).attr("text-anchor", "middle").style("pointer-events", "none");
      t.append("tspan").attr("x", 0).attr("dy", s.endAngle - s.startAngle > 0.35 ? "-0.4em" : "0.35em").style("font-size", sz(10)).style("font-weight", "700").style("fill", "#fff").text(s.data.data.name);
      if (s.endAngle - s.startAngle > 0.35) t.append("tspan").attr("x", 0).attr("dy", "1.3em").style("font-size", sz(9)).style("fill", "#ffffff").text(formatValue(s.data.value));
    });
    allL2.forEach(s => {
      if (s.endAngle - s.startAngle < 0.14) return;
      const mid = (s.startAngle + s.endAngle) / 2;
      const r = (r2in + 2 + r2out - 2) / 2;
      const t = g.append("text").attr("class", "ring3-lbl").attr("transform", `translate(${Math.sin(mid) * r},${-Math.cos(mid) * r})`).attr("text-anchor", "middle").style("pointer-events", "none");
      t.append("tspan").attr("x", 0).attr("dy", s.endAngle - s.startAngle > 0.26 ? "-0.4em" : "0.35em").style("font-size", sz(9)).style("font-weight", "600").style("fill", "#fff").text(s.data.data.name);
      if (s.endAngle - s.startAngle > 0.26) t.append("tspan").attr("x", 0).attr("dy", "1.3em").style("font-size", sz(8)).style("fill", "#ffffff").text(formatValue(s.data.value));
    });
  } else if (hasParents) {
    g.selectAll(".r1-arc, .r2-arc, .r3-arc, .ring3-lbl").remove();
    const innerR = outerR * 0.35;
    const midR = outerR * 0.62;
    const innerArc = d3.arc().innerRadius(innerR).outerRadius(midR - 3).cornerRadius(2).padAngle(0.025);
    const outerArc = d3.arc().innerRadius(midR + 1).outerRadius(outerR).cornerRadius(2).padAngle(0.008);
    const leafData = json.data.filter(d => !nameHasCh.has(d.name) && +d.value > 0);
    const groups = d3.group(leafData, d => d.parent || "Other");
    const groupList = [...groups.entries()]
      .map(([name, ch]) => ({
        name,
        value: d3.sum(ch, d => d.value),
        group_color: ch.find(d => d.group_color)?.group_color || null,
        children: ch.sort((a, b) => b.value - a.value),
      }))
      .sort((a, b) => b.value - a.value);
    const innerPie = d3.pie().value(d => d.value).sort(null).padAngle(0.025)(groupList);
    const iArcs = g.selectAll(".i-arc").data(innerPie, d => d.data.name);
    iArcs.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
    iArcs.enter().append("path").attr("class", "i-arc").attr("stroke", "#fff").attr("stroke-width", 2).style("cursor", "pointer")
      .each(function(d) { this.__prev = { startAngle: d.startAngle, endAngle: d.startAngle }; })
      .on("mouseover", function(e, d) {
        d3.select(this).transition("hover").duration(100).attr("transform", "scale(1.05)");
        centerName.text(d.data.name);
        centerVal.text(formatValue(d.data.value));
        showTT(e, d.data.name, d.data.value, "");
      })
      .on("mousemove", moveTT)
      .on("mouseout", function() {
        d3.select(this).transition("hover").duration(150).attr("transform", "scale(1)");
        resetCenter();
        hideTT();
      })
      .merge(iArcs).transition("data").duration(T).ease(d3.easeCubicOut)
      .attrTween("d", function(d) { const i = d3.interpolate(this.__prev || d, d); this.__prev = { ...d }; return t => innerArc(i(t)); })
      .attr("fill", d => groupColor(d.data, rowColor(d.data.children && d.data.children.length ? null : d.data, color(d.data.name))));

    const allOuter = [];
    innerPie.forEach(ps => {
      d3.pie().value(d => d.value).sort(null).startAngle(ps.startAngle + 0.012).endAngle(ps.endAngle - 0.012).padAngle(0.006)(ps.data.children)
        .forEach((s, i) => allOuter.push({ ...s, _pName: ps.data.name, _i: i, _n: ps.data.children.length }));
    });

    const oArcs = g.selectAll(".o-arc").data(allOuter, d => d._pName + "|" + d.data.name);
    oArcs.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
    oArcs.enter().append("path").attr("class", "o-arc").attr("stroke", "#fff").attr("stroke-width", 1).style("cursor", "pointer")
      .each(function(d) { this.__prev = { startAngle: d.startAngle, endAngle: d.startAngle }; })
      .on("mouseover", function(e, d) {
        d3.select(this).transition("hover").duration(100).attr("transform", "scale(1.04)");
        centerName.text(d.data.name);
        centerVal.text(formatValue(d.data.value));
        showTT(e, d.data.name, d.data.value, d._pName);
      })
      .on("mousemove", moveTT)
      .on("mouseout", function() {
        d3.select(this).transition("hover").duration(150).attr("transform", "scale(1)");
        resetCenter();
        hideTT();
      })
      .merge(oArcs).transition("data").duration(T).ease(d3.easeCubicOut)
      .attrTween("d", function(d) { const i = d3.interpolate(this.__prev || d, d); this.__prev = { ...d }; return t => outerArc(i(t)); })
      .attr("fill", d => rowColor(d.data, nestedColor(groupColor({ group_color: d.data.group_color }, color(d._pName)), d._i, d._n))).attr("opacity", 1);

    g.selectAll(".ring-lbl").remove();
    innerPie.forEach(s => {
      if (s.endAngle - s.startAngle < 0.18) return;
      const mid = (s.startAngle + s.endAngle) / 2;
      const r = (innerR + midR - 3) / 2;
      const t = g.append("text").attr("class", "ring-lbl").attr("transform", `translate(${Math.sin(mid) * r},${-Math.cos(mid) * r})`).attr("text-anchor", "middle").style("pointer-events", "none");
      t.append("tspan").attr("x", 0).attr("dy", "-0.5em").style("font-size", sz(11)).style("font-weight", "700").style("fill", "#fff").text(s.data.name);
      t.append("tspan").attr("x", 0).attr("dy", "1.3em").style("font-size", sz(10)).style("fill", "#ffffff").text(formatValue(s.data.value));
    });
    innerPie.forEach(ps => {
      d3.pie().value(d => d.value).sort(null).startAngle(ps.startAngle + 0.012).endAngle(ps.endAngle - 0.012).padAngle(0.006)(ps.data.children).forEach(s => {
        if (s.endAngle - s.startAngle < 0.15) return;
        const mid = (s.startAngle + s.endAngle) / 2;
        const r = (midR + 1 + outerR) / 2;
        const t = g.append("text").attr("class", "ring-lbl").attr("transform", `translate(${Math.sin(mid) * r},${-Math.cos(mid) * r})`).attr("text-anchor", "middle").style("pointer-events", "none");
        t.append("tspan").attr("x", 0).attr("dy", s.endAngle - s.startAngle > 0.3 ? "-0.4em" : "0.35em").style("font-size", sz(10)).style("font-weight", "700").style("fill", "#fff").text(s.data.name);
        if (s.endAngle - s.startAngle > 0.3) t.append("tspan").attr("x", 0).attr("dy", "1.3em").style("font-size", sz(9)).style("fill", "#ffffff").text(formatValue(s.data.value));
      });
    });
  } else {
    const singleData = json.data.filter(d => +d.value > 0).sort((a, b) => b.value - a.value);
    const innerR = outerR * 0.45;
    const arcGen = d3.arc().innerRadius(innerR).outerRadius(outerR).cornerRadius(2).padAngle(0.015);
    const pie = d3.pie().value(d => d.value).sort(null)(singleData);
    const slices = g.selectAll(".slice").data(pie, d => d.data.name);
    slices.exit().transition("data").duration(T / 2).style("opacity", 0).remove();
    slices.enter().append("path").attr("class", "slice").attr("stroke", "#fff").attr("stroke-width", 2).style("cursor", "pointer")
      .each(function() { this.__prev = { startAngle: 0, endAngle: 0 }; })
      .on("mouseover", function(e, d) {
        d3.select(this).transition("hover").duration(100).attr("transform", "scale(1.05)");
        centerName.text(d.data.name);
        centerVal.text(formatValue(d.data.value));
        showTT(e, d.data.name, d.data.value, "");
      })
      .on("mousemove", moveTT)
      .on("mouseout", function() {
        d3.select(this).transition("hover").duration(150).attr("transform", "scale(1)");
        resetCenter();
        hideTT();
      })
      .merge(slices).transition("data").duration(T).ease(d3.easeCubicOut)
      .attrTween("d", function(d) { const i = d3.interpolate(this.__prev || d, d); this.__prev = { ...d }; return t => arcGen(i(t)); })
      .attr("fill", d => rowColor(d.data, color(d.data.name)));

    g.selectAll(".slice-lbl").remove();
    pie.forEach(s => {
      if (s.endAngle - s.startAngle < 0.18) return;
      const mid = (s.startAngle + s.endAngle) / 2;
      const r = (innerR + outerR) / 2;
      const t = g.append("text").attr("class", "slice-lbl").attr("transform", `translate(${Math.sin(mid) * r},${-Math.cos(mid) * r})`).attr("text-anchor", "middle").style("pointer-events", "none");
      t.append("tspan").attr("x", 0).attr("dy", s.endAngle - s.startAngle > 0.32 ? "-0.4em" : "0.35em").style("font-size", sz(11)).style("font-weight", "700").style("fill", "#fff").text(s.data.name);
      if (s.endAngle - s.startAngle > 0.32) t.append("tspan").attr("x", 0).attr("dy", "1.3em").style("font-size", sz(10)).style("fill", "#ffffff").text(formatValue(s.data.value));
    });
  }

  scheduleScreenshot(json.config);
}
