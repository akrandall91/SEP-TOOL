/* SEP Tracker — hand-rolled SVG sparkline. Minimal by design: no axes/gridlines (a sparkline is a
   compact "shape of the trend" read, not a chart to extract exact values from), one thin line +
   a light fill, an endpoint dot with a direct label (the one number worth calling out), hover
   crosshair per dataviz skill's interaction spec for line/area forms. */

function renderSparkline(mountEl, cfg) {
  // cfg: { points: [{date, value}], unit, color }
  const W = 640, H = 90, padX = 8, padY = 14;
  const plotW = W - padX * 2, plotH = H - padY * 2;
  const pts = cfg.points.filter((p) => typeof p.value === "number");
  if (!pts.length) {
    mountEl.innerHTML = `<p style="font-size:var(--font-size-sm);color:var(--ink-muted);">No time-series points available.</p>`;
    return;
  }
  const values = pts.map((p) => p.value);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const span = maxV - minV || 1;
  const color = cfg.color || "var(--cat-blue)";

  const xFor = (i) => padX + (plotW * i) / Math.max(1, pts.length - 1);
  const yFor = (v) => padY + plotH - (plotH * (v - minV)) / span;

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${xFor(pts.length - 1).toFixed(1)} ${(padY + plotH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padY + plotH).toFixed(1)} Z`;

  const last = pts[pts.length - 1];
  const dotsSvg = pts
    .map((p, i) => `<circle class="spark-pt" data-date="${p.date}" data-value="${p.value}" data-unit="${cfg.unit || ""}" cx="${xFor(i).toFixed(1)}" cy="${yFor(p.value).toFixed(1)}" r="9" fill="transparent" tabindex="0" style="cursor:pointer" />`)
    .join("");

  mountEl.innerHTML = `
    <div class="trend-chart-wrap" style="position:relative;">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sparkline" style="width:100%;height:auto;">
        <path d="${areaPath}" fill="${color}" fill-opacity="0.12" stroke="none" />
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${xFor(pts.length - 1).toFixed(1)}" cy="${yFor(last.value).toFixed(1)}" r="3.5" fill="${color}" stroke="var(--surface-1)" stroke-width="1.5" />
        <text x="${xFor(pts.length - 1).toFixed(1)}" y="${(yFor(last.value) - 8).toFixed(1)}" font-size="11" font-weight="700" fill="var(--ink-primary)" text-anchor="end">${last.value.toFixed(3)}</text>
        ${dotsSvg}
      </svg>
      <div class="trend-tooltip cite-pop" style="position:absolute;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:2px;">
      <span>${pts[0].date}</span><span>${last.date}</span>
    </div>`;

  const tooltip = mountEl.querySelector(".trend-tooltip");
  mountEl.querySelectorAll(".spark-pt").forEach((dot) => {
    function show() {
      tooltip.innerHTML = `<div class="cite-pop__title">${dot.getAttribute("data-value")} ${dot.getAttribute("data-unit")}</div><div class="cite-pop__meta">${dot.getAttribute("data-date")}</div>`;
      const bbox = dot.getBoundingClientRect();
      const wrapBox = mountEl.querySelector(".trend-chart-wrap").getBoundingClientRect();
      tooltip.style.left = `${bbox.left - wrapBox.left + bbox.width / 2 - 60}px`;
      tooltip.style.top = `${bbox.top - wrapBox.top - 10}px`;
      tooltip.classList.add("is-open");
    }
    function hide() { tooltip.classList.remove("is-open"); }
    dot.addEventListener("mouseenter", show);
    dot.addEventListener("mouseleave", hide);
    dot.addEventListener("focus", show);
    dot.addEventListener("blur", hide);
  });
}
