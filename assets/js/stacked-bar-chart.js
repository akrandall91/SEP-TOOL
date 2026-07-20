/* SEP Tracker — hand-rolled SVG stacked-bar chart.
   Bars (not an area/line) because the underlying years are unevenly spaced (2007, 2019, 2022,
   2023, 2024) — a line/area would visually imply interpolation across the 12-year 2007-2019 gap
   that isn't there. Per dataviz skill: fixed categorical color order (never cycled/reassigned),
   2px surface gaps between stacked segments, direct labels on the final bar's totals only
   (not every segment), always-visible legend text (the categorical palette used here validated
   with a contrast WARN, which requires visible labels rather than color-only — see
   scripts/validate_palette.js runs in this session), hover tooltip per segment. */

function renderStackedBarChart(mountEl, cfg) {
  // cfg: { years, categories: [{key,label,color}], seriesByCategory: {key: {year: value}}, unit }
  const W = 680, H = 380, padL = 70, padR = 24, padT = 24, padB = 70;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const barGap = 2; // 2px surface gap between stacked segments, per mark spec
  const groupGap = plotW / cfg.years.length * 0.35;
  const barW = (plotW / cfg.years.length) - groupGap;

  const totals = cfg.years.map((y) => cfg.categories.reduce((sum, c) => sum + (cfg.seriesByCategory[c.key][y] || 0), 0));
  const maxTotal = Math.max(...totals);
  const maxY = Math.ceil((maxTotal * 1.08) / 10000) * 10000;

  const xFor = (i) => padL + (plotW * (i + 0.5)) / cfg.years.length;
  const yFor = (v) => padT + plotH - (plotH * v) / maxY;

  let gridSvg = "";
  const steps = 5;
  for (let s = 0; s <= steps; s++) {
    const v = (maxY * s) / steps;
    const y = yFor(v);
    gridSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--gridline)" stroke-width="1" />`;
    gridSvg += `<text x="${padL - 10}" y="${y + 4}" font-size="11" fill="var(--ink-muted)" text-anchor="end">${Math.round(v).toLocaleString()}</text>`;
  }
  gridSvg += `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="var(--axis)" stroke-width="1.5" />`;

  let barsSvg = "";
  let labelsSvg = "";
  cfg.years.forEach((year, i) => {
    const cx = xFor(i);
    let cumY = padT + plotH;
    cfg.categories.forEach((cat) => {
      const val = cfg.seriesByCategory[cat.key][year] || 0;
      if (val <= 0) return;
      const heightPx = (plotH * val) / maxY;
      const y0 = cumY - heightPx;
      barsSvg += `
        <g class="stacked-bar-seg" tabindex="0" data-year="${year}" data-cat="${cat.label}" data-val="${val}" data-unit="${cfg.unit}">
          <rect x="${cx - barW / 2}" y="${y0}" width="${barW}" height="${Math.max(0, heightPx - barGap)}" fill="${cat.color}" rx="2" />
        </g>`;
      cumY = y0;
    });
    labelsSvg += `<text x="${cx}" y="${padT + plotH + 22}" font-size="12" fill="var(--ink-secondary)" text-anchor="middle">${year}</text>`;
    // direct label on final year's total only, per mark spec (selective, not every bar)
    if (i === cfg.years.length - 1) {
      labelsSvg += `<text x="${cx}" y="${yFor(totals[i]) - 10}" font-size="12" font-weight="700" fill="var(--ink-primary)" text-anchor="middle">${Math.round(totals[i]).toLocaleString()}</text>`;
    }
  });

  const legendSvg = cfg.categories
    .map((c, i) => `<div class="chart-legend__item"><span class="chart-legend__swatch" style="background:${c.color}"></span>${c.label}</div>`)
    .join("");

  mountEl.innerHTML = `
    <div class="trend-chart-wrap" style="position:relative;">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stacked bar chart" style="width:100%;height:auto;">
        ${gridSvg}
        ${barsSvg}
        ${labelsSvg}
      </svg>
      <div class="trend-tooltip cite-pop" style="position:absolute;"></div>
    </div>
    <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;margin-top:var(--space-3);font-size:var(--font-size-sm);">${legendSvg}</div>`;

  const tooltip = mountEl.querySelector(".trend-tooltip");
  mountEl.querySelectorAll(".stacked-bar-seg").forEach((seg) => {
    const rect = seg.querySelector("rect");
    function show() {
      const year = seg.getAttribute("data-year");
      const cat = seg.getAttribute("data-cat");
      const val = Number(seg.getAttribute("data-val"));
      const unit = seg.getAttribute("data-unit");
      tooltip.innerHTML = `<div class="cite-pop__title">${cat}, ${year}</div><div class="cite-pop__meta">${val.toLocaleString()} ${unit}</div>`;
      const bbox = rect.getBoundingClientRect();
      const wrapBox = mountEl.querySelector(".trend-chart-wrap").getBoundingClientRect();
      tooltip.style.left = `${bbox.left - wrapBox.left + bbox.width / 2 - 80}px`;
      tooltip.style.top = `${bbox.top - wrapBox.top - 8}px`;
      tooltip.classList.add("is-open");
    }
    function hide() { tooltip.classList.remove("is-open"); }
    seg.addEventListener("mouseenter", show);
    seg.addEventListener("mouseleave", hide);
    seg.addEventListener("focus", show);
    seg.addEventListener("blur", hide);
  });
}
