/* SEP Tracker — NREL PVWatts solar-potential estimator.
   Client-side call, no server/build step needed. Uses the public DEMO_KEY for out-of-the-box
   functionality; DEMO_KEY is rate-limited and shared globally by all NREL demo users, so a
   production deployment should register a free key at the developer portal and swap it in.

   IMPORTANT / surprising finding from Phase 4 verification: NREL's developer portal migrated
   from developer.nrel.gov to developer.nlr.gov as of a May 2026 reorganization — NREL (National
   Renewable Energy Laboratory) is now branded "National Laboratory of the Rockies" (NLR) under
   the Department of Energy. developer.nrel.gov no longer resolves (confirmed via direct fetch,
   DNS failure) — this widget uses the new domain, verified live with a real API call returning
   real data (5,694.53 kWh/yr AC output for a 4kW array at Greensboro, NC coordinates). If this
   domain migrates again, update PVWATTS_BASE below. */

const PVWATTS_BASE = "https://developer.nlr.gov/api/pvwatts/v8.json";
const PVWATTS_DEMO_KEY = "DEMO_KEY";

/**
 * Estimate annual solar generation for a site.
 * @param {object} opts - { lat, lon, systemCapacityKw, apiKey? }
 * @returns {Promise<object>} PVWatts API response (see developer.nlr.gov/docs/solar/pvwatts/v8/)
 */
async function estimateSolarPotential(opts) {
  const params = new URLSearchParams({
    api_key: opts.apiKey || PVWATTS_DEMO_KEY,
    lat: opts.lat,
    lon: opts.lon,
    system_capacity: opts.systemCapacityKw,
    azimuth: "180", // south-facing, standard NC installation assumption
    tilt: String(opts.tilt || 20),
    array_type: "1", // fixed roof mount
    module_type: "0", // standard
    losses: "14", // NREL's default system loss estimate
  });
  const res = await fetch(`${PVWATTS_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`PVWatts API returned ${res.status}`);
  const data = await res.json();
  if (data.errors && data.errors.length) throw new Error(data.errors.join("; "));
  return data;
}

/**
 * Render a self-contained solar-estimate widget into `mountEl`.
 * @param {HTMLElement} mountEl
 * @param {object} defaults - { lat, lon, systemCapacityKw, siteName }
 */
function renderPVWattsWidget(mountEl, defaults) {
  mountEl.innerHTML = `
    <div class="card" style="margin-top:var(--space-3);">
      <div class="section-title">☀ Estimate solar potential (live NREL PVWatts call)</div>
      <p style="font-size:var(--font-size-sm);color:var(--ink-secondary);">
        For ${defaults.siteName || "this site"}. Uses NREL's PVWatts v8 API with default assumptions
        (south-facing, 20° tilt, 14% system losses) — a rough estimate, not a design-grade study.
        This calls a live external API; figures are computed by NREL, not stored in this dataset.
        <strong>Lat/lon below default to a general Greensboro-area location, not a precisely
        geocoded site address</strong> (this dataset doesn't include verified site coordinates) —
        adjust them for a more accurate estimate.
      </p>
      <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;align-items:end;margin:var(--space-3) 0;">
        <label style="font-size:var(--font-size-sm);">Latitude
          <input type="number" id="pvw-lat" value="${defaults.lat}" step="0.0001" style="display:block;padding:6px 8px;width:110px;margin-top:4px;" />
        </label>
        <label style="font-size:var(--font-size-sm);">Longitude
          <input type="number" id="pvw-lon" value="${defaults.lon}" step="0.0001" style="display:block;padding:6px 8px;width:110px;margin-top:4px;" />
        </label>
        <label style="font-size:var(--font-size-sm);">System size (kW)
          <input type="number" id="pvw-capacity" value="${defaults.systemCapacityKw || 100}" min="1" max="10000" style="display:block;padding:6px 8px;width:120px;margin-top:4px;" />
        </label>
        <button id="pvw-run" class="funding-badge funding-badge--yes" style="cursor:pointer;border:none;font-size:var(--font-size-sm);padding:8px 16px;">Estimate</button>
      </div>
      <div id="pvw-result" style="font-size:var(--font-size-sm);"></div>
    </div>`;

  mountEl.querySelector("#pvw-run").addEventListener("click", async () => {
    const resultEl = mountEl.querySelector("#pvw-result");
    const capacity = Number(mountEl.querySelector("#pvw-capacity").value);
    const lat = Number(mountEl.querySelector("#pvw-lat").value);
    const lon = Number(mountEl.querySelector("#pvw-lon").value);
    resultEl.textContent = "Calling NREL PVWatts…";
    try {
      const data = await estimateSolarPotential({ lat, lon, systemCapacityKw: capacity });
      const out = data.outputs;
      resultEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--space-3);margin-top:var(--space-2);">
          <div><div class="dept-stat__label">Est. annual output</div><div style="font-weight:700;font-size:var(--font-size-lg);">${Math.round(out.ac_annual).toLocaleString()} kWh</div></div>
          <div><div class="dept-stat__label">Capacity factor</div><div style="font-weight:700;font-size:var(--font-size-lg);">${(out.capacity_factor).toFixed(1)}%</div></div>
          <div><div class="dept-stat__label">Solar radiation</div><div style="font-weight:700;font-size:var(--font-size-lg);">${out.solrad_annual.toFixed(2)} kWh/m²/day</div></div>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:8px;">
          Weather station: ${data.station_info.city || "nearest NSRDB station"}, ${data.station_info.distance ? Math.round(data.station_info.distance) + "m away" : ""}.
          Live call to developer.nlr.gov (NREL PVWatts v8) — not a cited/stored figure.
        </div>`;
    } catch (e) {
      resultEl.innerHTML = `<span style="color:var(--status-critical);">Estimate failed: ${e.message}. The shared DEMO_KEY is rate-limited — try again in a moment, or the API may be temporarily unavailable.</span>`;
    }
  });
}
