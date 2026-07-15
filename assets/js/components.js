/* SEP Tracker — shared render helpers for goal status, funding badges, and action lists.
   Depends on citation.js (renderCite) being loaded first. */

/**
 * Load a data/*.json file, preferring a build-time-baked copy over a runtime fetch.
 * build.py embeds baked files as <script type="application/json" id="baked-{name}">
 * for any page with a BUILD:DATA marker listing them — see that script's docstring.
 * Falls back to fetch() (relative to `base`) if no baked copy is present, so pages
 * still work even if data/*.json was edited without re-running the build.
 * @param {string} filename - e.g. "departments.json"
 * @param {string} base - relative path prefix to the repo root, e.g. "../"
 */
async function loadJson(filename, base) {
  const bakedId = "baked-" + filename.replace(".json", "");
  const baked = document.getElementById(bakedId);
  if (baked) {
    try {
      return JSON.parse(baked.textContent);
    } catch (e) {
      console.warn(`Baked data block #${bakedId} failed to parse, falling back to fetch()`, e);
    }
  }
  const res = await fetch(base + "data/" + filename);
  return res.json();
}

/**
 * Determine the goal's status-badge state from its data. This is the canonical
 * mapping used everywhere a goal/strategy status renders — do not re-derive this
 * logic ad hoc on other pages.
 */
function mapStatusWord(status) {
  if (!status) return null;
  const s = status.trim().toLowerCase();
  if (s === "complete" || s === "completed") return "complete";
  if (s === "ongoing" || s === "in progress") return "active";
  if (s === "initiated") return "initiated";
  if (s === "realigned") return "realigned";
  return "reported-plain";
}

function goalStatusState(goal) {
  const gapped = goal.dataGap === true;
  const deprioritized = !!(goal.deprioritizedInSource && goal.deprioritizedInSource.value);
  if (gapped && deprioritized) return "deprioritized";
  if (gapped) return "not-reported";
  const status = goal.statusUpdate2025 && goal.statusUpdate2025.status;
  return mapStatusWord(status) || "reported-plain"; // reported, but source gave no status word (e.g. WR-G2)
}

/** Same status vocabulary as goals, plus "mixed" for a recommendation whose strategies
 * carry different statuses with no single top-level status2025 word (e.g. REC-3). */
function recommendationStatusState(rec) {
  if (rec.status2025 && rec.status2025.status) return mapStatusWord(rec.status2025.status);
  const stratStatuses = (rec.strategies || []).filter((s) => s.status2025 && s.status2025.status);
  if (stratStatuses.length) return "mixed";
  return "not-reported";
}

const STATUS_LABEL = {
  complete: "Complete",
  active: "Ongoing / In Progress",
  initiated: "Initiated",
  realigned: "Realigned",
  "reported-plain": "Reported",
  "not-reported": "Not Reported",
  deprioritized: "Deprioritized",
  mixed: "Mixed — see strategies",
};

// Verbatim OSR status-word definitions (2024 Progress Report, p.19) — see directives.json >
// directiveStatusDefinitionsSource for the source-of-truth copy. Used in place of this project's
// earlier inferred wording for Ongoing/In Progress/Initiated specifically.
const OSR_STATUS_DEFINITIONS = {
  Ongoing: "A program or standard practice that has been established, remains in effect, and continues indefinitely.",
  "In Progress": "A project or program that has been started and will be completed after a finite period (whether the completion date is known or unknown).",
  Initiated: "The starting point of a project, task, program, or activity during the reporting period. In most cases, funding has been allocated and projects are pending.",
};

const STATUS_EXPLAIN = {
  complete: "The 2025 Progress Report marks this complete.",
  active: `OSR's official definitions (2024 Progress Report, p.19) — "Ongoing": "${OSR_STATUS_DEFINITIONS.Ongoing}" "In Progress": "${OSR_STATUS_DEFINITIONS["In Progress"]}"`,
  initiated: `OSR's official definition (2024 Progress Report, p.19) — "Initiated": "${OSR_STATUS_DEFINITIONS.Initiated}"`,
  realigned: "The approach changed since the 2022 SEP — see the status text for what changed and why.",
  "reported-plain": "The 2025 Progress Report describes activity here but does not attach one of its usual status words (Complete/Ongoing/etc).",
  "not-reported": "The 2025 Progress Report does not address this goal at all. No reason is given in the source — this is a genuine reporting gap, not a documented deprioritization.",
  deprioritized: "Not reported in 2025 — but the 2022 SEP itself explicitly deprioritized this. See the quoted source text below. This is a documented choice made visible, not a silent gap.",
  mixed: "No single top-level status — this recommendation's strategies were individually status-updated with different results. See below.",
};

function goalStatusBadgeHtml(goal) {
  const state = goalStatusState(goal);
  return `<span class="status-badge status-badge--${state}" title="${STATUS_EXPLAIN[state].replace(/"/g, "&quot;")}"><span class="status-badge__dot"></span>${STATUS_LABEL[state]}</span>`;
}

/** wentSilent (goals) and stalled (recommendations) share one visual treatment — a distinct
 * "flagged" badge — but never fold into the dataGap/deprioritized/not-reported states above:
 * both describe something reported for multiple years that then stopped moving, which is a
 * different finding than "never reported" or "reported, but SEP itself deprioritized it". */
function wentSilentBadgeHtml(goal) {
  const ws = goal.wentSilent;
  if (!ws || !ws.value) return "";
  const title = (ws.note || "").replace(/"/g, "&quot;");
  return `<span class="status-badge status-badge--flagged" title="${title}"><span class="status-badge__dot"></span>⚠ Went silent after ${ws.lastReportedYear}</span>`;
}

function stalledBadgeHtml(rec) {
  const st = rec.stalled;
  if (!st || !st.value) return "";
  const title = (st.note || "").replace(/"/g, "&quot;");
  return `<span class="status-badge status-badge--flagged" title="${title}"><span class="status-badge__dot"></span>⚠ Stalled — ${st.years.length} years at "Initiated"</span>`;
}

/** Renders a compact year-by-year trajectory (statusHistory + the 2025 outcome) for any goal,
 * recommendation, or action that carries a statusHistory array. Purely additive — goals/recs
 * without statusHistory render nothing here, same as before this field existed. */
function statusHistoryHtml(item) {
  if (!item.statusHistory || !item.statusHistory.length) return "";
  const yearChips = item.statusHistory.map(
    (h) => `<span class="status-history__chip">${h.year}: <strong>${h.status}</strong> ${renderCite(h.citation)}</span>`
  );
  if (item.dataGap) {
    yearChips.push(`<span class="status-history__chip status-history__chip--gap">2025: <strong>not reported</strong></span>`);
  } else {
    const su = item.statusUpdate2025 || item.status2025;
    if (su && su.status) {
      yearChips.push(`<span class="status-history__chip">2025: <strong>${su.status}</strong> ${renderCite(su.citation)}</span>`);
    }
  }
  return `<div class="goal__status-history">${yearChips.join('<span class="status-history__arrow">→</span>')}</div>`;
}

function fundingBadgeHtml(fundingLink) {
  if (!fundingLink) return "";
  if (!fundingLink.hasActiveFunding) {
    return `<span class="funding-badge funding-badge--no" title="No named grant or contract identified for this goal.">$ No funding identified</span>`;
  }
  const isExternal = !!fundingLink.correctedInStep3;
  const cls = "funding-badge " + (isExternal ? "funding-badge--external" : "funding-badge--yes");
  const label = isExternal ? "$ Externally-verified funding" : "$ Funded";
  return `<span class="${cls}" title="${(fundingLink.note || "").replace(/"/g, '&quot;')}">${label}</span>`;
}

function renderActionList(strategies) {
  if (!strategies || !strategies.length) return "";
  return strategies
    .map((s, i) => {
      const actions = (s.actions || [])
        .map((a) => `<li><strong>${a.id}</strong> — ${a.text}</li>`)
        .join("");
      return (
        `<details class="strategy"${i === 0 ? "" : ""}>` +
        `<summary>Strategy ${s.number}: ${s.text}</summary>` +
        (actions ? `<ul class="strategy__actions">${actions}</ul>` : `<p style="font-size:var(--font-size-sm);color:var(--ink-muted);padding-left:16px;margin-top:8px;">No individually-numbered actions under this strategy.</p>`) +
        `</details>`
      );
    })
    .join("");
}
