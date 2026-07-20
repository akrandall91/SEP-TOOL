/* SEP Tracker — Guilford County census-tract poverty-rate choropleth.
   Sequential magnitude encoding (one hue, light->dark) per dataviz skill, using this site's
   existing --seq-blue-* ramp (already validated elsewhere in tokens.css) rather than a rainbow or
   a second new ramp. Boundaries: data/geo/guilford-tracts.json, a one-time simplified fetch from
   Census TIGERweb (see scripts/fetch_guilford_tract_boundaries.py) — NOT re-fetched at render
   time, since tract lines don't change. Poverty-rate values: data/live/census-acs.json, refreshed
   monthly by GitHub Action. The two are joined client-side by tractFips (last 6 digits of GEOID).

   This is a real map (true tract geometry, not an approximate point plot like the permits widget)
   but still a plain equirectangular-style projection with a cos(latitude) correction, appropriate
   for a single small county — not a proper cartographic projection, and not claimed to be one. */

async function fetchTractBoundaries(base) {
  try {
    const res = await fetch(`${base}data/geo/guilford-tracts.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function renderTractChoropleth(mountEl, geoData, censusData) {
  if (!geoData || !geoData.tracts || !geoData.tracts.length) {
    mountEl.innerHTML = `<p style="font-size:var(--font-size-sm);color:var(--status-critical);">Tract boundary data unavailable right now.</p>`;
    return;
  }

  const byFips = {};
  (censusData?.allTracts || []).forEach((t) => { byFips[t.tractFips] = t; });

  const rates = Object.values(byFips).map((t) => t.povertyRatePct).filter((v) => typeof v === "number");
  const sorted = [...rates].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const breaks = [0, q(0.25), q(0.5), q(0.75), Infinity];
  const rampColors = ["var(--seq-blue-150)", "var(--seq-blue-300)", "var(--seq-blue-450)", "var(--seq-blue-600)"];
  const noDataColor = "var(--gridline)";

  function colorFor(rate) {
    if (typeof rate !== "number") return noDataColor;
    for (let i = 0; i < 4; i++) {
      if (rate >= breaks[i] && rate < breaks[i + 1]) return rampColors[i];
    }
    return rampColors[3];
  }

  const { minLon, maxLon, minLat, maxLat } = geoData.bbox;
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const W = 520, H = 480, pad = 16;
  const lonSpan = (maxLon - minLon) * lonScale;
  const latSpan = maxLat - minLat;
  const scale = Math.min((W - pad * 2) / lonSpan, (H - pad * 2) / latSpan);
  const xFor = (lon) => pad + (lon - minLon) * lonScale * scale;
  const yFor = (lat) => H - pad - (lat - minLat) * scale;

  const pathsSvg = geoData.tracts
    .map((t) => {
      const info = byFips[t.tractFips];
      const d = t.rings
        .map((ring) => "M " + ring.map((pt) => `${xFor(pt[0]).toFixed(1)},${yFor(pt[1]).toFixed(1)}`).join(" L ") + " Z")
        .join(" ");
      const fill = colorFor(info?.povertyRatePct);
      const label = info ? `${info.tractName.split(";")[0]}: ${info.povertyRatePct}% poverty${info.medianHouseholdIncomeUsd ? `, $${info.medianHouseholdIncomeUsd.toLocaleString()} median income` : ""}` : `Tract ${t.tractFips}: no ACS data`;
      return `<path class="tract-path" d="${d}" fill="${fill}" fill-rule="evenodd" stroke="var(--surface-1)" stroke-width="0.75" tabindex="0" data-label="${label.replace(/"/g, "&quot;")}" />`;
    })
    .join("");

  const legendSwatches = [
    { color: rampColors[0], label: `${breaks[0].toFixed(0)}–${breaks[1].toFixed(0)}%` },
    { color: rampColors[1], label: `${breaks[1].toFixed(0)}–${breaks[2].toFixed(0)}%` },
    { color: rampColors[2], label: `${breaks[2].toFixed(0)}–${breaks[3].toFixed(0)}%` },
    { color: rampColors[3], label: `${breaks[3].toFixed(0)}%+` },
    { color: noDataColor, label: "No ACS data" },
  ]
    .map((s) => `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:2px;background:${s.color};display:inline-block;"></span>${s.label}</span>`)
    .join("");

  mountEl.innerHTML = `
    <div class="trend-chart-wrap" style="position:relative;">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Guilford County census tracts by poverty rate" style="width:100%;max-width:520px;height:auto;">
        ${pathsSvg}
      </svg>
      <div class="trend-tooltip cite-pop" style="position:absolute;"></div>
    </div>
    <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-top:var(--space-3);font-size:var(--font-size-xs);color:var(--ink-muted);">
      <strong style="color:var(--ink-secondary);">Poverty rate:</strong>${legendSwatches}
    </div>`;

  const tooltip = mountEl.querySelector(".trend-tooltip");
  mountEl.querySelectorAll(".tract-path").forEach((path) => {
    function show(evt) {
      tooltip.innerHTML = `<div class="cite-pop__meta">${path.getAttribute("data-label")}</div>`;
      const wrapBox = mountEl.querySelector(".trend-chart-wrap").getBoundingClientRect();
      const px = (evt.clientX ?? evt.target.getBoundingClientRect().left) - wrapBox.left;
      const py = (evt.clientY ?? evt.target.getBoundingClientRect().top) - wrapBox.top;
      tooltip.style.left = `${Math.max(0, px - 90)}px`;
      tooltip.style.top = `${Math.max(0, py - 40)}px`;
      tooltip.classList.add("is-open");
    }
    function hide() { tooltip.classList.remove("is-open"); }
    path.addEventListener("mousemove", show);
    path.addEventListener("mouseleave", hide);
    path.addEventListener("focus", show);
    path.addEventListener("blur", hide);
  });
}
