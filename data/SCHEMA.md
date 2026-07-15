# SEP Tracker — data schema (v3)

Step 1: structured, cited JSON extracted from both source PDFs. Step 2: funding-linkage layer added. Step 3: external-citation layer added (facts verified outside both PDFs) plus corrections that layer surfaced. UI build is starting with a single reference department page (Water Resources) before templating.

## Files

| File | Contents |
|---|---|
| `index.json` | Source metadata (both PDFs), report-cadence timeline, citation schema (both citation types), file map |
| `resolution.json` | Resolution 19-0770 — every mandated deadline, full text, the SEP-submission timing gap |
| `baseline-2019.json` | Tables 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 from the 2022 SEP; key findings; Duke Energy grid mix; social cost of carbon; solar potential estimates |
| `departments.json` | Every Goal → Strategy → Action for every department, grouped by energy source, each with 2025 status (`dataGap: true` where absent) and `fundingLink` (Step 2). Includes one external-research-only entry (White Street Landfill, Step 3) that has no SEP goal structure at all. |
| `recommendations.json` | All 8 Organization-Wide Recommendations + strategies + 2025 status |
| `directives.json` | Resolution Directives 4, 8, 9 (the three the 2025 report explicitly status-updates) |
| `prioritized-actions.json` | All 53 actions across 4 phases (Years 1–5: 28, 6–10: 14, 11–15: 5, 16–20: 6), with 2025 status linked where the report cross-references a number |
| `funding.json` | Named grants/contracts, both PDF-sourced and external-sourced (Step 3 added 5 externally-verified GTA transit grants + the White Street Landfill solar/gas-to-energy projects) + financing mechanisms cataloged in the 2022 SEP |
| `funding-linkage.json` | Derived rollup: for every department goal, is it funded (and by what) and is it reported — the cross-tab and per-grouping breakdown. Regenerate if `departments.json`'s `fundingLink`/`dataGap` fields change. |
| `progress-2025-misc.json` | OSR staff roster, CSC roster, tree canopy figures, telematics pilot, event attendance, LEED for Cities note |

## Every data point traces to a citation — now one of two types

**Type 1 — two-document citation** (from the SEP or the Progress Report):
```json
"citation": { "source": "sep2022" | "progress2025", "page": 21, "table": "Table 3" }
```
`page` may be `[start, end]` for a range. Resolve `source` against `index.json.sources[]` for the full title/publisher/date.

**Type 2 — external citation** (verified independently, outside both PDFs):
```json
"citation": {
  "sourceType": "external",
  "publisher": "City of Greensboro / Legistar",
  "title": "Resolution Authorizing an Amendment to the White Street Landfill Gas Utilization Project Agreement to Include a Solar Facility",
  "legistarFileId": "15-0607",
  "url": "https://greensboro.legistar.com/LegislationDetail.aspx?ID=2376081",
  "retrievedDate": "2026-07-14",
  "note": "Not referenced in either SEP source document — found via independent research."
}
```

### Why external citations exist, and how they must be rendered

The City's own two reports are not a complete record of the City's renewable-energy activity — they're what OSR chose to compile and publish. A transparency tool that only repeats what the City already published isn't adding much. Surfacing true, independently-verified facts the City's own reporting omitted (a $22.4M federal transit grant explicitly credited to the SEP; a 4.8 MW solar array on City land never mentioned in either report) is core to this tool's value, not scope creep — **provided** it's never presented with the same evidentiary weight as a City-published figure.

Concretely, wherever a citation renders in the UI:
- Type 1 (`sep2022`/`progress2025`) citations get the standard cited-figure treatment — a plain footnote-style reference.
- Type 2 (`external`) citations must look **visibly different** — distinct badge/icon (e.g. a small "independently verified" tag), different color treatment, and the publisher/URL shown up front rather than tucked into a tooltip, so a reader never mistakes "found via Legistar" for "stated by the City."
- Never merge the two into a single undifferentiated "sources" list. If a claim has both a City-report citation and a corroborating external citation, show both, separately labeled.

This distinction is enforced consistently: `resolution.json`, `baseline-2019.json`, `recommendations.json`, `directives.json`, and `prioritized-actions.json` currently contain only Type 1 citations; `funding.json` and `departments.json` now contain a mix, and every Type 2 entry is explicit about it (`citation.sourceType === "external"` is the discriminator to check in code — never infer from context).

## Funding linkage (Step 2)

Every department goal in `departments.json` carries a `fundingLink` object:
```json
"fundingLink": { "hasActiveFunding": true, "linkedTo": "funding.json > grants > eecbg-2024", "note": "..." }
```
`hasActiveFunding: false` is always written explicitly — never omitted — so absence of funding is as queryable as `dataGap: true`. `funding-linkage.json` is the computed rollup (cross-tab + per-department-grouping breakdown + goal-level detail); see that file's `verdict` field for the current read on whether "funding predicts reporting" actually holds (it does, but asymmetrically — funded goals are always reported, but not all reported goals are funded).

## External-research corrections applied (Step 3)

Independent research (Legistar records, City press releases, OSR's live "Solar Energy Central" page) surfaced facts that changed two funding-linkage conclusions from Step 2:

- **`transportation-diesel` (GTA electric bus fleet)** was marked `hasActiveFunding: false` in Step 2 because neither PDF names a funding source for the bus/charger purchases. Five real, externally-verified grants going back to 2018 fund this fleet, including a **$22.4M FTA Low-No Emission grant (July 2024)** whose public announcement explicitly credits the City's 2022 Strategic Energy Plan — the strongest documented evidence anywhere in this dataset that the SEP caused a funded outcome. This goal is now `hasActiveFunding: true` with five linked external citations in `funding.json`.
- **White Street Landfill solar (4.8 MW, operational Oct. 2020) + landfill gas-to-energy** — a real, City-land renewable asset with no home in either SEP document and no home in the SEP's department-based goal structure (it's a Field Operations / Solid Waste & Recycling asset, not Water Resources). Added as a new `departments.json` entry (`id: "white-street-landfill"`, `externalOnly: true`) with no `goals` array, since it has no SEP-defined goal to attach to — see that entry's own fields instead. Cross-referenced from Water Resources Goal 3 (`WR-G3`, renewable-by-2040) as a `relatedExternalFinding`: the SEP frames Water Resources' renewable progress as stalled because its own 1 MW T.Z. Osborne solar project never happened, while a City-owned asset roughly 5x larger was built in the same window under a different department, and neither Progress Report mentions it. That's a factual gap in the reports' own department-siloed accounting, stated as such — not framed as wrongdoing.

## Verification tiers (Step 4)

Every citation in `funding.json` now carries a `verificationStatus`: `"primary-source-verified"` (the claim was checked against fetched full source text — a PDF page I read directly, or a URL that returned full content) or `"single-source-unconfirmed"` (the claim rests on search-result summaries only, because the primary document couldn't be fetched — paywalled, rate-limited, or blocked). This is the basis for citation Tier 3 vs. Tier 4 in the UI (see below): Tier 3 = external + primary-source-verified, Tier 4 = external + single-source-unconfirmed.

Two claims remain `single-source-unconfirmed` as of this pass:
- The FY23 $3M GTA grant (paywalled source article; bus-count details vary 3 vs. 4 between secondhand summaries).
- The Central Library ARPA allocation ($1,575,000 of a $6,175,000 package) — added this pass specifically because it's relevant to `EI-G2`/Prioritized Action 15 (the Central Library roof), but three City news-release URLs all returned HTTP 403 and the one alternate outlet tried returned HTTP 429. **This figure is not encoded as fact anywhere else in the dataset** (it is not linked from `departments.json`'s Central Library entries) — it exists only in `funding.json > externalOtherAllocations` as a flagged, provisional lead.

One correction attempt came back negative and is worth recording as such: the Duke Energy Foundation ($25k) and NEEF ($20k) grants were checked against purported Legistar file numbers "2025-705"/"2025-706" — no confirmable record was found at those numbers in this pass. Both grants remain correctly cited to `progress2025` alone (Tier 2, the City's own report — already adequate sourcing); no Tier 3 upgrade was added, and no fabricated Legistar reference was inserted in its place.

## Known unverifiable claims (documented limitation, not a silent gap)

`greensboro-nc.gov` returned **HTTP 403 on every direct `WebFetch` attempt** in this session — the Solar Energy Central page, and three separate ARPA news-release URLs. This appears to be systematic bot-blocking on the City's own web platform, not a one-off failure. Practical effect: any fact whose only available primary source is a `greensboro-nc.gov` page cannot currently be verified by this tool's research process beyond search-engine-summary confidence, and is marked `single-source-unconfirmed` accordingly. A future live-data integration (Step 3 of the original prompt) should not assume `greensboro-nc.gov` HTML pages are fetchable — API/REST endpoints (e.g. the Esri Hub APIs already planned for Open Gate City) are a more reliable path than scraping City web pages directly.

## Live-data platform notes (Step 3 correction)

Both of the following are live and useful, for different purposes — neither is deprecated or a dead end for the eventual Step-3-of-the-original-prompt live API layer:
- **`greensboro.legistar.com`** — Granicus Legistar. Confirmed live; holds individual legislation records at `LegislationDetail.aspx?ID=...`, addressable by File # (e.g. `15-0607`). Best for historical legislation lookup when you already have or can search for a File ID — this is how the White Street Landfill and GTA funding records were found.
- **`pub-greensboro-nc.escribemeetings.com`** — eScribe. The current meeting-agenda/calendar interface. Best for browsing agendas and minutes by meeting date rather than looking up a specific past legislative item.

## Explicit data gaps (shown, not hidden)

Per the build notes, places where the source itself doesn't have an answer are marked rather than omitted:

- `dataGap: true` on ~20 department goals with no 2025 status update (Coliseum electricity, both natural-gas-only departments, Field Operations diesel, both Transportation-only goals not covered above, Community Incentives Goal 1, etc.)
- Transportation's 2025 LED streetlamp **conversion percentage** — explicitly stated as unavailable in the source
- The second annual progress report's publication date — implied to exist, never stated
- `wrongDirection: true` flags on Water Resources electricity (+2.0%) and Buildings/E&I electricity (+1.0%) — both moving away from the 40%-reduction-by-2025 target
- `deprioritizedInSource: true` on the four natural-gas-only goals (Coliseum, Parks & Rec, Fire ×2) — these are a clean 100% funding/reporting blackout, but the 2022 SEP itself explicitly deprioritized natural gas ("will not be considered an early priority action at the City level," p.44). The UI should visually distinguish this from an unexplained gap: it's a documented deprioritization made visible, not a silent omission.
- **No department-level 2007 baseline exists anywhere in the source data.** Table 3 (department electricity/gas breakdown) is 2019-only; the 2007 figures in Table 7/8/10 are city-wide totals only. Every department's "-40% from 2007 by 2025" goal is therefore un-plottable against a real department-level 2007 number. The Water Resources page (Step 2/3 UI) handles this by charting the real 2019→2025 trend and showing the 40% target as an explicitly-labeled *approximation* anchored to 2019 (since city-wide electricity use was nearly flat 2007→2019, a -1% citywide move per Table 10) — never as if it were a sourced 2007 figure. Same caveat will apply to every other department page.

## Known source-document quirks (preserved, not "fixed")

- **Table 12 vs "Table 15"**: the Highest Electricity Demand Buildings table is captioned "Table 12" but referenced as "Table 15" in the surrounding prose — an artifact of the original PDF, noted in `baseline-2019.json`.
- **Resolution baseline year**: the resolution text says 2005; the SEP itself adjusted the baseline to 2007 and explains why. Both years are captured in `resolution.json` so the UI can show the discrepancy rather than silently picking one.
- **GTA/GDOT split (2023)**: Greensboro Transit Agency became a separate department after the 2019 baseline was set. 2025 "Transportation & Transit" figures are combined and not cleanly comparable to the 2019 Transportation-only baseline — flagged in `departments.json` (`note2025Reorg`).
- **"Buildings Managed by Engineering & Inspections"** is a cross-department use-type category (32% of total electricity), not the same as the tiny "Engineering & Inspections" department line in Table 3 (266,700 kWh). Flagged inline to prevent the year-over-year engine from comparing the wrong two numbers.

## Verification done so far

- All JSON files parse (validated with a script after every edit round, including this one).
- Table 3 and Table 4 department rows sum to their printed totals (spot-checked programmatically).
- Table 1's 2019 electricity total (139,414 MWh) cross-checked against Table 3's department sum (139,414.389 MWh).
- Appendix A (Resolution 19-0770) was image-only in the source PDF (no extractable text layer) — rendered to PNG and transcribed by direct reading, not OCR guesswork.
- `departments.json`'s 21 goals cross-checked programmatically against `funding-linkage.json`'s cross-tab totals (goal counts must sum to 21 in every recomputation).

## Build status (final pass)

All 13 department pages, the Recommendations & Actions board, Funding tracker, Timeline, and the
real homepage rollup are built and verified (zero console errors, computed values cross-checked
against source data, filter/sort interactions tested). `build.py` now bakes both the shell
(header/footer) and page content data (`BUILD:DATA` markers) into every page at build time, so
the whole site works over `file://` with no server — except the department pages' JSON data
specifically requires the baked blocks to exist (they gracefully fall back to `fetch()` if a page
lacks them, which still needs a server).

## Live/external data layer (Phase 4)

- **NREL PVWatts** — genuinely live, verified end-to-end with a real browser API call (not just
  code review): a client-side "estimate solar potential" widget on the White Street Landfill and
  Buildings/E&I pages (`assets/js/pvwatts-widget.js`). Surprising finding from verification: NREL's
  developer API domain migrated from `developer.nrel.gov` (now returns DNS failure) to
  `developer.nlr.gov` as of a May 2026 reorganization — the lab is now branded "National
  Laboratory of the Rockies." Uses the public rate-limited `DEMO_KEY`; swap in a registered key for
  production traffic. Site coordinates are approximate (Greensboro-area defaults, not geocoded
  addresses) and adjustable in the widget — flagged in the UI, not presented as precise.
- **Canopy Hub** (`canopy.greensboro-nc.gov`) — Esri Hub Search API confirmed live
  (`/api/search/v1/collections/all/items`), 8 items including two real FeatureServer layers
  (`CEJST_Districts2024`, `Neighborhoods_Point`). A live fetch demo on the About page proves this
  in the visitor's own browser rather than just claiming it.
- **Open Gate City** (`data.greensboro-nc.gov`) — same pattern, confirmed live, 79 datasets
  (Code Compliance, Fire, Police, Finance). Documented; not yet wired into a specific page.
- **Gate City Budget** (`budget.greensboro-nc.gov`) — checked and found **not distinct**: its
  Search API returns the same general city-wide catalog as Open Gate City, with no separate
  CIP/budget-line-item dataset found. The planned cross-reference against `baseline-2019.json`'s
  energy costs was not built, since there's nothing confirmed to cross-reference — documented as an
  open question on the About page rather than silently dropped or faked.
- **EIA grid-mix data** — infrastructure only, not running: `scripts/fetch_grid_mix.py` +
  `.github/workflows/refresh-grid-mix.yml` (scheduled GitHub Action) exist and are ready, but
  require a free `EIA_API_KEY` repository secret this environment doesn't have. The script was
  checked against EIA's documented v2 API route structure but **not verified end-to-end** — a
  403 (consistent with "route exists, key required") is the strongest confirmation available
  without a key. Verify the first live run's output shape before trusting it in production.
