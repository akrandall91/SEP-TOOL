/* SEP Tracker — reusable citation component.
   One rendering path for every citation on the site: renderCite(citation, opts) returns an HTML
   string for an inline badge; initCitePopovers(container) wires up hover (desktop) + tap (mobile)
   + keyboard focus, reading data already embedded in the badge's own data-* attributes (no
   re-fetching). Call initCitePopovers() once per page after inserting cite badges into the DOM. */

const SEP_SOURCE_META = {
  sep2022: { label: "Strategic Energy Plan: Pathways to 100% Renewable Energy", publisher: "City of Greensboro", date: "November 2022" },
  progress2025: { label: "2025 Annual Progress Report & SEP Implementation Year Three", publisher: "City of Greensboro, Office of Sustainability and Resilience", date: "February 2026" },
};

function citeTier(citation, verificationStatus) {
  if (!citation) return null;
  if (citation.source === "sep2022") return 1;
  if (citation.source === "progress2025") return 2;
  if (citation.sourceType === "external") {
    return verificationStatus === "single-source-unconfirmed" ? 4 : 3;
  }
  return null;
}

function pageLabel(citation) {
  if (Array.isArray(citation.page)) return "pp. " + citation.page.join("–");
  if (citation.page != null) return "p. " + citation.page;
  return "";
}

/**
 * Render an inline citation badge.
 * @param {object} citation - a citation object from the data layer (Tier 1/2), or an
 *   { sourceType: 'external', ... } object (Tier 3/4).
 * @param {object} [opts]
 * @param {'primary-source-verified'|'single-source-unconfirmed'} [opts.verificationStatus] - required to
 *   distinguish Tier 3 vs Tier 4 for external citations.
 * @param {string} [opts.label] - override the short badge label (defaults per tier).
 */
function renderCite(citation, opts) {
  opts = opts || {};
  const tier = citeTier(citation, opts.verificationStatus);
  if (!tier) return "";
  const payload = encodeURIComponent(JSON.stringify({ citation, verificationStatus: opts.verificationStatus || null, tier }));
  const defaults = { 1: "SEP '22", 2: "Progress '25", 3: "Verified", 4: "Unconfirmed" };
  const icons = { 1: "①", 2: "②", 3: "③", 4: "④" };
  const label = opts.label || defaults[tier];
  return (
    `<span class="cite cite--tier${tier}" tabindex="0" data-cite-payload="${payload}">` +
    `<span class="cite__icon">${icons[tier]}</span>${label}` +
    `<span class="cite-pop" role="tooltip"></span>` +
    `</span>`
  );
}

function buildPopoverHtml(citation, tier, verificationStatus) {
  const tierNames = { 1: "SEP 2022 — primary source", 2: "Progress Report 2025 — primary source", 3: "External — primary-source-verified", 4: "External — single-source-unconfirmed" };
  let title = "", meta = "", note = "";
  if (tier === 1 || tier === 2) {
    const src = SEP_SOURCE_META[citation.source];
    title = src.label;
    meta = `${src.publisher} · ${src.date} · ${pageLabel(citation)}` + (citation.table ? ` · ${citation.table}` : "");
    note = citation.note || "";
  } else {
    title = citation.title || "";
    meta = (citation.publisher || "") + (citation.retrievedDate ? ` · retrieved ${citation.retrievedDate}` : "");
    note = citation.note || "";
    if (verificationStatus === "single-source-unconfirmed") {
      note = "⚠ Not confirmed against primary-source text — drawn from search-result summaries only. " + note;
    }
  }
  const link = citation.url ? `<a href="${citation.url}" target="_blank" rel="noopener">Open source →</a>` : "";
  return (
    `<div class="cite-pop__tier">${tierNames[tier]}</div>` +
    `<div class="cite-pop__title">${title}</div>` +
    `<div class="cite-pop__meta">${meta}</div>` +
    (link ? `<div>${link}</div>` : "") +
    (note ? `<div class="cite-pop__note">${note}</div>` : "")
  );
}

function initCitePopovers(container) {
  const root = container || document;
  const badges = root.querySelectorAll(".cite[data-cite-payload]");
  badges.forEach((badge) => {
    if (badge.dataset.citeInit) return;
    badge.dataset.citeInit = "1";
    const payload = JSON.parse(decodeURIComponent(badge.getAttribute("data-cite-payload")));
    const pop = badge.querySelector(".cite-pop");
    pop.innerHTML = buildPopoverHtml(payload.citation, payload.tier, payload.verificationStatus);

    function open() { document.querySelectorAll(".cite-pop.is-open").forEach((p) => p.classList.remove("is-open")); pop.classList.add("is-open"); }
    function close() { pop.classList.remove("is-open"); }

    badge.addEventListener("mouseenter", open);
    badge.addEventListener("mouseleave", close);
    badge.addEventListener("focus", open);
    badge.addEventListener("blur", close);
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      pop.classList.contains("is-open") ? close() : open();
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".cite-pop.is-open").forEach((p) => p.classList.remove("is-open"));
  });
}
