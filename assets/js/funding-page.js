/* SEP Tracker — Funding page.
   Every grant/contract/mechanism from funding.json, grouped by purpose where the grouping is
   actually clean. NOTE: a strict dollar-total-by-category rollup was considered and rejected —
   EECBG ($314,150) alone funds four different purposes (fleet study, building/energy planning,
   vehicle inventory analysis, water/energy kits + GHG inventory prep — see funding.json >
   eecbg-2024 > fundedActivities) with no per-purpose dollar breakdown given in the source, so
   splitting it across categories would require inventing a split the data doesn't support.
   Grouping is used for organization/scanability; totals are shown per-item and per-named-source,
   not forced into category subtotals that would imply false precision. */

const BASE = "./";

function verificationBadge(status) {
  if (status === "primary-source-verified") return `<span style="font-size:11px;font-weight:700;color:var(--tier-3-external);">✓ primary-source-verified</span>`;
  if (status === "single-source-unconfirmed") return `<span style="font-size:11px;font-weight:700;font-style:italic;color:var(--tier-4-unconfirmed);">⚠ single-source-unconfirmed</span>`;
  return "";
}

function grantCard(g, opts) {
  opts = opts || {};
  const amount = g.amountUsd != null ? `$${g.amountUsd.toLocaleString()}` : (g.amountNote || "amount not disclosed");
  return `
  <div class="card" style="margin-bottom:var(--space-3);">
    <div style="display:flex;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap;align-items:flex-start;">
      <div>
        <div style="font-weight:700;">${g.name}</div>
        <div style="font-size:var(--font-size-sm);color:var(--ink-secondary);">${g.source || g.vendor || ""}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;font-variant-numeric:tabular-nums;">${amount}</div>
        <div>${g.verificationStatus ? verificationBadge(g.verificationStatus) : ""}</div>
      </div>
    </div>
    <p style="margin-top:8px;margin-bottom:4px;">${g.purpose || ""}</p>
    ${g.quote ? `<div class="callout" style="margin-top:8px;"><div class="callout__title">💬 Direct quote</div><p>"${g.quote.text}" — ${g.quote.speaker}</p></div>` : ""}
    <div style="margin-top:8px;">${renderCite(g.citation, { verificationStatus: g.verificationStatus })}</div>
    ${opts.linkedGoalHref ? `<div style="margin-top:6px;font-size:var(--font-size-sm);"><a href="${opts.linkedGoalHref}">→ ${opts.linkedGoalLabel}</a></div>` : ""}
    ${g.usaSpendingAwardId ? `<div class="usaspending-mount" data-award-id="${g.usaSpendingAwardId}"></div>` : ""}
    ${!g.usaSpendingAwardId && g.usaSpendingNote ? `<div style="font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--gridline);"><strong>USAspending.gov check:</strong> ${g.usaSpendingNote}</div>` : ""}
  </div>`;
}

function renderFundingHeatmap(linkageData) {
  const mount = document.getElementById("funding-heatmap-mount");
  if (!mount) return;
  const ct = linkageData.crossTab;

  // cell -> { count, tone }. tone drives color: "good" (reported), "critical" (funded but
  // gapped -- the exception), "muted" (unfunded and gapped -- the expected/unsurprising pattern).
  const cells = [
    { col: "internal", row: "reported", count: ct.internal_reported, tone: "good" },
    { col: "external", row: "reported", count: ct.external_reported, tone: "good" },
    { col: "none", row: "reported", count: ct.none_reported, tone: "neutral" },
    { col: "internal", row: "gapped", count: ct.internal_gapped, tone: ct.internal_gapped > 0 ? "critical" : "muted" },
    { col: "external", row: "gapped", count: ct.external_gapped, tone: ct.external_gapped > 0 ? "critical" : "muted" },
    { col: "none", row: "gapped", count: ct.none_gapped, tone: "muted" },
  ];
  const toneColor = {
    good: "var(--status-good)",
    critical: "var(--status-critical)",
    muted: "var(--status-muted)",
    neutral: "var(--status-neutral)",
  };
  const colLabels = { internal: "Internal funding", external: "External (verified)", none: "No funding" };
  const rowLabels = { reported: "Reported in 2025", gapped: "Not reported (gap)" };

  const cellHtml = (row) => ["internal", "external", "none"]
    .map((col) => {
      const cell = cells.find((c) => c.col === col && c.row === row);
      const color = toneColor[cell.tone];
      return `
        <div style="background:color-mix(in srgb, ${color} 14%, transparent);border:1px solid color-mix(in srgb, ${color} 40%, transparent);border-radius:var(--radius-md);padding:var(--space-3);text-align:center;">
          <div style="font-size:var(--font-size-xl);font-weight:700;color:${color};">${cell.count}</div>
          <div style="font-size:var(--font-size-xs);color:var(--ink-muted);">goal${cell.count === 1 ? "" : "s"}</div>
        </div>`;
    })
    .join("");

  mount.innerHTML = `
    <div style="display:grid;grid-template-columns:120px repeat(3, 1fr);gap:6px;align-items:center;">
      <div></div>
      <div style="font-size:var(--font-size-xs);font-weight:700;text-align:center;color:var(--ink-muted);text-transform:uppercase;">${colLabels.internal}</div>
      <div style="font-size:var(--font-size-xs);font-weight:700;text-align:center;color:var(--ink-muted);text-transform:uppercase;">${colLabels.external}</div>
      <div style="font-size:var(--font-size-xs);font-weight:700;text-align:center;color:var(--ink-muted);text-transform:uppercase;">${colLabels.none}</div>

      <div style="font-size:var(--font-size-xs);font-weight:700;color:var(--ink-muted);">${rowLabels.reported}</div>
      ${cellHtml("reported")}

      <div style="font-size:var(--font-size-xs);font-weight:700;color:var(--ink-muted);">${rowLabels.gapped}</div>
      ${cellHtml("gapped")}
    </div>
    <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;margin-top:var(--space-3);font-size:var(--font-size-xs);color:var(--ink-muted);">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--status-good);margin-right:4px;"></span>Funded and reported — the expected-good pattern</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--status-critical);margin-right:4px;"></span>Funded but NOT reported — the exception (CI-G1)</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--status-muted);margin-right:4px;"></span>Unfunded and not reported — the expected-unsurprising pattern</span>
    </div>`;
}

async function init() {
  const [fundingData, linkageData] = await Promise.all([
    loadJson("funding.json", BASE),
    loadJson("funding-linkage.json", BASE),
  ]);

  // Headline finding, pulled from computed data, not hand-written
  const h = linkageData.headlineStats;
  document.getElementById("headline-finding").innerHTML = `
    <div class="callout">
      <div class="callout__title">📊 Funding predicts reporting — the validated finding</div>
      <p><strong>${h.pctOfFundedGoalsReported}%</strong> of funded department goals were reported on in 2025.
      Only <strong>${h.pctOfUnfundedGoalsReported}%</strong> of unfunded goals were.
      (${h.totalFundedGoals} funded goals, ${h.totalUnfundedGoals} unfunded, out of 21 total.)</p>
      <p style="font-style:italic;color:var(--ink-muted);">${linkageData.verdict.text}</p>
    </div>`;

  renderFundingHeatmap(linkageData);

  // City-report-sourced grants/contracts
  const cityFunded = [...fundingData.grants, ...fundingData.contracts];
  document.getElementById("city-reported-list").innerHTML = cityFunded.map((g) => grantCard(g)).join("");

  // Live USAspending.gov obligation/outlay lookups — only for grants with a confirmed award ID match
  if (typeof renderUsaSpendingWidget === "function") {
    document.querySelectorAll(".usaspending-mount[data-award-id]").forEach((mount) => {
      renderUsaSpendingWidget(mount, mount.getAttribute("data-award-id"));
    });
  }

  // Externally-verified GTA funding history
  document.getElementById("external-gta-list").innerHTML = fundingData.externalGrants.grants
    .map((g) => grantCard(g, { linkedGoalHref: "departments/transportation-diesel.html#TR-D-G1", linkedGoalLabel: "See Transportation Dept. (Diesel) Goal 1" }))
    .join("");

  // White Street Landfill (not a grant, but a verified renewable asset)
  const wsl = fundingData.externallyVerifiedRenewableAssets;
  document.getElementById("renewable-assets-list").innerHTML = `
    <div class="card" style="margin-bottom:var(--space-3);">
      <div style="font-weight:700;">${wsl.whiteStreetLandfillSolar.name}</div>
      <p style="margin-top:8px;">${wsl.whiteStreetLandfillSolar.asBuilt.capacityMw} MW, operational ${wsl.whiteStreetLandfillSolar.asBuilt.operationalDate}. Land-lease / independent-power-producer model — not City grant money; the City receives ~$${wsl.whiteStreetLandfillSolar.authorizingResolution.annualLeasePaymentToCity.toLocaleString()}/year in lease rent.</p>
      <div style="margin-top:8px;">${renderCite(wsl.whiteStreetLandfillSolar.authorizingResolution.citation, { verificationStatus: "primary-source-verified", label: "Legistar 15-0607" })} ${renderCite(wsl.whiteStreetLandfillSolar.asBuilt.citation, { verificationStatus: "single-source-unconfirmed", label: "as-built specs" })}</div>
      <div style="margin-top:6px;font-size:var(--font-size-sm);"><a href="departments/white-street-landfill.html">→ Full page</a></div>
    </div>`;

  // Other financing mechanisms (descriptive, not dollar amounts)
  document.getElementById("mechanisms-list").innerHTML = `
    <p style="font-size:var(--font-size-sm);color:var(--ink-secondary);margin-bottom:var(--space-3);">${fundingData.otherFinancingMechanismsIdentifiedInSep2022.note} ${renderCite(fundingData.otherFinancingMechanismsIdentifiedInSep2022.citation)}</p>
    <ul>${fundingData.otherFinancingMechanismsIdentifiedInSep2022.mechanisms.map((m) => `<li style="margin-bottom:6px;"><strong>${m.name}</strong> — ${m.note}</li>`).join("")}</ul>`;

  // Unconfirmed lead (Central Library ARPA)
  const arpa = fundingData.externalOtherAllocations.centralLibraryArpaAllocation;
  document.getElementById("unconfirmed-leads-list").innerHTML = `
    <div class="card">
      <div style="font-weight:700;">${arpa.name}</div>
      <p style="margin-top:8px;">$${arpa.amountUsd.toLocaleString()} of a $${arpa.partOfPackageUsd.toLocaleString()} package. ${arpa.possibleRelevance}</p>
      <p style="font-size:var(--font-size-sm);color:var(--ink-muted);">${arpa.verificationAttempts}</p>
      <div style="margin-top:8px;">${renderCite(arpa.citation, { verificationStatus: "single-source-unconfirmed" })}</div>
    </div>`;

  initCitePopovers(document.body);
}

document.addEventListener("DOMContentLoaded", init);
