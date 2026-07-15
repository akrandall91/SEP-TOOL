/* SEP Tracker — USAspending.gov live award obligation/outlay lookups.
   Client-side call, no server/build step needed — USAspending's award API confirmed to serve open
   CORS headers (access-control-allow-origin: *) and requires no API key.

   VERIFIED END-TO-END during Phase 5 build: a real call to
     https://api.usaspending.gov/api/v2/awards/ASST_NON_DESE0000196_089/
   (the DOE EECBG grant to the City of Greensboro, matched by recipient name + exact $314,150
   amount + Dec 2024 date) returned total_obligation=314150.0 and total_outlay=95757.07 — real
   drawdown data that exists nowhere in either Progress Report PDF. This is the upgrade from
   "grant was received" (static fact) to "here's what's actually been drawn down as of [fetch date]"
   the Phase 5 brief asked for. Only wired to grants with a confirmed usaSpendingAwardId in
   funding.json — no attempt is made to guess an award ID at render time. */

const USASPENDING_AWARD_BASE = "https://api.usaspending.gov/api/v2/awards/";

async function fetchAwardDetail(awardId) {
  const res = await fetch(`${USASPENDING_AWARD_BASE}${encodeURIComponent(awardId)}/`);
  if (!res.ok) throw new Error(`USAspending API returned ${res.status}`);
  return res.json();
}

/**
 * Render a self-contained "live obligation/outlay" widget into `mountEl` for a single award.
 * @param {HTMLElement} mountEl
 * @param {string} awardId - a generated_unique_award_id, e.g. "ASST_NON_DESE0000196_089"
 */
function renderUsaSpendingWidget(mountEl, awardId) {
  mountEl.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--ink-muted);">Loading live USAspending.gov drawdown status…</div>`;

  fetchAwardDetail(awardId)
    .then((data) => {
      const obligated = data.total_obligation;
      const outlaid = data.total_outlay;
      const pct = obligated ? Math.min(100, Math.round((100 * outlaid) / obligated)) : null;
      mountEl.innerHTML = `
        <div class="chart-annotation-box" style="margin-top:8px;">
          <strong>💵 Live drawdown status (USAspending.gov, Award ${data.generated_unique_award_id || awardId})</strong>
          <div style="display:flex;gap:var(--space-4);margin-top:8px;flex-wrap:wrap;">
            <div><div class="dept-stat__label">Obligated</div><div style="font-weight:700;">$${(obligated || 0).toLocaleString()}</div></div>
            <div><div class="dept-stat__label">Outlaid (drawn down)</div><div style="font-weight:700;">$${(outlaid || 0).toLocaleString()}</div></div>
            ${pct != null ? `<div><div class="dept-stat__label">% drawn down</div><div style="font-weight:700;">${pct}%</div></div>` : ""}
          </div>
          <div style="font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:6px;">
            Live call to api.usaspending.gov — figures update as the City reports spending against the
            award; not stored in this dataset. Date signed: ${data.date_signed || "unknown"}.
          </div>
        </div>`;
    })
    .catch((e) => {
      mountEl.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--status-critical);margin-top:8px;">Live drawdown data unavailable: ${e.message}. The static grant amount above is unaffected.</div>`;
    });
}
