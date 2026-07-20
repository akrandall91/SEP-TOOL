/* SEP Tracker — Recommendations & Actions board.
   Renders recommendations.json (8 recs), directives.json (3 directives), and
   prioritized-actions.json (53 actions, 4 phases). One global status filter applies to all
   three sections via data-status attributes; a sort control reorders the recommendations grid. */

const BASE = "./";

function resolveLinkedTo(linkedTo) {
  // linkedTo is free text like "departments.json > buildings-ei > Goal 1" or
  // "recommendations.json > REC-3 > Strategy 3.1" or "funding.json > grants > eecbg-2024".
  // Best-effort resolution to a real link; falls back to plain (non-linked) text.
  if (!linkedTo) return null;
  const list = Array.isArray(linkedTo) ? linkedTo : [linkedTo];
  return list.map((entry) => {
    const parts = entry.split(">").map((s) => s.trim());
    if (parts[0] === "departments.json" && parts[1]) {
      return { href: `departments/${parts[1]}.html`, label: entry };
    }
    if (parts[0] === "recommendations.json" && parts[1]) {
      return { href: `recommendations.html#${parts[1]}`, label: entry };
    }
    if (parts[0] === "funding.json") {
      return { href: `funding.html`, label: entry };
    }
    return { href: null, label: entry };
  });
}

function linkedToHtml(linkedTo) {
  const resolved = resolveLinkedTo(linkedTo);
  if (!resolved) return "";
  return resolved
    .map((r) => (r.href ? `<a href="${r.href}">${r.label}</a>` : r.label))
    .join(", ");
}

function statusFilterAttr(state) {
  return state;
}

function renderRecCard(rec) {
  const state = recommendationStatusState(rec);
  let bodyHtml = statusHistoryHtml(rec);

  if (rec.status2025) {
    bodyHtml += `<div class="goal__status-text">${rec.status2025.text} ${renderCite(rec.status2025.citation)}</div>`;
  } else if (state === "mixed") {
    bodyHtml += `<div class="goal__status-text" style="font-style:italic;color:var(--ink-muted);margin-bottom:8px;">No single top-level status — see individual strategies below.</div>`;
  } else {
    bodyHtml += `<div class="goal__status-text">No 2025 status update found for this recommendation.</div>`;
  }

  if (rec.stalled && rec.stalled.value) {
    bodyHtml += `<div class="chart-annotation-box" style="margin-top:var(--space-3);">${rec.stalled.note}</div>`;
  }

  if (rec.number === 3) {
    bodyHtml += `<div id="census-acs-mount"></div>`;
  }
  if (rec.number === 4) {
    bodyHtml += `<div id="opengate-mount"></div>`;
  }

  const stratHtml = (rec.strategies || [])
    .map((s) => {
      const hasStatus = s.status2025 && s.status2025.status;
      const sState = hasStatus ? mapStatusWord(s.status2025.status) : "not-reported";
      const badge = `<span class="status-badge status-badge--${sState}" style="font-size:11px;padding:1px 8px;"><span class="status-badge__dot"></span>${STATUS_LABEL[sState]}</span>`;
      const funding = s.fundingLink ? fundingBadgeHtml(s.fundingLink) : "";
      const text = hasStatus
        ? `${s.status2025.text} ${renderCite(s.status2025.citation)}`
        : (s.status2025Note || "Not individually status-updated in the 2025 report.");
      return `<li style="margin-bottom:10px;"><strong>Strategy ${s.number}:</strong> ${s.text} ${badge} ${funding}<div style="font-size:var(--font-size-sm);color:var(--ink-secondary);margin-top:4px;">${text}</div></li>`;
    })
    .join("");

  return `
  <article class="goal rec-card" id="${rec.id}" data-status="${statusFilterAttr(state)}">
    <div class="goal__head">
      <div>
        <div class="goal__title">Recommendation ${rec.number}: ${rec.title}</div>
        <div class="goal__eval">Evaluation method (SEP 2022): ${rec.evaluationMethod} ${renderCite(rec.citation)}</div>
      </div>
      <div class="goal__badges">
        <span class="status-badge status-badge--${state}"><span class="status-badge__dot"></span>${STATUS_LABEL[state]}</span>
        ${rec.fundingLink ? fundingBadgeHtml(rec.fundingLink) : ""}
        ${stalledBadgeHtml(rec)}
      </div>
    </div>
    <div class="goal__body">
      ${bodyHtml}
      <details class="strategy" open>
        <summary>Strategies (${(rec.strategies || []).length})</summary>
        <ul class="strategy__actions" style="padding-left:var(--space-4);">${stratHtml}</ul>
      </details>
    </div>
  </article>`;
}

async function renderCensusAcsWidget(mountEl, base) {
  mountEl.innerHTML = `<div class="chart-annotation-box" style="margin-top:var(--space-3);">Loading live Census ACS vulnerable-communities data…</div>`;
  const data = typeof loadLiveData === "function" ? await loadLiveData("census-acs.json", base) : null;

  if (!data) {
    mountEl.innerHTML = `<div class="chart-annotation-box" style="margin-top:var(--space-3);color:var(--status-critical);">Live Census ACS data unavailable right now.</div>`;
    return;
  }

  if (data.status === "pending-api-key") {
    mountEl.innerHTML = `<div class="chart-annotation-box" style="margin-top:var(--space-3);"><strong>📊 Live vulnerable-communities data — pending API key.</strong> ${data.note}</div>`;
    return;
  }

  const top = data.highestPovertyTracts || [];
  const rows = top
    .slice(0, 5)
    .map((t) => {
      // Census's own NAME field is verbose ("Census Tract 114; Guilford County; North Carolina") —
      // the county/state are already stated in the section header above, so trim the redundant part.
      const shortName = (t.tractName || "").split(";")[0].trim() || t.tractName;
      return `<li style="margin-bottom:4px;">${shortName} — <strong>${t.povertyRatePct}%</strong> poverty rate${t.medianHouseholdIncomeUsd ? `, $${t.medianHouseholdIncomeUsd.toLocaleString()} median household income` : ""} (pop. ${t.population.toLocaleString()})</li>`;
    })
    .join("");

  mountEl.innerHTML = `
    <div class="chart-annotation-box" style="margin-top:var(--space-3);">
      <strong>📊 Live vulnerable-communities view (Census ACS 5-Year, ${data.tractCount} Guilford County tracts)</strong>
      <p style="font-size:var(--font-size-sm);margin-top:6px;">${data.cejstNote}</p>
      <div style="font-size:var(--font-size-sm);margin-top:8px;"><strong>Highest-poverty tracts:</strong></div>
      <ul style="font-size:var(--font-size-sm);padding-left:20px;margin-top:4px;">${rows}</ul>
      <div style="font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:6px;">${renderCite(data.citation)}</div>
    </div>`;
}

function directiveStatusState(status) {
  return mapStatusWord(status) || "reported-plain";
}

function renderGhgSeriesTable(multiYearGhgTotal) {
  const rows = multiYearGhgTotal.series
    .map((s) => `<tr><td style="padding:4px 10px;">${s.year}</td><td style="padding:4px 10px;text-align:right;font-variant-numeric:tabular-nums;">${s.totalMtco2e.toLocaleString()}</td><td style="padding:4px 10px;text-align:right;font-variant-numeric:tabular-nums;">${s.pctChangeFrom2007}%</td><td style="padding:4px 10px;font-size:var(--font-size-xs);color:var(--ink-muted);">${s.note || ""}</td></tr>`)
    .join("");
  return `
  <div style="margin-top:var(--space-3);overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
      <thead><tr style="border-bottom:1px solid var(--gridline);text-align:left;"><th style="padding:4px 10px;">Year</th><th style="padding:4px 10px;text-align:right;">MTCO2e</th><th style="padding:4px 10px;text-align:right;">Change from 2007</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:4px;">${multiYearGhgTotal.note}</p>
  </div>`;
}

function renderDirectiveCard(d) {
  const state = directiveStatusState(d.status);
  const inconsistency = d.inconsistencyFlag && d.inconsistencyFlag.value
    ? `<div class="chart-annotation-box" style="margin-top:var(--space-3);"><strong>⚠ Inconsistency in the source document:</strong> ${d.inconsistencyFlag.note} ${renderCite(d.inconsistencyFlag.citation)}</div>`
    : "";
  const ghgTable = d.multiYearGhgTotal ? renderGhgSeriesTable(d.multiYearGhgTotal) : "";
  return `
  <article class="goal" data-status="${statusFilterAttr(state)}">
    <div class="goal__head">
      <div>
        <div class="goal__title">Directive ${d.number}: ${d.text}</div>
      </div>
      <div class="goal__badges">
        <span class="status-badge status-badge--${state}"><span class="status-badge__dot"></span>${d.status}</span>
        ${d.fundingLink ? fundingBadgeHtml(d.fundingLink) : ""}
      </div>
    </div>
    <div class="goal__body">
      <div class="goal__status-text">${d.statusText} ${renderCite(d.citation)}</div>
      ${inconsistency}
      ${ghgTable}
      ${d.targetCompletionDate ? `<div class="goal__status-text" style="margin-top:6px;"><strong>Target completion:</strong> ${d.targetCompletionDate}</div>` : ""}
      ${d.correspondingPrioritizedAction ? `<div class="goal__status-text" style="margin-top:6px;"><a href="#action-${d.correspondingPrioritizedAction}">→ See Prioritized Action ${d.correspondingPrioritizedAction}</a></div>` : ""}
    </div>
  </article>`;
}

function renderActionRow(action, phaseLabel) {
  const hasUpdate = action.status2025 && action.status2025.status;
  const state = hasUpdate ? mapStatusWord(action.status2025.status) : "not-reported";
  const badge = `<span class="status-badge status-badge--${state}"><span class="status-badge__dot"></span>${STATUS_LABEL[state]}</span>`;
  const linked = action.status2025 && action.status2025.linkedTo ? `<div style="font-size:var(--font-size-xs);color:var(--ink-muted);margin-top:4px;">→ ${linkedToHtml(action.status2025.linkedTo)}</div>` : "";
  const text = hasUpdate
    ? `${action.status2025.text} ${renderCite(action.status2025.citation)}`
    : `Not individually reported in the 2025 Progress Report.`;
  return `
  <div class="goal action-row" id="action-${phaseLabel}-${action.number}" data-status="${statusFilterAttr(state)}" style="padding:var(--space-3) var(--space-5);">
    <div style="display:flex;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap;align-items:flex-start;">
      <div><strong>Action ${action.number}:</strong> ${action.text}</div>
      ${badge}
    </div>
    ${statusHistoryHtml(action)}
    <div class="goal__status-text" style="margin-top:6px;">${text}${linked}</div>
  </div>`;
}

async function init() {
  const [recData, directiveData, actionData] = await Promise.all([
    loadJson("recommendations.json", BASE),
    loadJson("directives.json", BASE),
    loadJson("prioritized-actions.json", BASE),
  ]);

  document.getElementById("recommendations-list").innerHTML = recData.recommendations.map(renderRecCard).join("");
  document.getElementById("directives-list").innerHTML = directiveData.directives.map(renderDirectiveCard).join("");

  const censusMount = document.getElementById("census-acs-mount");
  if (censusMount) renderCensusAcsWidget(censusMount, BASE);

  const opengateMount = document.getElementById("opengate-mount");
  if (opengateMount && typeof renderOpenGateWidget === "function") renderOpenGateWidget(opengateMount);

  const phases = [
    { key: "years1to5", label: "Years 1–5", note: "Continuously numbered 1–28; these are the numbers the 2025 Progress Report cross-references." },
    { key: "years6to10", label: "Years 6–10", note: "Numbering restarts at 1 for this phase; not yet individually reported on." },
    { key: "years11to15", label: "Years 11–15", note: "Numbering restarts at 1 for this phase; not yet individually reported on." },
    { key: "years16to20", label: "Years 16–20", note: "Numbering restarts at 1 for this phase; not yet individually reported on." },
  ];
  document.getElementById("actions-list").innerHTML = phases
    .map((p) => {
      const rows = (actionData[p.key] || []).map((a) => renderActionRow(a, p.key)).join("");
      return `
      <details class="card" style="margin-bottom:var(--space-4);padding:0;" ${p.key === "years1to5" ? "open" : ""}>
        <summary style="cursor:pointer;padding:var(--space-4) var(--space-5);font-weight:700;">${p.label} <span style="font-weight:400;color:var(--ink-muted);font-size:var(--font-size-sm);">(${(actionData[p.key] || []).length} actions) — ${p.note}</span></summary>
        <div>${rows}</div>
      </details>`;
    })
    .join("");

  initCitePopovers(document.body);
  wireFilter();
}

function wireFilter() {
  const select = document.getElementById("status-filter");
  const sortSelect = document.getElementById("sort-order");

  function applyFilter() {
    const val = select.value;
    document.querySelectorAll("[data-status]").forEach((el) => {
      el.style.display = val === "all" || el.getAttribute("data-status") === val ? "" : "none";
    });
  }

  function applySort() {
    if (sortSelect.value === "status") {
      const container = document.getElementById("recommendations-list");
      const cards = [...container.children];
      cards.sort((a, b) => a.getAttribute("data-status").localeCompare(b.getAttribute("data-status")));
      cards.forEach((c) => container.appendChild(c));
    } else {
      // re-fetch original order is simplest via number in title; already in number order in DOM initially
      const container = document.getElementById("recommendations-list");
      const cards = [...container.children];
      cards.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      cards.forEach((c) => container.appendChild(c));
    }
  }

  select.addEventListener("change", applyFilter);
  sortSelect.addEventListener("change", applySort);
}

document.addEventListener("DOMContentLoaded", init);
