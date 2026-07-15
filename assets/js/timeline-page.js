/* SEP Tracker — Timeline page.
   Combines index.json's reportCadence, resolution.json's mandated deadlines, and dated
   funding.json entries into one chronological list. "Today" for past/future/overdue
   classification is the dataset's own generatedAt date (index.json), not the visitor's
   clock — this is a snapshot-dated accountability tool, not a live feed, so framing
   everything as "true as of [snapshot date]" is more honest than a live-clock comparison
   that would silently drift as time passes after generation. */

const BASE = "./";

function parseDateLoose(d) {
  if (!d) return null;
  // "2025-12-31" | "2026-06" | "2019-12-03" | "2024" -> comparable Date
  const parts = d.split("-");
  if (parts.length === 1) return new Date(`${parts[0]}-06-30`); // mid-year fallback for bare years
  if (parts.length === 2) return new Date(`${parts[0]}-${parts[1]}-15`); // mid-month fallback
  return new Date(d);
}

function classify(dateStr, today) {
  const d = parseDateLoose(dateStr);
  if (!d) return "unknown";
  return d <= today ? "past" : "future";
}

function entryHtml(entry) {
  const cls = entry.status === "unknown" ? "unknown" : entry.status;
  const dot = { past: "var(--status-neutral)", future: "var(--cat-blue)", overdue: "var(--status-critical)", unknown: "var(--ink-muted)" }[cls];
  const dateLabel = entry.date || "date unknown";
  const badge = { past: "Occurred", future: "Upcoming", overdue: "⚠ Deadline passed", unknown: "Date unknown" }[cls];
  return `
  <div class="card" style="margin-bottom:var(--space-3);border-left:4px solid ${dot};">
    <div style="display:flex;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap;align-items:baseline;">
      <div style="font-weight:700;font-variant-numeric:tabular-nums;">${dateLabel}</div>
      <span class="status-badge" style="background:color-mix(in srgb, ${dot} 15%, transparent);color:${dot};"><span class="status-badge__dot" style="background:${dot};"></span>${badge}</span>
    </div>
    <div style="margin-top:4px;">${entry.label}</div>
    ${entry.note ? `<div style="font-size:var(--font-size-sm);color:var(--ink-muted);margin-top:4px;">${entry.note}</div>` : ""}
    ${entry.citation ? `<div style="margin-top:6px;">${renderCite(entry.citation, entry.citeOpts || {})}</div>` : ""}
  </div>`;
}

async function init() {
  const [indexData, resolutionData, fundingData, directivesData, legistarData] = await Promise.all([
    loadJson("index.json", BASE),
    loadJson("resolution.json", BASE),
    loadJson("funding.json", BASE),
    loadJson("directives.json", BASE),
    typeof loadLiveData === "function" ? loadLiveData("legistar-snapshot.json", BASE) : Promise.resolve(null),
  ]);

  const today = new Date(indexData.generatedAt);
  document.getElementById("today-note").textContent = `All "occurred / upcoming / overdue" labels below are relative to this dataset's own snapshot date: ${indexData.generatedAt}.`;

  const entries = [];
  const sepMatter = legistarData && legistarData.matters ? legistarData.matters.sep_authorizing_resolution : null;
  const sepExtensionMatter = legistarData && legistarData.matters ? legistarData.matters.sep_extension_resolution : null;

  indexData.reportCadence.forEach((e) => {
    let note = e.note;
    let citeOpts = {};
    if (sepMatter && /Resolution 19-0770 adopted/.test(e.label) && sepMatter.actions && sepMatter.actions.length) {
      const action = sepMatter.actions[0];
      note = `${note ? note + " " : ""}Live Legistar record: "${action.actionText}" Moved by ${action.mover}, seconded by ${action.seconder}. <a href="${sepMatter.legistarUrl}" target="_blank" rel="noopener">View on Legistar →</a>`;
    }
    entries.push({ date: e.date, label: e.label, note, citation: e.citation, citeOpts, status: e.date ? classify(e.date, today) : "unknown" });
  });

  if (sepExtensionMatter && sepExtensionMatter.agendaDate) {
    entries.push({
      date: sepExtensionMatter.agendaDate.slice(0, 10),
      label: `Resolution to Extend Time for Development of the Strategic Energy Plan (${sepExtensionMatter.matterFile}) — passed`,
      note: `Found via live Legistar lookup, not in this dataset's static source PDFs — direct primary-source evidence of the gap this site's own timeline already notes between resolution adoption (Dec 2019) and SEP publication (Nov 2022). <a href="${sepExtensionMatter.legistarUrl}" target="_blank" rel="noopener">View on Legistar →</a>`,
      citation: { sourceType: "external", publisher: "City of Greensboro / Legistar", title: sepExtensionMatter.title, url: sepExtensionMatter.legistarUrl, retrievedDate: legistarData.citation?.retrievedDate },
      citeOpts: { verificationStatus: "primary-source-verified" },
      status: classify(sepExtensionMatter.agendaDate.slice(0, 10), today),
    });
  }

  resolutionData.mandates
    .filter((m) => m.deadlineDate)
    .forEach((m) => {
      const status = classify(m.deadlineDate, today);
      entries.push({
        date: m.deadlineDate,
        label: `Resolution deadline: ${m.text}`,
        note: status === "future" ? null : "Mandated deadline — see the relevant department pages and funding-linkage.json for whether this was actually met.",
        citation: m.citation,
        status: status === "future" ? "future" : "overdue",
      });
    });

  const ghgTargetDirective = directivesData.directives.find((d) => d.number === 1);
  if (ghgTargetDirective && ghgTargetDirective.multiYearGhgTotal) {
    const finalYear = ghgTargetDirective.multiYearGhgTotal.series[ghgTargetDirective.multiYearGhgTotal.series.length - 1];
    entries.push({
      date: String(finalYear.year),
      label: `Self-reported 40% GHG reduction target reached (${finalYear.year} estimate, ${finalYear.pctChangeFrom2007}% vs. 2007) — pending official verification`,
      note: "OSR's own preliminary estimate from the multi-year emissions table, not an independently audited inventory. See Directive 1 on the Recommendations & Actions page for the inconsistency between this table and the report's own prose claim about which year the target was met.",
      citation: ghgTargetDirective.citation,
      status: classify(String(finalYear.year), today),
    });
  }

  const ghgDirective = directivesData.directives.find((d) => d.number === 8);
  if (ghgDirective && ghgDirective.targetCompletionDate) {
    const status = classify(ghgDirective.targetCompletionDate, today);
    entries.push({
      date: ghgDirective.targetCompletionDate,
      label: `Directive 8 target: updated GHG inventory (2022-2024) completion`,
      note: status !== "future" ? "Target completion date per the contracted timeline — check directives.json for the latest confirmed status." : null,
      citation: ghgDirective.citation,
      status: status === "future" ? "future" : "overdue",
    });
  }

  const allGrants = [
    ...fundingData.grants,
    ...fundingData.externalGrants.grants,
    ...fundingData.contracts,
  ];
  allGrants.forEach((g) => {
    const date = g.dateAwarded || g.contractAwarded;
    if (!date) return;
    entries.push({
      date,
      label: `${g.name}${g.amountUsd ? ` — $${g.amountUsd.toLocaleString()}` : ""}`,
      citation: g.citation,
      citeOpts: g.verificationStatus ? { verificationStatus: g.verificationStatus } : {},
      status: classify(date, today),
    });
  });

  const wsl = fundingData.externallyVerifiedRenewableAssets.whiteStreetLandfillSolar;
  entries.push({
    date: wsl.authorizingResolution.agendaDate,
    label: "White Street Landfill solar — authorizing resolution (Legistar 15-0607)",
    citation: wsl.authorizingResolution.citation,
    citeOpts: { verificationStatus: "primary-source-verified" },
    status: classify(wsl.authorizingResolution.agendaDate, today),
  });
  entries.push({
    date: wsl.asBuilt.operationalDate,
    label: `White Street Landfill solar — operational (${wsl.asBuilt.capacityMw} MW)`,
    citation: wsl.asBuilt.citation,
    citeOpts: { verificationStatus: "single-source-unconfirmed" },
    status: classify(wsl.asBuilt.operationalDate, today),
  });

  entries.sort((a, b) => {
    const da = parseDateLoose(a.date), db = parseDateLoose(b.date);
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });

  document.getElementById("timeline-list").innerHTML = entries.map(entryHtml).join("");
  initCitePopovers(document.body);
}

document.addEventListener("DOMContentLoaded", init);
