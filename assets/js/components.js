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
function goalStatusState(goal) {
  const gapped = goal.dataGap === true;
  const deprioritized = !!(goal.deprioritizedInSource && goal.deprioritizedInSource.value);
  if (gapped && deprioritized) return "deprioritized";
  if (gapped) return "not-reported";
  const status = goal.statusUpdate2025 && goal.statusUpdate2025.status;
  if (status === "Complete" || status === "Completed") return "complete";
  if (status === "Ongoing" || status === "In Progress") return "active";
  if (status === "Initiated") return "initiated";
  if (status === "Realigned") return "realigned";
  return "reported-plain"; // reported, but source gave no status word (e.g. WR-G2)
}

const STATUS_LABEL = {
  complete: "Complete",
  active: "Ongoing / In Progress",
  initiated: "Initiated",
  realigned: "Realigned",
  "reported-plain": "Reported",
  "not-reported": "Not Reported",
  deprioritized: "Deprioritized",
};

const STATUS_EXPLAIN = {
  complete: "The 2025 Progress Report marks this complete.",
  active: "The 2025 Progress Report describes this as ongoing / actively in progress.",
  initiated: "Work on this has been initiated per the 2025 Progress Report, but is early-stage.",
  realigned: "The approach changed since the 2022 SEP — see the status text for what changed and why.",
  "reported-plain": "The 2025 Progress Report describes activity here but does not attach one of its usual status words (Complete/Ongoing/etc).",
  "not-reported": "The 2025 Progress Report does not address this goal at all. No reason is given in the source — this is a genuine reporting gap, not a documented deprioritization.",
  deprioritized: "Not reported in 2025 — but the 2022 SEP itself explicitly deprioritized this. See the quoted source text below. This is a documented choice made visible, not a silent gap.",
};

function goalStatusBadgeHtml(goal) {
  const state = goalStatusState(goal);
  return `<span class="status-badge status-badge--${state}" title="${STATUS_EXPLAIN[state]}"><span class="status-badge__dot"></span>${STATUS_LABEL[state]}</span>`;
}

function fundingBadgeHtml(fundingLink) {
  if (!fundingLink) return "";
  if (!fundingLink.hasActiveFunding) {
    return `<span class="funding-badge funding-badge--no" title="No named grant or contract identified for this goal.">$ No funding identified</span>`;
  }
  const isExternal = fundingLink.correctedInStep3 || (typeof fundingLink.linkedTo === "string" && false);
  const cls = isExternal ? "funding-badge--external" : "funding-badge--yes";
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
