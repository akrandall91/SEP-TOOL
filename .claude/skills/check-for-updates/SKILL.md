---
name: check-for-updates
description: On-demand check of external Greensboro sources (CSC minutes, new Progress Reports, Legistar, Council agendas, general web search) for anything not yet reflected on the SEP Accountability site. Writes findings to data/auto-detected-updates.json and, where a finding maps cleanly to an existing goal, a matching pending entry in data/review-proposals.json. Never publishes anything automatically.
---

# Check for updates

This skill goes out and checks five external sources for anything new relevant to Greensboro's
Strategic Energy Plan, and — if it finds something — adds it to a decision list for the
maintainer to review. It never edits `index.html`, `departments/*.html`, or any other published
page directly, and it never changes an authoritative `data/*.json` file (departments.json,
directives.json, funding.json, etc.). Its only outputs are:

1. `data/auto-detected-updates.json` — always updated with what was checked and what was found.
2. `data/review-proposals.json` — only for findings that cleanly map to an existing `goalId` and
   a specific field/value, appended as a `pending` proposal in the same shape `admin_server.py`
   writes (see below).
3. A clear chat summary at the end of the run: what was checked, what was found, what was
   dismissed and why.

Read `data/auto-detected-updates.json` first — it records `sourcesChecked` (when each source was
last looked at and what was already processed) and the `impactClassVocabulary` this file uses.
Use it to know what's already been read so you don't re-process the same document twice.

## The core discipline (apply to every source below)

Before recording any finding as new, **cross-check it against the current site**, the same way
the CSC minutes from July 13, 2026 were incorporated this session:
- Grep `data/*.json` for the specific fact, number, or claim. If it's already there — even
  phrased differently — classify it `already_covered`, not a new finding.
- Prefer the primary document over a summary of it. If you can fetch the actual PDF/page, read
  it in full before writing a finding, don't infer from a title or snippet alone.
- If a finding would only be redundant, or has no legitimate place in the site's tracked-goal
  structure (see `about.html`'s stated scope — this site tracks specific SEP goals, directives,
  recommendations, and funding, not general City operations), do not force it in. Record it as
  `already_covered` or skip it, and say so plainly in the summary — this happened for a "32
  hybrid vehicles" fact and for landfill-composting facts earlier this session; both were
  correctly left out.
- Every finding needs a `citationTier` (1–4, same vocabulary as the rest of the site — see
  `about.html` "How to read a citation") and a real `sourceUrl`.

## Sources to check

### 1. CSC meeting minutes
`greensboro-nc.gov` returns HTTP 403 to a direct `WebFetch` (confirmed — it blocks non-browser
requests). Use `WebSearch` with `site:greensboro-nc.gov` instead, e.g.
`site:greensboro-nc.gov Community Sustainability Council minutes <year>` — this reliably
surfaces indexed City documents even when a direct fetch is blocked. Look for a minutes document
newer than
`sourcesChecked.csc-minutes.lastProcessedDocument`. If one exists, read it in full and apply the
cross-check discipline above to every fact in it before writing findings. If nothing newer
exists, write a single `no_new_content` entry and move on — do not re-read the same minutes.

### 2. New Annual Progress Reports
Check the OSR reports page (same department page as above, or search
`greensboro-nc.gov Annual Progress Report Strategic Energy Plan`) for anything beyond the 2025
report (`progress2025`, Feb 2026 — see `data/index.json > sources`). Progress Reports appear
roughly annually; if none newer exists, `no_new_content`.

### 3. Legistar — newly discovered matters
Read `data/live/legistar-snapshot.json > discoveredMatters` (refreshed weekly by
`scripts/fetch_legistar_snapshot.py`, no need to re-fetch it here) and cross-reference against
`scripts/analyze_public_record_impact.py`'s `known_ids` set and `matter_effects` dict. Any
matter already classified there by that script (check `data/public-record-impact.json`'s
`records` for `datasetId: "legistar"`) is already surfaced — don't duplicate it here. This
source-check is about noticing when `discoveredMatters` has grown since you last looked, not
re-deriving what the impact script already does.

### 4. City Council meeting agendas
Legistar exposes an `Events`/`EventItems` Web API (same platform as
`scripts/fetch_legistar_snapshot.py` uses — see that script's `BASE` constant and
`discover_matters` function for the request pattern). Query upcoming Council meetings and their
agenda items for the same keyword set `fetch_legistar_snapshot.py` uses
(`DISCOVERY_TERMS` — read that script to get the current list), so a SEP/OSR-relevant item can
be flagged before it's even voted on, not just after it becomes a formal Legistar matter.

### 5. General web search
`WebSearch` for Greensboro OSR/SEP news since `sourcesChecked.web-search.lastChecked`. This is
the noisiest source — apply a **higher bar**: a finding here should default to
`pending_verification` unless you can independently confirm it against a primary source (the
City's own site, a news article that quotes/links an official document, etc.). Do not flag
loosely-related hits just because they mention "Greensboro" and "energy."

## Writing findings

For each finding, append to `data/auto-detected-updates.json > findings`:
```json
{
  "id": "auto-YYYYMMDD-<6 hex chars>",
  "sourceType": "csc-minutes | progress-report | legistar-matter | council-agenda | web-search",
  "title": "short label",
  "sourceUrl": "https://...",
  "dateFound": "YYYY-MM-DD",
  "citationTier": 3,
  "impactClass": "no_new_content | already_covered | candidate_new_fact | candidate_goal_update | pending_verification",
  "effectOnAuthoritativeData": "none | pending_review | adds_context",
  "candidateGoalIds": ["GOAL-ID", "..."],
  "finding": "one or two sentences describing what was found and why it matters (or doesn't)",
  "limitation": "optional — what this finding does NOT establish",
  "status": "new"
}
```
Update the matching `sourcesChecked.<sourceType>` block's `lastChecked` (and
`lastProcessedDocument` for csc-minutes / progress-report) so the next run doesn't re-process the
same content. Bump the file's top-level `generatedAt`.

If `impactClass` is `candidate_goal_update`, also append a matching entry to
`data/review-proposals.json > proposals` in exactly `admin_server.py`'s record shape
(`id, goalId, proposalType, field, proposedValue, reason, sourceUrl, proposedBy, proposedAt,
status`), with `"proposedBy": "Automated search (Claude Code)"` and `"status": "pending"` — this
is what makes it show up in the existing admin review console (`admin_server.py`) alongside
human-submitted proposals. Keep `proposalType` ≤80 chars, `field` ≤160 chars, `proposedValue`/
`reason` ≤4000 chars, `sourceUrl` ≤1500 chars, `proposedBy` ≤160 chars — same limits
`admin_server.py` enforces.

## After writing

1. `python -c "import json; json.load(open('data/auto-detected-updates.json', encoding='utf-8'))"`
   and the same for `review-proposals.json` if it was touched — confirm valid JSON.
2. `python scripts/validate_data.py` — must pass.
3. Summarize the run in chat: which sources were checked, what (if anything) was found and
   classified how, and anything explicitly ruled out and why. Never claim something was added to
   the live site — findings here are proposals, not publications.
