/* SEP Accountability — plain-language glossary.
   Same accessible hover (desktop) + tap (mobile) + keyboard-focus popover pattern as
   citation.js's cite badges, applied to jargon terms instead of citations. Self-initializes on
   DOMContentLoaded so no page-specific script needs to remember to call it. */

const GLOSSARY_TERMS = {
  sep: "Strategic Energy Plan — the City's 2022 plan to cut greenhouse-gas emissions from its own buildings and vehicles, and move toward 100% renewable energy.",
  osr: "Office of Sustainability and Resilience — the City department that runs the Strategic Energy Plan and reports on its progress.",
  ghg: "Greenhouse gas — the pollution (mostly from burning fuel and electricity use) that traps heat and drives climate change.",
  csc: "Community Sustainability Council — a group of Greensboro residents appointed by City Council to advise on sustainability issues, including this plan.",
  ashrae: "A national engineering standard used to audit how much energy a building wastes and what to fix.",
  gtfs: "The public data format transit agencies (including GTA, Greensboro's bus system) use to publish schedules and real-time vehicle locations.",
  biennial: "Happening every two years.",
  "resolution-mandate": "A requirement City Council formally voted into place — not just a goal OSR set for itself, but something Council directed the City to do.",
  "scope-1-2": "Scope 1 is pollution from things the City directly burns (like gasoline in City vehicles); Scope 2 is pollution from the electricity the City buys. Together, these are what this plan tracks — not pollution from the whole city.",
  mtco2e: "Metric tons of carbon dioxide equivalent — the standard unit for measuring greenhouse-gas pollution, used so different gases can be compared on one scale.",
  legistar: "The City Council's official public record system for votes, resolutions, and meeting agendas — used here to independently check City claims against the actual voting record.",
  eecbg: "Energy Efficiency and Conservation Block Grant — a federal grant program that has funded some of the City's energy-saving projects.",
  sppa: "Solar Power Purchase Agreement — a deal where a private company builds and owns solar panels on City land and sells the power, rather than the City owning the panels itself.",
  apr: "Annual Progress Report — OSR's yearly report on how the Strategic Energy Plan is going. Three have been published so far (2023, 2024, 2025).",
  "citation-tiers": "A color-coded system this site uses on every figure: Tier 1–2 are the City's own reports; Tier 3–4 are facts this project verified independently. See About for the full explanation.",
};

function glossaryTerm(key, label) {
  const definition = GLOSSARY_TERMS[key];
  if (!definition) return label || key;
  return (
    `<span class="term" tabindex="0">${label || key}` +
    `<span class="term-pop" role="tooltip">${definition}</span>` +
    `</span>`
  );
}

function initTermPopovers(container) {
  const root = container || document;
  const terms = root.querySelectorAll(".term");
  terms.forEach((term) => {
    if (term.dataset.termInit) return;
    term.dataset.termInit = "1";
    const pop = term.querySelector(".term-pop");
    if (!pop) return;

    function open() { document.querySelectorAll(".term-pop.is-open, .cite-pop.is-open").forEach((p) => p.classList.remove("is-open")); pop.classList.add("is-open"); }
    function close() { pop.classList.remove("is-open"); }

    term.addEventListener("mouseenter", open);
    term.addEventListener("mouseleave", close);
    term.addEventListener("focus", open);
    term.addEventListener("blur", close);
    term.addEventListener("click", (e) => {
      e.stopPropagation();
      pop.classList.contains("is-open") ? close() : open();
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".term-pop.is-open").forEach((p) => p.classList.remove("is-open"));
  });
}

document.addEventListener("DOMContentLoaded", () => initTermPopovers(document));
