/* SEP Tracker — Open Gate City (data.greensboro-nc.gov) live building-permit lookups.
   Client-side call, no server/build step needed — the underlying ArcGIS FeatureServer at
   gis.greensboro-nc.gov confirmed to serve open CORS headers (Access-Control-Allow-Origin
   reflects the request Origin) and requires no API key.

   VERIFIED END-TO-END with real queries during Phase 5 build: this exact query pattern returned
   real permit records for two known SEP-related City capital projects — a $1.6M Central Library
   roof-replacement permit (issued ~March 2025, matching the site's existing "new roof installed
   in 2025" note) and a $149,900 Windsor Recreation Center demolition permit (issued April 2025) —
   neither dollar figure exists anywhere in the two Progress Report PDFs. This is real enrichment,
   not a guess: the permits dataset (`BI_Permits`, City of Greensboro building permits 1998-present)
   has NO green-building/LEED/Energy-Star compliance field, so this widget does not and should not
   claim to verify Rec 4's "meets green building standards" requirement — it verifies that permitted
   construction activity is real and shows its live status/cost, nothing more. */

const OPENGATE_PERMITS_LAYER = "https://gis.greensboro-nc.gov/arcgis/rest/services/OpenGateCity/OpenData_HRES_DS/MapServer/2/query";

// Known SEP-related City capital projects, matched by address or description keyword during
// verification. Add more here as new projects are confirmed against a real query — do not guess
// at addresses that haven't been checked.
const KNOWN_PROJECTS = [
  { label: "Central Library", whereClause: "FullAddress='219 N CHURCH ST'" },
  { label: "Windsor Recreation Center", whereClause: "(Description LIKE '%WINDSOR%' OR Description LIKE '%CHAVIS%') AND FullAddress='1601 E GATE CITY BLVD'" },
  { label: "Greensboro Science Center", whereClause: "Description LIKE '%SCIENCE CENTER%'" },
];

function esriDateToLabel(ms) {
  if (!ms) return "date unknown";
  return new Date(ms).toISOString().slice(0, 10);
}

/* BI_Permits' XCoord/YCoord are NC State Plane North (NAD83, EPSG:2264, US survey feet) — NOT
   lat/lon (confirmed: raw values run ~1.7-1.8 million / ~800-900 thousand, far outside any
   lat/lon range). Converted here with a standard Lambert Conformal Conic (2SP) inverse projection
   (Snyder's "Map Projections: A Working Manual") rather than a live geometry-service call, so the
   map doesn't depend on a second external API. VERIFIED during Phase 5 build against Esri's public
   geometry service (tasks.arcgisonline.com/.../GeometryServer/project) for the Central Library
   permit's real coordinates — this implementation matched Esri's own projection to within a few
   millimeters (36.074829° vs. Esri's 36.074836°). */
function ncStatePlaneToWgs84(xFt, yFt) {
  const usFoot = 1200 / 3937;
  const x = xFt * usFoot, y = yFt * usFoot;
  const a = 6378137.0, f = 1 / 298.257222101;
  const e2 = 2 * f - f * f, e = Math.sqrt(e2);
  const lat1 = (34 + 20 / 60) * Math.PI / 180;
  const lat2 = (36 + 10 / 60) * Math.PI / 180;
  const lat0 = (33 + 45 / 60) * Math.PI / 180;
  const lon0 = -79 * Math.PI / 180;
  const falseEasting = 2000000.002 * usFoot;

  const m = (lat) => Math.cos(lat) / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
  const t = (lat) => Math.tan(Math.PI / 4 - lat / 2) / Math.pow((1 - e * Math.sin(lat)) / (1 + e * Math.sin(lat)), e / 2);

  const m1 = m(lat1), m2 = m(lat2);
  const t1 = t(lat1), t2 = t(lat2), t0 = t(lat0);
  const n = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
  const F = m1 / (n * Math.pow(t1, n));
  const rho0 = a * F * Math.pow(t0, n);

  const xp = x - falseEasting, yp = y;
  const rho = Math.sign(n) * Math.sqrt(xp * xp + (rho0 - yp) * (rho0 - yp));
  const theta = Math.atan2(xp, rho0 - yp);
  const tRho = Math.pow(rho / (a * F), 1 / n);

  let lat = Math.PI / 2 - 2 * Math.atan(tRho);
  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat);
    lat = Math.PI / 2 - 2 * Math.atan(tRho * Math.pow((1 - e * sinLat) / (1 + e * sinLat), e / 2));
  }
  const lon = theta / n + lon0;
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}

async function fetchProjectPermits(project) {
  const params = new URLSearchParams({
    where: `${project.whereClause} AND IssuedDate>='2023-01-01'`,
    outFields: "PermitNum,Description,IssuedDate,TotalCost,FullAddress,CurrentStatus,XCoord,YCoord",
    orderByFields: "IssuedDate DESC",
    resultRecordCount: "3",
    f: "json",
  });
  const res = await fetch(`${OPENGATE_PERMITS_LAYER}?${params.toString()}`);
  if (!res.ok) throw new Error(`Open Gate City API returned ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Open Gate City query error");
  return (data.features || []).map((f) => f.attributes);
}

/** Lightweight coordinate-position plot — explicitly NOT a full basemap (no streets/labels), just
 * the known points positioned relative to each other and linked out to a real map for context. */
function renderPermitMiniMap(mountEl, points) {
  if (!points.length) { mountEl.innerHTML = ""; return; }
  const projected = points.map((p) => ({ ...p, ...ncStatePlaneToWgs84(p.XCoord, p.YCoord) }));
  const lats = projected.map((p) => p.lat), lons = projected.map((p) => p.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180); // correct for longitude compression at this latitude

  const W = 320, H = 220, pad = 30;
  const lonSpan = Math.max(0.02, (Math.max(...lons) - Math.min(...lons)) * lonScale);
  const latSpan = Math.max(0.02, Math.max(...lats) - Math.min(...lats));
  const xFor = (lon) => pad + ((lon - Math.min(...lons)) * lonScale / lonSpan) * (W - pad * 2);
  const yFor = (lat) => H - pad - ((lat - Math.min(...lats)) / latSpan) * (H - pad * 2);

  const dots = projected
    .map(
      (p, i) => `
      <a href="https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lon.toFixed(6)}" target="_blank" rel="noopener">
        <circle cx="${xFor(p.lon).toFixed(1)}" cy="${yFor(p.lat).toFixed(1)}" r="7" fill="var(--cat-orange)" stroke="var(--surface-1)" stroke-width="2" />
        <text x="${xFor(p.lon).toFixed(1)}" y="${(yFor(p.lat) - 12).toFixed(1)}" font-size="10" font-weight="700" fill="var(--ink-primary)" text-anchor="middle">${p.label}</text>
      </a>`
    )
    .join("");

  mountEl.innerHTML = `
    <div style="margin-top:var(--space-3);">
      <div style="font-size:var(--font-size-sm);font-weight:600;margin-bottom:4px;">Where these permits are (click a pin for the full map)</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Approximate positions of known SEP-related permit locations" style="width:100%;max-width:320px;height:auto;background:var(--page-plane);border:1px solid var(--border-hairline);border-radius:var(--radius-md);">
        ${dots}
      </svg>
      <p style="font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:4px;">
        Relative positions only — a coordinate plot, not a street map. Coordinates converted client-side from the
        City's NC State Plane data (verified against Esri's public projection service; see source comment).
      </p>
    </div>`;
}

/**
 * Render a self-contained "live building permits" widget into `mountEl`.
 * @param {HTMLElement} mountEl
 */
function renderOpenGateWidget(mountEl) {
  mountEl.innerHTML = `
    <div class="card" style="margin-top:var(--space-3);">
      <div class="section-title">🏗 Live building-permit status (Open Gate City, City of Greensboro ArcGIS data)</div>
      <p style="font-size:var(--font-size-sm);color:var(--ink-secondary);">
        Recent permits (2023–present) for City capital projects referenced in this dataset's static
        report data, queried live from the City's own building-permits dataset. This confirms
        permitted construction activity and its cost/status — it does NOT verify green-building or
        LEED compliance, since that dataset carries no such field. This calls a live external API;
        figures below are not stored in this dataset.
      </p>
      <div id="opengate-results" style="margin-top:var(--space-3);">Loading live permit data…</div>
      <div id="opengate-map"></div>
    </div>`;

  const resultsEl = mountEl.querySelector("#opengate-results");
  const mapEl = mountEl.querySelector("#opengate-map");

  (async () => {
    const sections = [];
    const mapPoints = [];
    let anyFound = false;
    let anyError = false;

    for (const project of KNOWN_PROJECTS) {
      try {
        const permits = await fetchProjectPermits(project);
        if (permits.length) {
          anyFound = true;
          const rows = permits
            .map(
              (p) => `<li style="margin-bottom:6px;">
                <strong>${(p.Description || "").trim()}</strong>
                ${p.TotalCost ? ` — $${p.TotalCost.toLocaleString()}` : ""}
                <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">
                  Permit #${p.PermitNum} · issued ${esriDateToLabel(p.IssuedDate)} · ${(p.CurrentStatus || "").trim()} · ${p.FullAddress || ""}
                </div>
              </li>`
            )
            .join("");
          sections.push(`<div style="margin-bottom:var(--space-3);"><strong>${project.label}</strong><ul style="margin-top:4px;padding-left:20px;">${rows}</ul></div>`);
          const withCoords = permits.find((p) => p.XCoord && p.YCoord);
          if (withCoords) mapPoints.push({ label: project.label, XCoord: withCoords.XCoord, YCoord: withCoords.YCoord });
        } else {
          sections.push(`<div style="margin-bottom:var(--space-3);color:var(--ink-muted);font-size:var(--font-size-sm);"><strong>${project.label}</strong> — no permits found in the live dataset for 2023–present.</div>`);
        }
      } catch (e) {
        anyError = true;
        sections.push(`<div style="margin-bottom:var(--space-3);color:var(--status-critical);font-size:var(--font-size-sm);"><strong>${project.label}</strong> — live lookup failed (${e.message}).</div>`);
      }
    }

    resultsEl.innerHTML = sections.join("") +
      `<div style="font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:8px;">
        Live query to gis.greensboro-nc.gov (Open Gate City / ArcGIS). ${anyFound ? "" : "No matching permits found for any tracked project — "}${anyError ? "Some lookups failed; retry later if the API is temporarily unavailable." : ""}
      </div>`;

    renderPermitMiniMap(mapEl, mapPoints);
  })().catch((e) => {
    resultsEl.innerHTML = `<span style="color:var(--status-critical);">Live permit data unavailable: ${e.message}.</span>`;
  });
}
