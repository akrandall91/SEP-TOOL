/* SEP Tracker — Funding page.
   Every grant/contract/mechanism from funding.json, grouped by purpose where the grouping is
   actually clean. NOTE: a strict dollar-total-by-category rollup was considered and rejected —
   EECBG ($314,150) alone funds three different purposes (fleet study, water/energy kits, GHG
   inventory prep) with no per-purpose breakdown given in the source, so splitting it across
   categories would require inventing a split the data doesn't support. Grouping is used for
   organization/scanability; totals are shown per-item and per-named-source, not forced into
   category subtotals that would imply false precision. */

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

  // City-report-sourced grants/contracts
  const cityFunded = [...fundingData.grants, ...fundingData.contracts];
  document.getElementById("city-reported-list").innerHTML = cityFunded.map((g) => grantCard(g)).join("");

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
