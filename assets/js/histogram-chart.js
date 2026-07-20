/* SEP Tracker — hand-rolled SVG histogram (single-series bar chart).
   Per dataviz skill: a single series needs no legend box (the chart title names it); one hue,
   thin bars, 2px surface gaps, direct label only on the tallest/mode bar (selective, not every
   bar), recessive gridlines, hover tooltip per bar. */

function renderHistogramChart(mountEl, cfg) {
  // cfg: { bins: [{label, value}], unit, color, xAxisLabel }
  const W = 640, H = 260, padL = 50, padR = 20, padT = 20, padB = 50;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const bins = cfg.bins;
  const maxVal = Math.max(...bins.map((b) => b.value));
  const barGap = 3;
  const barW = plotW / bins.length - barGap;
  const color = cfg.color || "var(--cat-blue)";

  const xFor = (i) => padL + (plotW * (i + 0.5)) / bins.length;
  const yFor = (v) => padT + plotH - (plotH * v) / maxVal;

  let gridSvg = "";
  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const v = Math.round((maxVal * s) / steps);
    const y = yFor(v);
    gridSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--gridline)" stroke-width="1" />`;
    gridSvg += `<text x="${padL - 8}" y="${y + 4}" font-size="10" fill="var(--ink-muted)" text-anchor="end">${v}</text>`;
  }
  gridSvg += `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="var(--axis)" stroke-width="1.5" />`;

  const modeIndex = bins.reduce((best, b, i) => (b.value > bins[best].value ? i : best), 0);
  let barsSvg = "";
  let labelsSvg = "";
  bins.forEach((b, i) => {
    const cx = xFor(i);
    const heightPx = (plotH * b.value) / maxVal;
    const y0 = padT + plotH - heightPx;
    barsSvg += `
      <g class="hist-bar" tabindex="0" data-label="${b.label}" data-value="${b.value}" data-unit="${cfg.unit || ""}">
        <rect x="${cx - barW / 2}" y="${y0}" width="${barW}" height="${Math.max(0, heightPx - barGap)}" fill="${color}" rx="2" />
      </g>`;
    labelsSvg += `<text x="${cx}" y="${padT + plotH + 16}" font-size="10" fill="var(--ink-secondary)" text-anchor="middle">${b.label}</text>`;
    if (i === modeIndex) {
      labelsSvg += `<text x="${cx}" y="${y0 - 6}" font-size="11" font-weight="700" fill="var(--ink-primary)" text-anchor="middle">${b.value}</text>`;
    }
  });

  mountEl.innerHTML = `
    <div class="trend-chart-wrap" style="position:relative;">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram" style="width:100%;height:auto;">
        ${gridSvg}
        ${barsSvg}
        ${labelsSvg}
      </svg>
      <div class="trend-tooltip cite-pop" style="position:absolute;"></div>
    </div>
    ${cfg.xAxisLabel ? `<div style="text-align:center;font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:2px;">${cfg.xAxisLabel}</div>` : ""}`;

  const tooltip = mountEl.querySelector(".trend-tooltip");
  mountEl.querySelectorAll(".hist-bar").forEach((bar) => {
    const rect = bar.querySelector("rect");
    function show() {
      tooltip.innerHTML = `<div class="cite-pop__title">${bar.getAttribute("data-label")}</div><div class="cite-pop__meta">${bar.getAttribute("data-value")} ${bar.getAttribute("data-unit")}</div>`;
      const bbox = rect.getBoundingClientRect();
      const wrapBox = mountEl.querySelector(".trend-chart-wrap").getBoundingClientRect();
      tooltip.style.left = `${bbox.left - wrapBox.left + bbox.width / 2 - 60}px`;
      tooltip.style.top = `${bbox.top - wrapBox.top - 8}px`;
      tooltip.classList.add("is-open");
    }
    function hide() { tooltip.classList.remove("is-open"); }
    bar.addEventListener("mouseenter", show);
    bar.addEventListener("mouseleave", hide);
    bar.addEventListener("focus", show);
    bar.addEventListener("blur", hide);
  });
}
