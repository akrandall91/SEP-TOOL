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

async function fetchProjectPermits(project) {
  const params = new URLSearchParams({
    where: `${project.whereClause} AND IssuedDate>='2023-01-01'`,
    outFields: "PermitNum,Description,IssuedDate,TotalCost,FullAddress,CurrentStatus",
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
    </div>`;

  const resultsEl = mountEl.querySelector("#opengate-results");

  (async () => {
    const sections = [];
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
  })().catch((e) => {
    resultsEl.innerHTML = `<span style="color:var(--status-critical);">Live permit data unavailable: ${e.message}.</span>`;
  });
}
