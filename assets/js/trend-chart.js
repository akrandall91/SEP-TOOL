/* SEP Tracker — hand-rolled SVG trend chart.
   Single-purpose: plot a department's real MWh trajectory (2019 -> 2025 preliminary) against an
   explicitly-labeled ILLUSTRATIVE target line, with citations on every real data point via hover/tap.
   Per dataviz skill: one axis, thin 2px lines, direct labels at key points, hover tooltip, visible legend. */

function renderTrendChart(mountEl, cfg) {
  // cfg: { points: [{x,label,value,citation,isReal}], targetValue, targetLabel, offTrack, maxY, unit }
  const W = 680, H = 340, padL = 64, padR = 24, padT = 24, padB = 56;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxY = cfg.maxY;
  const xFor = (i) => padL + (plotW * i) / (cfg.points.length - 1);
  const yFor = (v) => padT + plotH - (plotH * v) / maxY;

  const offTrackColor = "var(--status-critical)";
  const onTrackColor = "var(--status-good)";
  const lineColor = cfg.offTrack ? offTrackColor : onTrackColor;

  // gridlines + y labels (5 steps)
  let gridSvg = "";
  const steps = 5;
  for (let s = 0; s <= steps; s++) {
    const v = (maxY * s) / steps;
    const y = yFor(v);
    gridSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--gridline)" stroke-width="1" />`;
    gridSvg += `<text x="${padL - 10}" y="${y + 4}" font-size="11" fill="var(--ink-muted)" text-anchor="end">${Math.round(v).toLocaleString()}</text>`;
  }

  // actual trajectory line (only through real points, in order)
  const realPts = cfg.points.filter((p) => p.isReal);
  const linePath = realPts.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(cfg.points.indexOf(p))} ${yFor(p.value)}`).join(" ");

  // illustrative target line: from first real point to the target marker position
  const firstReal = realPts[0];
  const targetIdx = cfg.points.findIndex((p) => p.isTarget);
  let targetPath = "";
  if (firstReal && targetIdx > -1) {
    targetPath = `M ${xFor(cfg.points.indexOf(firstReal))} ${yFor(firstReal.value)} L ${xFor(targetIdx)} ${yFor(cfg.targetValue)}`;
  }

  let pointsSvg = "";
  let xLabelsSvg = "";
  cfg.points.forEach((p, i) => {
    const x = xFor(i);
    xLabelsSvg += `<text x="${x}" y="${H - padB + 22}" font-size="12" fill="var(--ink-secondary)" text-anchor="middle">${p.label}</text>`;
    if (p.isReal) {
      const y = yFor(p.value);
      pointsSvg += `
        <g class="trend-point" data-x="${x}" data-y="${y}" data-value="${p.value}" data-unit="${cfg.unit}" data-note="${(p.note || "").replace(/"/g, "&quot;")}" data-cite='${JSON.stringify(p.citation || {}).replace(/'/g, "&apos;")}' tabindex="0" style="cursor:pointer">
          <circle cx="${x}" cy="${y}" r="16" fill="transparent" />
          <circle cx="${x}" cy="${y}" r="6" fill="${lineColor}" stroke="var(--surface-1)" stroke-width="2" />
          <text x="${x}" y="${y - 14}" font-size="12" font-weight="700" fill="var(--ink-primary)" text-anchor="middle">${Math.round(p.value).toLocaleString()}</text>
        </g>`;
    } else if (p.isTarget) {
      const y = yFor(cfg.targetValue);
      pointsSvg += `
        <g class="trend-point trend-point--target" data-x="${x}" data-y="${y}" tabindex="0" style="cursor:pointer">
          <circle cx="${x}" cy="${y}" r="16" fill="transparent" />
          <path d="M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z" fill="var(--surface-1)" stroke="var(--ink-muted)" stroke-width="2" />
          <text x="${x}" y="${y - 14}" font-size="12" font-weight="700" fill="var(--ink-muted)" text-anchor="middle">${Math.round(cfg.targetValue).toLocaleString()}*</text>
        </g>`;
    } else if (p.futureMarker) {
      pointsSvg += `<text x="${x}" y="${padT + plotH / 2}" font-size="12" fill="var(--ink-muted)" text-anchor="middle" font-style="italic">${p.futureMarkerText}</text>`;
    }
  });

  const svg = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart" style="width:100%;height:auto;">
    ${gridSvg}
    <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="var(--axis)" stroke-width="1.5" />
    ${targetPath ? `<path d="${targetPath}" fill="none" stroke="var(--ink-muted)" stroke-width="2" stroke-dasharray="6 5" />` : ""}
    ${linePath ? `<path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linecap="round" />` : ""}
    ${pointsSvg}
    ${xLabelsSvg}
  </svg>`;

  mountEl.innerHTML = `<div class="trend-chart-wrap" style="position:relative;">${svg}<div class="trend-tooltip cite-pop" style="position:absolute;"></div></div>`;

  // wire hover/tap tooltips reusing the .cite-pop visual language
  const tooltip = mountEl.querySelector(".trend-tooltip");
  mountEl.querySelectorAll(".trend-point[data-value]").forEach((pt) => {
    function show(evt) {
      const value = Number(pt.getAttribute("data-value"));
      const unit = pt.getAttribute("data-unit");
      const note = pt.getAttribute("data-note");
      const citeRaw = pt.getAttribute("data-cite");
      let citeHtml = "";
      try {
        const citation = JSON.parse(citeRaw.replace(/&quot;/g, '"'));
        if (citation && (citation.source || citation.sourceType)) {
          const tier = citeTier(citation);
          citeHtml = buildPopoverHtml(citation, tier, citation.verificationStatus);
        }
      } catch (e) {}
      tooltip.innerHTML =
        `<div class="cite-pop__title">${value.toLocaleString()} ${unit}</div>` +
        (note ? `<div class="cite-pop__meta">${note}</div>` : "") +
        citeHtml;
      const x = pt.getAttribute("data-x"), y = pt.getAttribute("data-y");
      tooltip.style.left = `calc(${(x / W) * 100}% - 100px)`;
      tooltip.style.top = `calc(${(y / H) * 100}% + 14px)`;
      tooltip.classList.add("is-open");
    }
    function hide() { tooltip.classList.remove("is-open"); }
    pt.addEventListener("mouseenter", show);
    pt.addEventListener("mouseleave", hide);
    pt.addEventListener("focus", show);
    pt.addEventListener("blur", hide);
    pt.addEventListener("click", (e) => { e.stopPropagation(); show(e); });
  });
}
