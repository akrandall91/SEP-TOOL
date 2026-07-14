/* SEP Tracker — Water Resources department page.
   This is the REFERENCE implementation: every other department page will be a template of this
   file's structure once approved. Keep logic here generic where practical (goalStatusState,
   renderCite, renderActionList, renderTrendChart all live in shared files) so templating later
   is a data-swap, not a rewrite. */

const BASE = "../";
// loadJson(filename, base) is shared — see assets/js/components.js. It prefers a
// build-time-baked <script type="application/json"> block over fetch().

function fmt(n) { return Math.round(n).toLocaleString(); }

function renderGoalCard(goal, extraHtml) {
  const badgesRight = [goalStatusBadgeHtml(goal), fundingBadgeHtml(goal.fundingLink)].join(" ");
  let statusBlock = "";

  if (goal.dataGap) {
    if (goal.deprioritizedInSource && goal.deprioritizedInSource.value) {
      const dep = goal.deprioritizedInSource;
      statusBlock = `<div class="goal__status-text"><em>"${dep.note}"</em> ${renderCite(dep.citation)}</div>`;
    } else {
      statusBlock = `<div class="goal__status-text">No 2025 status update found for this goal in the Progress Report. No reason is stated in the source.</div>`;
    }
  } else if (goal.statusUpdate2025) {
    const su = goal.statusUpdate2025;
    statusBlock = `<div class="goal__status-text">${su.text || ""} ${renderCite(su.citation)}</div>`;
    if (su.statusNote) {
      statusBlock += `<div class="goal__status-text" style="font-style:italic;color:var(--ink-muted);margin-top:6px;">${su.statusNote}</div>`;
    }
  }

  return `
  <article class="goal">
    <div class="goal__head">
      <div>
        <div class="goal__title">Goal ${goal.number}: ${goal.text}</div>
        <div class="goal__eval">Evaluation method (SEP 2022): ${goal.evaluationMethod} ${renderCite(goal.citation)}</div>
      </div>
      <div class="goal__badges">${badgesRight}</div>
    </div>
    <div class="goal__body">
      ${statusBlock}
      ${extraHtml || ""}
      <div style="margin-top:${extraHtml ? "12px" : "8px"};">
        ${renderActionList(goal.strategies)}
      </div>
    </div>
  </article>`;
}

function renderWhiteStreetCallout(wsl, relatedFinding, fundingData) {
  const solar = wsl.externalAssets.find((a) => a.id === "wsl-solar");
  const gas = wsl.externalAssets.find((a) => a.id === "wsl-gas-to-energy");
  const assetDetail = fundingData.externallyVerifiedRenewableAssets.whiteStreetLandfillSolar;
  const authCitation = assetDetail.authorizingResolution.citation;
  const asBuiltCitation = assetDetail.asBuilt.citation;
  return `
  <div class="callout">
    <div class="callout__title">🔗 Related renewable energy project exists outside this department's reporting</div>
    <p>${relatedFinding.text}</p>
    <p style="font-style:italic;color:var(--ink-muted);">${relatedFinding.framingNote}</p>
    <p>
      <strong>White Street Landfill Solar Facility</strong> — ${solar.capacityMw} MW, operational ${solar.operationalDate},
      ~${solar.homesEquivalent} homes-equivalent. Owned/operated by ${solar.operator}, on City-leased land.
      ${renderCite(authCitation, { verificationStatus: "primary-source-verified", label: "Legistar 15-0607" })}
      &nbsp;·&nbsp; as-built specs ${renderCite(asBuiltCitation, { verificationStatus: "single-source-unconfirmed", label: "as-built figures" })}
    </p>
    <p>Also on-site: a separate <strong>landfill gas-to-energy project</strong>, ~${gas.homesEquivalent} homes-equivalent
      ${renderCite(gas.citation, { verificationStatus: "single-source-unconfirmed" })}
    </p>
    <p>This project belongs to <strong>${wsl.name}</strong> — see the full entry in <code>data/departments.json</code>.</p>
  </div>`;
}

async function init() {
  const [departments, baseline, fundingData] = await Promise.all([
    loadJson("departments.json", BASE),
    loadJson("baseline-2019.json", BASE),
    loadJson("funding.json", BASE),
  ]);

  const dept = departments.departments.find((d) => d.id === "water-resources");
  const wsl = departments.departments.find((d) => d.id === "white-street-landfill");

  // ---- header ----
  const usage2019 = dept.profile2019.usageMWh;
  const usage2025 = dept.progress2025.preliminaryUsageMWh;
  const pctChange = dept.progress2025.pctChangeVs2019;
  const deltaClass = dept.progress2025.wrongDirection ? "off-track" : "on-track";
  const deltaSymbol = pctChange >= 0 ? "▲" : "▼";

  document.getElementById("dept-header").innerHTML = `
    <div>
      <h1>Water Resources Department</h1>
      <div class="dept-header__meta">Largest single consumer of City electricity — Table 3, 2019 baseline</div>
    </div>
    <div class="dept-stats">
      <div class="dept-stat">
        <div class="dept-stat__label">2019 baseline</div>
        <div class="dept-stat__value">${fmt(usage2019)} MWh <span style="font-size:var(--font-size-sm);font-weight:400;color:var(--ink-secondary);">(${dept.profile2019.pctOfCityElectricity}% of City electricity)</span></div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">${dept.profile2019.demandMW} MW demand · $${(dept.profile2019.expenseUsd/1e6).toFixed(1)}M/yr ${renderCite(dept.profile2019.citation)}</div>
      </div>
      <div class="dept-stat">
        <div class="dept-stat__label">2025 preliminary</div>
        <div class="dept-stat__value">${fmt(usage2025)} MWh
          <span class="dept-stat__delta dept-stat__delta--${deltaClass}">${deltaSymbol} ${Math.abs(pctChange)}%</span>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">vs. 2019 — moving <strong style="color:var(--status-critical)">away from</strong> the 40%-reduction-by-2025 target ${renderCite(dept.progress2025.citation)}</div>
      </div>
    </div>
  `;

  // ---- trend chart ----
  const illustrativeTarget = usage2019 * 0.6; // -40%, anchored to 2019 — see annotation for why
  renderTrendChart(document.getElementById("trend-chart-mount"), {
    unit: "MWh",
    maxY: Math.ceil((Math.max(usage2019, usage2025) * 1.15) / 5000) * 5000,
    offTrack: true,
    targetValue: illustrativeTarget,
    points: [
      { label: "2007", futureMarker: true, futureMarkerText: "no dept.\ndata" },
      { label: "2019", value: usage2019, isReal: true, note: "Actual, Table 3", citation: dept.profile2019.citation },
      { label: "2025 (prelim.)", value: usage2025, isReal: true, note: "Actual, preliminary", citation: dept.progress2025.citation },
      { label: "2025 target*", isTarget: true },
    ],
  });

  document.getElementById("chart-legend").innerHTML = `
    <div class="chart-legend__item"><span class="chart-legend__swatch" style="background:var(--status-critical)"></span>Actual usage (off track)</div>
    <div class="chart-legend__item"><span class="chart-legend__swatch" style="background:repeating-linear-gradient(90deg, var(--ink-muted) 0 6px, transparent 6px 11px);"></span>Illustrative target line*</div>
  `;

  document.getElementById("chart-annotation").innerHTML = `
    <strong>*About the target line:</strong> Resolution 19-0770 states the 40% reduction target relative to
    <strong>2005</strong> levels; the SEP itself substituted a <strong>2007</strong> baseline instead
    ${renderCite({ source: "sep2022", page: 13 })}. Neither figure exists at the department level in either
    source document — Table 3 (2019 department breakdown) has no 2007 or 2005 counterpart. City-wide electricity
    use fell only 1% between 2007 and 2019 ${renderCite({ source: "sep2022", page: 26, table: "Table 10" })}, so
    the dashed line above approximates the 40% target off the department's real <strong>2019</strong> figure
    rather than a fabricated 2005/2007 number — it is a labeled approximation, not a sourced figure. Two
    numerically-identical lines were not drawn for the two baseline years, since without real 2005/2007
    department data they would be indistinguishable and implying otherwise would overstate precision this
    dataset doesn't have.
    <br><br>
    <strong>2040 target (Goal 3, different metric):</strong> 100% of electricity demand met by renewable
    sources — not shown on this MWh chart since renewable share (%) and consumption (MWh) are different axes,
    and no interim renewable-generation data exists for this department to plot a trend against.
  `;

  // ---- goals ----
  const wr3ExtraHtml = (goal) => {
    if (goal.number === 3 && goal.relatedExternalFinding) {
      return renderWhiteStreetCallout(wsl, goal.relatedExternalFinding, fundingData);
    }
    return "";
  };

  document.getElementById("goals-section").innerHTML = dept.goals
    .map((g) => renderGoalCard(g, wr3ExtraHtml(g)))
    .join("");

  initCitePopovers(document.body);
}

document.addEventListener("DOMContentLoaded", init);
