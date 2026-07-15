/* SEP Tracker — generic department page renderer.
   Reads window.DEPT_ID (set inline per page) and renders from departments.json/baseline-2019.json/
   funding.json, baked at build time (see components.js loadJson()). This replaces the one-off
   department-water-resources.js — water-resources.html now uses this same generic script.

   IMPORTANT DATA REALITY this template respects (checked against departments.json directly, not
   assumed): only 3 of 13 department entries (water-resources, transportation-electricity,
   buildings-ei) have both a profile2019 usage figure AND a progress2025 preliminary figure for the
   same metric — i.e. only those 3 can show a real 2019->2025 trend chart. Every other department
   either has a 2019 baseline with no 2025 comparison (Coliseum electricity + all naturalGas/
   gasoline/diesel departments), no profile2019 at all (community-incentives), or isn't a goal-
   structured department at all (white-street-landfill). The template shows exactly what exists —
   it does not force a chart where there's no second data point, and does not fabricate one. */

const BASE = "../";

function fmt(n) { return Math.round(n).toLocaleString(); }

function getPctOfCity(dept) {
  const p = dept.profile2019 || {};
  return p.pctOfCityElectricity ?? p.pctOfCityElectricityByUseType ?? p.pctOfCityNaturalGas ??
         p.pctOfCityGasolineEmissions ?? p.pctOfCityDieselEmissions ?? null;
}

function getMetricUnit(dept) {
  if (dept.energySource === "electricity") return "MWh";
  if (dept.energySource === "naturalGas") return "therms";
  if (dept.energySource === "gasoline" || dept.energySource === "diesel") return "gallons";
  return "";
}

function getProfile2019Value(dept) {
  const p = dept.profile2019;
  if (!p) return null;
  if (p.usageMWh != null) return { value: p.usageMWh, sourced: true, citation: p.citation };
  if (p.thermsUsed != null) return { value: p.thermsUsed, sourced: true, citation: p.citation };
  if (p.gallonsUsed != null) return { value: p.gallonsUsed, sourced: true, citation: p.citation };
  // buildings-ei case: profile2019 has no usageMWh, only a % share by use-type. Derive from the
  // 2025 preliminary figure + stated % change if available, clearly flagged as derived, not sourced.
  if (dept.progress2025 && dept.progress2025.preliminaryUsageMWh != null && dept.progress2025.pctChangeVs2019 != null) {
    const derived = dept.progress2025.preliminaryUsageMWh / (1 + dept.progress2025.pctChangeVs2019 / 100);
    return {
      value: derived, sourced: false, citation: p.citation,
      derivedNote: "Derived from the 2025 preliminary figure and its stated % change — profile2019 does not independently state a MWh figure for this grouping (it only gives a % share of total City electricity by use-type).",
    };
  }
  return null;
}

function hasNumericTrend(dept) {
  const p2019 = getProfile2019Value(dept);
  return !!(p2019 && dept.progress2025 && dept.progress2025.preliminaryUsageMWh != null && dept.energySource === "electricity");
}

function extractPctByYearTarget(dept) {
  const goal = (dept.goals || []).find((g) => /demand by \d+% by \d{4}/i.test(g.text));
  if (!goal) return null;
  const m = goal.text.match(/(\d+)% by (\d{4})/);
  if (!m) return null;
  return { pct: Number(m[1]), year: Number(m[2]), goalNumber: goal.number };
}

function renderGoalCard(goal, extraHtml) {
  const badgesRight = [goalStatusBadgeHtml(goal), fundingBadgeHtml(goal.fundingLink), wentSilentBadgeHtml(goal)].join(" ");
  const historyBlock = statusHistoryHtml(goal);
  let statusBlock = "";

  if (goal.dataGap) {
    if (goal.deprioritizedInSource && goal.deprioritizedInSource.value) {
      const dep = goal.deprioritizedInSource;
      statusBlock = `<div class="goal__status-text"><em>"${dep.note}"</em> ${renderCite(dep.citation)}</div>`;
    } else {
      statusBlock = `<div class="goal__status-text">No 2025 status update found for this goal in the Progress Report. No reason is stated in the source.</div>`;
      if (goal.statusUpdate2025Note) {
        statusBlock += `<div class="goal__status-text" style="font-style:italic;color:var(--ink-muted);margin-top:6px;">${goal.statusUpdate2025Note}</div>`;
      }
    }
  } else if (goal.statusUpdate2025) {
    const su = goal.statusUpdate2025;
    statusBlock = `<div class="goal__status-text">${su.text || ""} ${renderCite(su.citation)}</div>`;
    if (su.statusNote) {
      statusBlock += `<div class="goal__status-text" style="font-style:italic;color:var(--ink-muted);margin-top:6px;">${su.statusNote}</div>`;
    }
  }

  statusBlock = historyBlock + statusBlock;

  return `
  <article class="goal" id="${goal.id}">
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
    <p>This project belongs to <strong>${wsl.name}</strong> — <a href="white-street-landfill.html">see the full page →</a></p>
  </div>`;
}

function renderLedConversionNote(series) {
  if (!series) return "";
  const rows = series.series
    .map((s) => `<span class="status-history__chip">${s.year}: <strong>${s.pctLed}%</strong>${s.ledCount != null ? ` (${s.ledCount.toLocaleString()} lamps)` : ""} ${s.citation ? renderCite(s.citation) : ""}</span>`)
    .join('<span class="status-history__arrow">→</span>');
  return `
  <div class="chart-annotation-box" style="margin-top:var(--space-3);">
    <strong>LED streetlamp conversion, ${series.unit}:</strong> ${series.note || ""}
    <div class="goal__status-history" style="margin-top:6px;">${rows}</div>
  </div>`;
}

function renderBuildingLogiXNote(note) {
  if (!note) return "";
  return `<div class="chart-annotation-box" style="margin-top:var(--space-3);">${note.note} ${renderCite(note.citation)}</div>`;
}

function renderReorgNote(dept) {
  if (!dept.note2025Reorg) return "";
  return `<div class="chart-annotation-box" style="margin-top:var(--space-3);"><strong>⚠ Organizational split affects this comparison:</strong> ${dept.note2025Reorg}</div>`;
}

function renderHeaderAndChart(dept) {
  const pctOfCity = getPctOfCity(dept);
  const unit = getMetricUnit(dept);
  const p2019 = getProfile2019Value(dept);

  let statsHtml = "";
  if (p2019) {
    const derivedTag = p2019.sourced ? "" : ` <span title="${p2019.derivedNote}" style="cursor:help;color:var(--status-warning);font-weight:700;">(derived*)</span>`;
    statsHtml += `
      <div class="dept-stat">
        <div class="dept-stat__label">2019 baseline</div>
        <div class="dept-stat__value">${fmt(p2019.value)} ${unit}${derivedTag}
          ${pctOfCity != null ? `<span style="font-size:var(--font-size-sm);font-weight:400;color:var(--ink-secondary);">(${pctOfCity}% of City ${dept.energySource === "electricity" ? "electricity" : dept.energySource === "naturalGas" ? "natural gas" : dept.energySource + " emissions"})</span>` : ""}
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">
          ${dept.profile2019.demandMW ? dept.profile2019.demandMW + " MW demand · " : ""}${dept.profile2019.costUsd || dept.profile2019.expenseUsd ? "$" + ((dept.profile2019.costUsd || dept.profile2019.expenseUsd) / 1e6).toFixed(1) + "M/yr" : ""}
          ${p2019.sourced ? renderCite(p2019.citation) : renderCite(p2019.citation) + " (baseline value itself derived, see note above)"}
        </div>
      </div>`;
  }

  const trend = hasNumericTrend(dept);
  if (trend) {
    const usage2025 = dept.progress2025.preliminaryUsageMWh;
    const pctChange = dept.progress2025.pctChangeVs2019;
    const deltaClass = dept.progress2025.wrongDirection ? "off-track" : "on-track";
    const deltaSymbol = pctChange >= 0 ? "▲" : "▼";
    statsHtml += `
      <div class="dept-stat">
        <div class="dept-stat__label">2025 preliminary</div>
        <div class="dept-stat__value">${fmt(usage2025)} ${unit}
          <span class="dept-stat__delta dept-stat__delta--${deltaClass}">${deltaSymbol} ${Math.abs(pctChange)}%</span>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">vs. 2019 ${dept.progress2025.wrongDirection ? '— moving <strong style="color:var(--status-critical)">away from</strong> the reduction target' : ""} ${renderCite(dept.progress2025.citation)}</div>
      </div>`;
  } else if (dept.profile2019) {
    statsHtml += `
      <div class="dept-stat">
        <div class="dept-stat__label">2025 preliminary</div>
        <div class="dept-stat__value" style="color:var(--ink-muted);font-size:var(--font-size-lg);">Not reported</div>
        <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">The 2025 Progress Report does not include a comparable ${unit} figure for this department.</div>
      </div>`;
  }

  document.getElementById("dept-header").innerHTML = `
    <div>
      <h1>${dept.name}</h1>
      <div class="dept-header__meta">${dept.energySource === "electricity" ? "Electricity" : dept.energySource === "naturalGas" ? "Natural gas" : dept.energySource === "gasoline" ? "Gasoline" : dept.energySource === "diesel" ? "Diesel" : "Community-wide"} — 2019 baseline, Strategic Energy Plan 2022</div>
    </div>
    <div class="dept-stats">${statsHtml || '<div class="dept-stat"><div class="dept-stat__value" style="color:var(--ink-muted);font-size:var(--font-size-lg);">No department-level baseline figures apply</div></div>'}</div>
  `;

  const chartSection = document.getElementById("chart-section");
  if (!trend) {
    chartSection.style.display = "none";
    return;
  }

  const usage2019 = p2019.value;
  const usage2025 = dept.progress2025.preliminaryUsageMWh;
  const target = extractPctByYearTarget(dept);
  const targetPct = target ? target.pct : 40;
  const illustrativeTarget = usage2019 * (1 - targetPct / 100);

  renderTrendChart(document.getElementById("trend-chart-mount"), {
    unit: "MWh",
    maxY: Math.ceil((Math.max(usage2019, usage2025) * 1.15) / 5000) * 5000,
    offTrack: !!dept.progress2025.wrongDirection,
    targetValue: illustrativeTarget,
    points: [
      { label: "2007", futureMarker: true, futureMarkerText: "no dept.\ndata" },
      { label: "2019", value: usage2019, isReal: true, note: p2019.sourced ? "Actual" : "Derived (see note)", citation: p2019.citation },
      { label: "2025 (prelim.)", value: usage2025, isReal: true, note: "Actual, preliminary", citation: dept.progress2025.citation },
      { label: `${target ? target.year : 2025} target*`, isTarget: true },
    ],
  });

  document.getElementById("chart-legend").innerHTML = `
    <div class="chart-legend__item"><span class="chart-legend__swatch" style="background:${dept.progress2025.wrongDirection ? "var(--status-critical)" : "var(--status-good)"}"></span>Actual usage${dept.progress2025.wrongDirection ? " (off track)" : ""}</div>
    <div class="chart-legend__item"><span class="chart-legend__swatch" style="background:repeating-linear-gradient(90deg, var(--ink-muted) 0 6px, transparent 6px 11px);"></span>Illustrative target line*</div>
  `;

  document.getElementById("chart-annotation").innerHTML = `
    <strong>*About the target line:</strong> Resolution 19-0770 states GHG/energy reduction targets relative to
    <strong>2005</strong> levels; the SEP itself substituted a <strong>2007</strong> baseline instead
    ${renderCite({ source: "sep2022", page: 13 })}. Neither figure exists at the department level in either
    source document. City-wide electricity use fell only 1% between 2007 and 2019 ${renderCite({ source: "sep2022", page: 26, table: "Table 10" })},
    so the dashed line above approximates the ${targetPct}% target off the department's real <strong>2019</strong>
    figure rather than a fabricated 2005/2007 number — a labeled approximation, not a sourced figure.
  ` + renderReorgNote(dept);
}

function renderGoalsSection(dept, wsl, fundingData) {
  const extraHtml = (goal) => {
    if (goal.relatedExternalFinding) {
      return renderWhiteStreetCallout(wsl, goal.relatedExternalFinding, fundingData);
    }
    if (goal.ledConversionTimeSeries) {
      return renderLedConversionNote(goal.ledConversionTimeSeries);
    }
    if (goal.buildingLogiX) {
      return renderBuildingLogiXNote(goal.buildingLogiX);
    }
    return "";
  };
  document.getElementById("goals-section").innerHTML = dept.goals.map((g) => renderGoalCard(g, extraHtml(g))).join("");

  if (dept.additionalGoalsNote) {
    document.getElementById("goals-section").insertAdjacentHTML("beforeend", `<p style="font-size:var(--font-size-sm);color:var(--ink-muted);">${dept.additionalGoalsNote}</p>`);
  }
}

function renderWhiteStreetLandfillPage(wsl, departments, fundingData) {
  document.getElementById("dept-header").innerHTML = `
    <div>
      <h1>${wsl.name}</h1>
      <div class="dept-header__meta">Not part of the SEP's Goal/Strategy/Action structure — see note below</div>
    </div>
  `;
  document.getElementById("chart-section").style.display = "none";

  const wr = departments.departments.find((d) => d.id === "water-resources");
  const wrGoal3 = wr.goals.find((g) => g.number === 3);

  const assetsHtml = wsl.externalAssets.map((a) => {
    if (a.id === "wsl-solar") {
      return `<div class="card" style="margin-bottom:var(--space-4);">
        <div class="section-title">Solar facility</div>
        <p><strong>${a.capacityMw} MW</strong> ground-mounted array, operational <strong>${a.operationalDate}</strong>,
        ~${a.homesEquivalent} homes-equivalent ${renderCite({ sourceType: "external", publisher: "City of Greensboro (via search aggregation)", title: "As-built specs", url: a.citation.url, retrievedDate: a.citation.retrievedDate, note: a.capacityConfidence }, { verificationStatus: "single-source-unconfirmed", label: "as-built figures" })}.</p>
        <p>Operator: ${a.operator}<br>Acreage: ${a.acreage}<br>Financing model: ${a.financingModel}</p>
        <p>${renderCite(a.citation, { verificationStatus: "primary-source-verified", label: "Legistar " + a.legistarFileId })}</p>
      </div>`;
    }
    return `<div class="card" style="margin-bottom:var(--space-4);">
      <div class="section-title">Landfill gas-to-energy</div>
      <p>${a.note} ~${a.homesEquivalent} homes-equivalent ${renderCite(a.citation, { verificationStatus: "single-source-unconfirmed" })}.</p>
    </div>`;
  }).join("");

  document.getElementById("goals-section-wrap").querySelector(".section-title").textContent = "Assets";
  document.getElementById("goals-section").innerHTML = `
    <p style="color:var(--ink-secondary);">${wsl.note}</p>
    ${assetsHtml}
    <div class="callout">
      <div class="callout__title">🔗 Cross-referenced from Water Resources</div>
      <p>${wsl.crossReferencedFrom.note}</p>
      <p><a href="water-resources.html">← See Water Resources Goal ${wrGoal3.number}: ${wrGoal3.text}</a></p>
    </div>
    <div id="pvwatts-mount"></div>
  `;
  if (typeof renderPVWattsWidget === "function") {
    renderPVWattsWidget(document.getElementById("pvwatts-mount"), {
      lat: 36.0568, lon: -79.7712, systemCapacityKw: 1000,
      siteName: "White Street Landfill (approximate area — the existing 4.8 MW array already occupies part of this site; this estimates additional/comparable capacity)",
    });
  }
}

async function init() {
  const deptId = window.DEPT_ID;
  const [departments, baseline, fundingData] = await Promise.all([
    loadJson("departments.json", BASE),
    loadJson("baseline-2019.json", BASE),
    loadJson("funding.json", BASE),
  ]);

  const dept = departments.departments.find((d) => d.id === deptId);
  const wsl = departments.departments.find((d) => d.id === "white-street-landfill");

  if (!dept) {
    document.getElementById("dept-header").innerHTML = `<p style="color:var(--status-critical);">Department "${deptId}" not found in departments.json.</p>`;
    return;
  }

  if (dept.externalOnly) {
    renderWhiteStreetLandfillPage(dept, departments, fundingData);
  } else {
    renderHeaderAndChart(dept);
    renderGoalsSection(dept, wsl, fundingData);
  }

  if (deptId === "buildings-ei" && typeof renderPVWattsWidget === "function") {
    const mount = document.createElement("div");
    document.getElementById("goals-section-wrap").appendChild(mount);
    renderPVWattsWidget(mount, {
      lat: 36.0693, lon: -79.7936, systemCapacityKw: 50,
      siteName: "Central Library rooftop (Table 12 — approximate downtown Greensboro location, not a geocoded roof address)",
    });
  }

  initCitePopovers(document.body);
}

document.addEventListener("DOMContentLoaded", init);
