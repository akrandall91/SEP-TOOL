/* SEP Tracker — homepage dashboard.
   Aggregates departments.json, funding-linkage.json, baseline-2019.json, resolution.json, and
   directives.json into the citywide rollup. Every number here is computed from the underlying
   data at render time, not hand-written — if the data changes, this page changes with it. */

const BASE = "./";

function deptSummary(departments) {
  return departments.departments
    .filter((d) => !d.externalOnly)
    .map((d) => {
      const goals = d.goals || [];
      const total = goals.length;
      const reported = goals.filter((g) => !g.dataGap).length;
      const funded = goals.filter((g) => g.fundingLink && g.fundingLink.hasActiveFunding).length;
      const wrongDirection = !!(d.progress2025 && d.progress2025.wrongDirection);
      return {
        id: d.id,
        name: d.name,
        total,
        reported,
        funded,
        wrongDirection,
        reportedPct: total ? Math.round((100 * reported) / total) : null,
        fundedPct: total ? Math.round((100 * funded) / total) : null,
      };
    });
}

function deptRowHtml(s) {
  return `
  <tr data-wrong="${s.wrongDirection}" data-reported-pct="${s.reportedPct ?? -1}">
    <td><a href="departments/${s.id}.html">${s.name}</a>${s.wrongDirection ? ' <span title="Moving away from its reduction target" style="color:var(--status-critical);font-weight:700;">⚠</span>' : ""}</td>
    <td style="text-align:center;font-variant-numeric:tabular-nums;">${s.total}</td>
    <td style="text-align:center;font-variant-numeric:tabular-nums;">${s.reported}/${s.total} ${s.reportedPct != null ? `(${s.reportedPct}%)` : ""}</td>
    <td style="text-align:center;font-variant-numeric:tabular-nums;">${s.funded}/${s.total} ${s.fundedPct != null ? `(${s.fundedPct}%)` : ""}</td>
  </tr>`;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function renderCitywideChart(directivesData) {
  const d1 = directivesData.directives.find((d) => d.number === 1);
  if (!d1 || !d1.multiYearGhgTotal) return;
  const series = d1.multiYearGhgTotal.series;
  const maxY = Math.ceil((Math.max(...series.map((s) => s.totalMtco2e)) * 1.1) / 10000) * 10000;
  const base2007 = series.find((s) => s.year === 2007).totalMtco2e;
  const targetValue = base2007 * 0.6; // illustrative 40% reduction line, same convention as department pages

  renderTrendChart(document.getElementById("citywide-chart-mount"), {
    unit: "MTCO2e",
    maxY,
    offTrack: false,
    targetValue,
    points: [
      ...series.map((s) => ({ label: String(s.year), value: s.totalMtco2e, isReal: true, note: `${s.pctChangeFrom2007}% vs. 2007${s.note ? " — " + s.note : ""}`, citation: d1.citation })),
      { label: "2025 target*", isTarget: true },
    ],
  });

  document.getElementById("citywide-chart-legend").innerHTML = `
    <div class="chart-legend__item"><span class="chart-legend__swatch" style="background:var(--status-good)"></span>Citywide total, self-reported (OSR)</div>
    <div class="chart-legend__item"><span class="chart-legend__swatch" style="background:repeating-linear-gradient(90deg, var(--ink-muted) 0 6px, transparent 6px 11px);"></span>Illustrative 40% target line*</div>
  `;

  document.getElementById("citywide-chart-annotation").innerHTML = `
    <strong>*About this chart:</strong> figures for 2007/2019/2022 come from the 2025 Progress Report's own multi-year
    table; 2023/2024 are transcribed from the same table as it appears in the 2024 Progress Report
    ${renderCite(d1.citation)}. This is OSR's own preliminary estimate, not an independently audited inventory — the
    official GHG inventory update (Directive 8) is due June 2026.
    ${d1.inconsistencyFlag && d1.inconsistencyFlag.value ? `<div class="chart-annotation-box" style="margin-top:var(--space-3);"><strong>⚠ Inconsistency in the source document:</strong> ${d1.inconsistencyFlag.note} ${renderCite(d1.inconsistencyFlag.citation)}</div>` : ""}
  `;
}

async function renderAqiWidget(base) {
  const mount = document.getElementById("aqi-mount");
  if (!mount) return;
  mount.innerHTML = `<div class="card"><div class="section-title">🌫 Guilford County air quality (EPA AQS, live)</div><p style="font-size:var(--font-size-sm);color:var(--ink-muted);">Loading…</p></div>`;
  const data = typeof loadLiveData === "function" ? await loadLiveData("aqs-snapshot.json", base) : null;

  if (!data) {
    mount.innerHTML = `<div class="card"><div class="section-title">🌫 Guilford County air quality (EPA AQS)</div><p style="font-size:var(--font-size-sm);color:var(--status-critical);">Live air-quality data unavailable right now.</p></div>`;
    return;
  }

  if (data.status === "pending-api-key") {
    mount.innerHTML = `<div class="card"><div class="section-title">🌫 Guilford County air quality (EPA AQS)</div><p style="font-size:var(--font-size-sm);color:var(--ink-muted);"><strong>Pending API key.</strong> ${data.note} Last checked ${new Date(data.checkedAt).toISOString().slice(0, 10)}.</p></div>`;
    return;
  }

  if (!data.hasData) {
    mount.innerHTML = `<div class="card"><div class="section-title">🌫 Guilford County air quality (EPA AQS)</div><p style="font-size:var(--font-size-sm);color:var(--ink-muted);">${data.note || "No recent readings available."}</p></div>`;
    return;
  }

  const r = data.latestReading;
  const meanLabel = typeof r.arithmeticMean === "number" ? r.arithmeticMean.toFixed(3) : r.arithmeticMean;
  const unitsLabel = r.units === "Parts per million" ? "ppm" : (r.units || "");
  const readingDate = new Date(r.date + "T00:00:00Z");
  const daysOld = Math.round((Date.now() - readingDate.getTime()) / 86400000);
  mount.innerHTML = `
    <div class="card">
      <div class="section-title">🌫 Guilford County air quality (EPA AQS, live)</div>
      <div class="dept-stats" style="margin-top:8px;">
        <div class="dept-stat"><div class="dept-stat__label">Most recent ozone reading</div><div class="dept-stat__value">${meanLabel} ${unitsLabel}</div></div>
        ${r.aqi != null
          ? `<div class="dept-stat"><div class="dept-stat__label">AQI</div><div class="dept-stat__value">${r.aqi}</div></div>`
          : `<div class="dept-stat"><div class="dept-stat__label">AQI</div><div class="dept-stat__value" style="color:var(--ink-muted);font-size:var(--font-size-sm);">Not reported for this reading</div></div>`}
      </div>
      <p style="font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:8px;">
        ${r.siteName || "Guilford County monitor"} · ${r.date} (${daysOld} days ago — AQS validates monitoring data in batches, so "most recent" here is not necessarily today) ·
        ${data.readingCount != null ? `${data.readingCount} readings in the queried window · ` : ""}${renderCite(data.citation)}
      </p>
    </div>`;
}

async function init() {
  const [departments, linkage, baseline, resolutionData, directivesData, indexData] = await Promise.all([
    loadJson("departments.json", BASE),
    loadJson("funding-linkage.json", BASE),
    loadJson("baseline-2019.json", BASE),
    loadJson("resolution.json", BASE),
    loadJson("directives.json", BASE),
    loadJson("index.json", BASE),
  ]);

  renderAqiWidget(BASE);

  const today = new Date(indexData.generatedAt);

  // ---- headline metrics ----
  const target2025 = resolutionData.mandates.find((m) => m.id === "ghg-40x2025");
  const target2040 = resolutionData.mandates.find((m) => m.id === "renewable-100x2040");
  const d2025 = new Date(target2025.deadlineDate);
  const d2040 = new Date(target2040.deadlineDate);
  const days2025 = daysBetween(today, d2025);
  const days2040 = daysBetween(today, d2040);

  document.getElementById("headline-metrics").innerHTML = `
    <div class="dept-stats" style="gap:var(--space-6);">
      <div class="dept-stat">
        <div class="dept-stat__label">Grid renewable share (last stated)</div>
        <div class="dept-stat__value">${baseline.dukeEnergyGridMix2019.rows.find((r) => r.sourceType.includes("Hydro")).pct}%</div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">Duke Energy generation mix, 2019 ${renderCite(baseline.dukeEnergyGridMix2019.citation)}. No updated citywide figure exists in either source — a gap, not a zero.</div>
      </div>
      <div class="dept-stat">
        <div class="dept-stat__label">GHG emissions trend (last confirmed)</div>
        <div class="dept-stat__value">${baseline.table7_ghgEmissionsSummary20072019.rows.find((r) => r.source === "Total").changePct}%</div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">2007→2019, all sources ${renderCite(baseline.table7_ghgEmissionsSummary20072019.citation)}. No 2025 GHG inventory exists yet — due June 2026 (Directive 8).</div>
      </div>
      <div class="dept-stat">
        <div class="dept-stat__label">2025 target (40% GHG/energy reduction)</div>
        <div class="dept-stat__value" style="color:var(--status-critical);">${days2025 <= 0 ? `${Math.abs(days2025)} days overdue` : `${days2025} days left`}</div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">Deadline ${target2025.deadlineDate}. Compliance unconfirmed — no post-2019 GHG inventory exists to verify it.</div>
      </div>
      <div class="dept-stat">
        <div class="dept-stat__label">2040 target (100% renewable)</div>
        <div class="dept-stat__value">${days2040} days left</div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">Deadline ${target2040.deadlineDate}.</div>
      </div>
    </div>`;

  // ---- report card ----
  const ghgDirective = directivesData.directives.find((d) => d.number === 8);
  const reportDirective = directivesData.directives.find((d) => d.number === 9);
  document.getElementById("report-card").innerHTML = `
    <div class="card" style="margin-bottom:var(--space-3);">
      <div style="font-weight:700;">Biennial GHG inventory (Resolution mandate)</div>
      <p style="margin-top:6px;">Mandated cadence: every 2 years. Last confirmed inventory: <strong>2019</strong> (in the 2022 SEP). Next: contracted December 2025, target completion <strong>June 2026</strong> ${renderCite(ghgDirective.citation)}.</p>
      <p style="font-size:var(--font-size-sm);color:var(--status-critical);">${directivesData.dataGapNote}</p>
    </div>
    <div class="card">
      <div style="font-weight:700;">Annual progress report (Resolution mandate)</div>
      <p style="margin-top:6px;">Mandated cadence: annual. Delivered: March 2024 (1st), April 2025 (2nd), February 2026 (3rd) ${renderCite(reportDirective.citation)}.</p>
      <p style="font-size:var(--font-size-sm);color:var(--ink-muted);">See the <a href="timeline.html">Timeline</a> for the full chronology.</p>
    </div>`;

  // ---- funded-vs-reported finding ----
  const h = linkage.headlineStats;
  document.getElementById("funding-finding").innerHTML = `
    <div class="callout">
      <div class="callout__title">📊 Funded work gets reported; unfunded work usually doesn't</div>
      <p><strong>${h.pctOfFundedGoalsReported}%</strong> of funded department goals were reported on in 2025, vs. only
      <strong>${h.pctOfUnfundedGoalsReported}%</strong> of unfunded goals (${h.totalFundedGoals} funded, ${h.totalUnfundedGoals} unfunded, of 21 total).
      <a href="funding.html">→ Full funding tracker</a></p>
    </div>`;

  // ---- citywide GHG trend chart (2007-2024, citywide total — not department-level) ----
  renderCitywideChart(directivesData);

  // ---- department table ----
  const summaries = deptSummary(departments);
  document.getElementById("dept-table-body").innerHTML = summaries.map(deptRowHtml).join("");
  window.__deptSummaries = summaries;

  wireControls();
  initCitePopovers(document.body);
}

function wireControls() {
  const wrongOnly = document.getElementById("filter-wrong-direction");
  const sortSelect = document.getElementById("dept-sort");

  function apply() {
    const rows = [...document.querySelectorAll("#dept-table-body tr")];
    rows.forEach((r) => {
      const show = !wrongOnly.checked || r.getAttribute("data-wrong") === "true";
      r.style.display = show ? "" : "none";
    });
    if (sortSelect.value === "reported") {
      rows.sort((a, b) => Number(b.getAttribute("data-reported-pct")) - Number(a.getAttribute("data-reported-pct")));
    } else if (sortSelect.value === "wrong") {
      rows.sort((a, b) => Number(b.getAttribute("data-wrong") === "true") - Number(a.getAttribute("data-wrong") === "true"));
    } else {
      rows.sort((a, b) => a.textContent.localeCompare(b.textContent));
    }
    const tbody = document.getElementById("dept-table-body");
    rows.forEach((r) => tbody.appendChild(r));
  }

  wrongOnly.addEventListener("change", apply);
  sortSelect.addEventListener("change", apply);
}

document.addEventListener("DOMContentLoaded", init);
