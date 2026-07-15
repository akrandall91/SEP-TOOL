#!/usr/bin/env python3
"""
ONE-TIME migration script: merges the 2023 (progress2023) and 2024 (progress2024) Annual
Progress Report data into the existing JSON data layer, per the confirmed Phase 0/decisions
from the "Merge 2023 & 2024 OSR Annual Progress Reports" task. Not part of the regular build —
run once, then this script's job is done (kept in scripts/ as a record of what changed and why,
same spirit as fetch_grid_mix.py).

Run: python scripts/apply_2023_2024_merge.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "data"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def save(name, obj):
    (DATA / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  wrote {name}")


# ---------------------------------------------------------------------------
# recommendations.json — statusHistory + Rec7 stalled flag + Rec6 funding fix
# ---------------------------------------------------------------------------
recs = load("recommendations.json")

STATUS_HISTORY = {
    1: [
        {"year": 2023, "status": "Completed", "citation": {"source": "progress2023", "page": 7}},
        {"year": 2024, "status": "Completed", "citation": {"source": "progress2024", "page": 7}},
    ],
    2: [
        {"year": 2023, "status": "Initiated", "citation": {"source": "progress2023", "page": 12}},
        {"year": 2024, "status": "In progress", "citation": {"source": "progress2024", "page": 14}},
    ],
    3: [
        {"year": 2023, "status": "Initiated", "citation": {"source": "progress2023", "page": 12}},
        {"year": 2024, "status": "In progress", "citation": {"source": "progress2024", "page": 15}},
    ],
    4: [
        {"year": 2023, "status": "Ongoing", "citation": {"source": "progress2023", "page": 13}},
        {"year": 2024, "status": "Ongoing", "citation": {"source": "progress2024", "page": 15}},
    ],
    5: [
        {"year": 2023, "status": "Initiated", "citation": {"source": "progress2023", "page": 13}},
        {"year": 2024, "status": "In progress", "citation": {"source": "progress2024", "page": 15}},
    ],
    6: [
        {"year": 2023, "status": "Initiated", "citation": {"source": "progress2023", "page": 14}},
        {"year": 2024, "status": "In progress", "citation": {"source": "progress2024", "page": 16}},
    ],
    7: [
        {"year": 2023, "status": "Initiated", "citation": {"source": "progress2023", "page": 14}},
        {"year": 2024, "status": "Initiated", "citation": {"source": "progress2024", "page": 16}},
    ],
    8: [
        {"year": 2023, "status": "Initiated", "citation": {"source": "progress2023", "page": 14}},
        {"year": 2024, "status": "In Progress", "citation": {"source": "progress2024", "page": 16}},
    ],
}

for rec in recs["recommendations"]:
    n = rec["number"]
    rec["statusHistory"] = STATUS_HISTORY[n]

# Rec 7: check current 2025 status — confirmed "Initiated" in existing data, so this is a
# 3-report flatline (2023, 2024, 2025 all "Initiated"). Apply the stalled flag.
rec7 = next(r for r in recs["recommendations"] if r["number"] == 7)
rec7_2025_status = rec7.get("status2025", {}).get("status")
assert rec7_2025_status == "Initiated", f"Expected Rec7 2025 status 'Initiated', found {rec7_2025_status!r} — stalled flag logic assumed this; re-check before proceeding."
rec7["stalled"] = {
    "value": True,
    "note": "“Initiated” in all three Annual Progress Reports published to date (2023, 2024, 2025) — three consecutive years with no progression to “In Progress” or beyond. Per OSR's own status definitions, “Initiated” means “the starting point... in most cases, funding has been allocated and projects are pending” — a 3-year plateau at that stage is a notable stall, not a normal steady-state (unlike “Ongoing,” which is expected to repeat indefinitely by definition).",
    "years": [2023, 2024, 2025],
}

# Rec 6, Strategy 6.1 and 6.2: previously marked unfunded (no named source). The USDA Forest
# Service Tree Canopy grant ($825,000, awarded Sept 2023) funds exactly this work — correct it.
rec6 = next(r for r in recs["recommendations"] if r["number"] == 6)
for strat in rec6["strategies"]:
    if strat["number"] in ("6.1", "6.2"):
        strat["fundingLink"] = {
            "hasActiveFunding": True,
            "linkedTo": "funding.json > grants > usda-tree-canopy-2023",
            "note": "Corrected from an earlier 'unnamed consultant, no funding.json entry' assessment — the 2023 Progress Report confirms the USDA Forest Service Tree Canopy grant ($825,000, awarded September 2023) funds this tree canopy inventory/management plan work directly.",
        }

save("recommendations.json", recs)

# ---------------------------------------------------------------------------
# directives.json — add Directive 1 with the multi-year GHG table + inconsistency flag
# ---------------------------------------------------------------------------
directives = load("directives.json")

directive_1 = {
    "number": 1,
    "text": "Specific steps to reduce Scope 1 and Scope 2 greenhouse gas (GHG) emissions (from City operations) by 40 percent or more from estimated 2007 levels by 2025.",
    "correspondingResolutionMandateId": "ghg-40x2025",
    "status": "Self-reported as met (2024 estimate) — pending official verification",
    "statusText": "The 2024 Progress Report's citywide multi-year table shows total municipal GHG emissions down 42.13% from the 2007 baseline by 2024, exceeding the 40% target one year ahead of the 2025 deadline. This is OSR's own preliminary estimate (the report's table footnote states 'data subject to revision'); the official confirmation awaits the updated GHG inventory contracted in December 2025 (Directive 8), due June 2026.",
    "inconsistencyFlag": {
        "value": True,
        "note": "The 2024 Progress Report's own prose states the 40% threshold 'was reached by 2023,' but its own table shows 2023 at only -39.31% — short of 40%. The table's 2024 figure (-42.13%) is the first year that actually crosses -40%. This site follows the table's numbers, not the report's prose claim, and flags the discrepancy explicitly rather than silently adopting either.",
        "citation": {"source": "progress2024", "page": 6}
    },
    "multiYearGhgTotal": {
        "unit": "MTCO2e, % change from 2007 baseline",
        "note": "Citywide total across electricity, natural gas, diesel, and unleaded gasoline. See citywide-energy-timeseries.json for the full by-fuel-type breakdown.",
        "series": [
            {"year": 2007, "totalMtco2e": 100487.8, "pctChangeFrom2007": 0.0},
            {"year": 2019, "totalMtco2e": 69711.1, "pctChangeFrom2007": -30.63},
            {"year": 2022, "totalMtco2e": 62807.2, "pctChangeFrom2007": -37.50},
            {"year": 2023, "totalMtco2e": 60988.9, "pctChangeFrom2007": -39.31},
            {"year": 2024, "totalMtco2e": 58152.2, "pctChangeFrom2007": -42.13, "note": "First year the 40% target is actually crossed, per the table's own numbers."}
        ]
    },
    "citation": {"source": "progress2024", "page": 6}
}

# insert Directive 1 first (numbered lowest), keep existing 4/8/9 as-is
directives["directives"].insert(0, directive_1)
directives["directiveStatusDefinitionsSource"] = {
    "note": "OSR's own official status-word definitions, transcribed verbatim from the 2024 Progress Report. Used site-wide for Ongoing/In Progress/Initiated tooltips (see components.js STATUS_EXPLAIN) in place of this project's earlier inferred wording.",
    "definitions": {
        "Ongoing": "A program or standard practice that has been established, remains in effect, and continues indefinitely.",
        "In Progress": "A project or program that has been started and will be completed after a finite period (whether the completion date is known or unknown).",
        "Initiated": "The starting point of a project, task, program, or activity during the reporting period. In most cases, funding has been allocated and projects are pending."
    },
    "citation": {"source": "progress2024", "page": 19}
}

save("directives.json", directives)

print("Phase 1a (recommendations.json, directives.json, citation infra) complete.")

# ---------------------------------------------------------------------------
# departments.json — wentSilent flags, statusHistory, LED time series, program notes
# ---------------------------------------------------------------------------
departments = load("departments.json")


def find_goal(dept_id, goal_id):
    dept = next(d for d in departments["departments"] if d["id"] == dept_id)
    return next(g for g in dept["goals"] if g["id"] == goal_id)


WENT_SILENT_NOTE = (
    "This goal showed real activity in both the 2023 and 2024 Annual Progress Reports "
    "(status: Initiated in each), then received no update at all in the 2025 report — a "
    "confirmed two-year-then-silence pattern, distinct from a goal that was never reported on "
    "and distinct from the natural-gas goals the SEP itself deprioritized. Nothing in the source "
    "documents says this work stopped or was deprioritized; it simply stopped being mentioned."
)

# TR-GAS-G1: Initiated (2023) -> Initiated (2024) -> not reported (2025)
g = find_goal("transportation-gasoline", "TR-GAS-G1")
g["statusHistory"] = [
    {"year": 2023, "status": "Initiated", "text": "Staff from the OSR, Fleet and Equipment Services Division, and Transportation Department acquired informational case studies and discussed strategies and resources available to local governments for transitioning to electric and hybrid vehicles.", "citation": {"source": "progress2023", "page": 19}},
    {"year": 2024, "status": "Initiated", "citation": {"source": "progress2024", "page": 19}},
]
g["wentSilent"] = {"value": True, "note": WENT_SILENT_NOTE, "lastReportedYear": 2024, "lastReportedStatus": "Initiated"}

# FO-G1 (Solid Waste & Recycling, formerly Field Operations): Initiated (2023) -> Initiated (2024) -> not reported (2025)
g = find_goal("field-operations-diesel", "FO-G1")
g["statusHistory"] = [
    {"year": 2023, "status": "Initiated", "citation": {"source": "progress2023", "page": 18}},
    {"year": 2024, "status": "Initiated", "citation": {"source": "progress2024", "page": 19}},
]
g["wentSilent"] = {"value": True, "note": WENT_SILENT_NOTE, "lastReportedYear": 2024, "lastReportedStatus": "Initiated"}
g["departmentRenameNote"] = "Already referred to as 'Solid Waste & Recycling Department' in the 2023 Progress Report (published March 2024) — earlier than this site's prior assumption that the rename was 'as of the 2025 report.' The rename appears to predate or coincide with the 2023 reporting period, not the 2025 one."

# CI-G1: Initiated (2023) -> Initiated (2024) -> not reported (2025)
g = find_goal("community-incentives", "CI-G1")
g["statusHistory"] = [
    {"year": 2023, "status": "Initiated", "text": "The OSR submitted a proposal for funding through the US Department of Energy's Energy Efficiency and Conservation Block Grant program. At least 40 percent of the benefits of proposed projects will flow to disadvantaged communities.", "citation": {"source": "progress2023", "page": 15}},
    {"year": 2024, "status": "Initiated", "text": "The OSR received $314,150 in December 2024 from the DOE EECBG Program, funding (beginning 2025): a comprehensive fleet efficiency study and transition plan, a water and energy conservation outreach program, a study to select candidate buildings for net-zero upgrades, and a comprehensive GHG inventory. Separately, Housing & Neighborhood Development's Weatherization Assistance Program and Duke Energy Carolinas' High Energy Usage Pilot Program collaborated on client referrals/repairs, including replacing old heating systems with mini-split heat pumps in the 59-unit Southwoods multi-family housing rehabilitation project.", "citation": {"source": "progress2024", "page": 20}},
]
g["wentSilent"] = {"value": True, "note": WENT_SILENT_NOTE, "lastReportedYear": 2024, "lastReportedStatus": "Initiated"}
g["fundingLink"] = {
    "hasActiveFunding": True,
    "linkedTo": "funding.json > grants > eecbg-2024",
    "note": "Corrected from an earlier 'no funding' assessment — the 2024 Progress Report explicitly ties the EECBG grant to this goal.",
}

# TR-E-G1 (LED streetlamp conversion): add the real % time series the 2025 report said was unavailable
g = find_goal("transportation-electricity", "TR-E-G1")
g["ledConversionTimeSeries"] = {
    "unit": "% of ~27,400 City streetlamps converted to LED",
    "note": "Closes the gap the 2025 Progress Report explicitly flagged as unavailable — found in the 2024 report instead.",
    "series": [
        {"year": 2019, "pctLed": 15.2, "ledCount": 4039},
        {"year": 2021, "pctLed": 33.0, "ledCount": 9005},
        {"year": 2023, "pctLed": 39.7, "ledCount": 10851},
        {"year": 2024, "pctLed": 41.2, "ledCount": 11295},
    ],
    "avgAnnualPaceNote": "OSR's own stated average pace: 5.2% per year (2019-2024).",
    "citation": {"source": "progress2024", "page": 17},
}
g["statusHistory"] = [
    {"year": 2023, "status": "Ongoing", "text": "As of October 2023, 39.6% of all lamps used LEDs, up from 15.2% in 2019 (avg. pace 6.1%/year).", "citation": {"source": "progress2023", "page": 16}},
    {"year": 2024, "status": "Ongoing", "text": "As of December 2024, 41.2% converted, up from 15.2% in 2019 (avg. pace 5.2%/year).", "citation": {"source": "progress2024", "page": 17}},
]

# EI-G1 (Buildings/E&I): add BuildingLogiX real-time sub-metering fact + 2023/2024 history
g = find_goal("buildings-ei", "EI-G1")
g["buildingLogiX"] = {
    "note": "The City contracted BuildingLogiX, an energy sub-metering system, installed in City buildings in October 2024, allowing real-time electricity monitoring in the 10 largest City buildings.",
    "citation": {"source": "progress2024", "page": 14},
}
g["statusHistory"] = [
    {"year": 2023, "status": "Initiated", "text": "The OSR developed an RFP for contractors to provide energy audits and recommendations for energy conservation measures in the City's largest energy-consuming buildings, in compliance with ASHRAE standards, including MWBE Office participation.", "citation": {"source": "progress2023", "page": 17}},
    {"year": 2024, "status": "In Progress", "text": "The OSR contracted with a vendor to provide energy audits in select City buildings. Ten buildings were studied in 2024, with more planned for 2025.", "citation": {"source": "progress2024", "page": 18}},
]

# WR-G2 (Water Resources electricity): add 2023/2024 narrative history
g = find_goal("water-resources", "WR-G2")
g["statusHistory"] = [
    {"year": 2023, "status": "Ongoing", "text": "The Water Resources Department prepared an engineering study of its water and wastewater equipment (completed 2021); replacement of equipment is now prioritized based on the study's energy efficiency measurements.", "citation": {"source": "progress2023", "page": 16}},
    {"year": 2024, "status": "Ongoing", "text": "The Water Resources Department finalized its Electrical System Evaluation and Preliminary Engineering Report, replaced three motor control centers, and added a new power feeder from the main substation at the T.Z. Osborne Wastewater Reclamation Facility. Two outdated emergency generators are being replaced.", "citation": {"source": "progress2024", "page": 17}},
]

# POL-G1 (Police gasoline): add 2023/2024 history
g = find_goal("police-gasoline", "POL-G1")
g["statusHistory"] = [
    {"year": 2023, "status": "Initiated", "text": "Staff from the OSR, Equipment Services Division, and Transportation Department attended the Electrify the South workshop to learn about EV fleet transition strategies and resources.", "citation": {"source": "progress2023", "page": 17}},
    {"year": 2024, "status": "In Progress", "text": "The Police Department ordered two hybrid Ford Mavericks to replace existing Chevrolet Equinoxes, and is seeking an EV model to replace its prisoner transport van.", "citation": {"source": "progress2024", "page": 18}},
]

# TR-D-G1 (Transportation/Transit diesel, GTA): add 2023/2024 history
g = find_goal("transportation-diesel", "TR-D-G1")
g["statusHistory"] = [
    {"year": 2023, "status": "Initiated", "text": "Greensboro Transit Agency (GTA), managed by the Transit Department, completed a zero-emissions fleet transition plan. GTA was also developing a new long-range transit plan, GoBORO, to help achieve the City's car-optional-by-2045 goal.", "citation": {"source": "progress2023", "page": 19}},
    {"year": 2024, "status": "In Progress", "text": "In late 2024, GTA and Transportation staff completed the GoBORO transit mobility study, recommending significant route/frequency changes. The City's first 15-minute-service route, CrossMax Purple, launched March 2024 and averages 10,000 riders/week — a ~54% ridership increase over the routes it replaced.", "citation": {"source": "progress2024", "page": 20}},
]

save("departments.json", departments)
print("Phase 1b (departments.json) complete.")

# ---------------------------------------------------------------------------
# funding.json — USDA Forest Service Tree Canopy grant (new, distinct from EECBG) +
# EECBG's confirmed multi-recommendation funded-activities list
# ---------------------------------------------------------------------------
funding = load("funding.json")

funding["grants"].append({
    "id": "usda-tree-canopy-2023",
    "name": "USDA Forest Service Tree Canopy Grant",
    "source": "US Department of Agriculture Forest Service (Inflation Reduction Act funding)",
    "amountUsd": 825000,
    "dateAwarded": "2023-09",
    "purpose": "5-year project to conduct an updated tree canopy study and management plan, and engage disadvantaged communities of Greensboro. One of 842 proposals reviewed nationally (of $6.4 billion in requests); overseen by OSR with support from other City departments. This is the grant behind the 'Keeping the Green in Greensboro: Tree Canopy and Equity Prioritization Study' (kicked off Sept. 2024, assessment completed Dec. 2024, Equity Prioritization Tool completed Nov. 2025).",
    "linkedRecommendation": "recommendations.json > REC-6 (Strategy 6.1, 6.2)",
    "verificationStatus": "primary-source-verified",
    "citation": {"source": "progress2023", "page": 9},
})

eecbg = next(g for g in funding["grants"] if g["id"] == "eecbg-2024")
eecbg["fundedActivities"] = [
    {"activity": "Comprehensive fleet efficiency study and transition plan", "linkedTo": "recommendations.json > REC-5", "beginsYear": 2025},
    {"activity": "Long-term planning, building upgrades, monitoring/analytics, renewable energy exploration, educational content", "linkedTo": "recommendations.json > REC-3"},
    {"activity": "Vehicle inventory / equipment purchase / lease process analysis (folded into the fleet efficiency study)", "linkedTo": "recommendations.json > REC-8"},
    {"activity": "Water and energy conservation kits + outreach in low-wealth areas; net-zero building candidate study; comprehensive GHG inventory prep", "linkedTo": "departments.json > community-incentives > CI-G1"},
    {"activity": "GSO WaterWise water/energy conservation kit distribution", "linkedTo": "departments.json > water-resources > WR-G2"},
]
eecbg["fundedActivitiesNote"] = "Confirmed across the 2024 and 2025 Progress Reports as funding five distinct activities spanning three recommendations and two department goals from a single $314,150 award — reflected here as a list rather than split into per-activity dollar amounts, since no source document allocates specific dollars to each activity."

save("funding.json", funding)
print("Phase 1c (funding.json) complete.")

# ---------------------------------------------------------------------------
# prioritized-actions.json — splice in 2023/2024 status for Actions 1, 4, 5, 8, 12, 26
# ---------------------------------------------------------------------------
actions = load("prioritized-actions.json")
y15 = actions["years1to5"]


def find_action(number):
    return next(a for a in y15 if a["number"] == number)


ACTION_HISTORY = {
    1: [
        {"year": 2023, "status": "Initiated", "text": "Implementation has been initiated on Organization-Wide Recommendations 1-7.", "citation": {"source": "progress2023", "page": 15}},
        {"year": 2024, "status": "In progress", "text": "Implementation is underway on organization-wide recommendations 1-7.", "citation": {"source": "progress2024", "page": 21}},
    ],
    4: [
        {"year": 2023, "status": "Ongoing", "citation": {"source": "progress2023", "page": 15}},
        {"year": 2024, "status": "Ongoing", "text": "The Early Prioritization Tool developed for the Tree Canopy Grant Project uses numerous criteria to identify areas home to the most impacted and vulnerable residents.", "citation": {"source": "progress2024", "page": 21}},
    ],
    5: [
        {"year": 2024, "status": "Ongoing", "text": "In August 2024, the MWBE Office hosted an open house on the Windsor Chavis Nocho Community Complex project (min. 17.25% MBE / 15.75% WBE participation goals). In October, the City hosted a 'MWBE Building Relationships' event for departments to preview upcoming contract opportunities.", "citation": {"source": "progress2024", "page": 21}},
    ],
    8: [
        {"year": 2023, "status": "Initiated", "text": "The OSR submitted a proposal for EECBG funding; at least 40% of proposed-project benefits will flow to disadvantaged communities.", "citation": {"source": "progress2023", "page": 15}},
        {"year": 2024, "status": "In progress", "text": "The OSR received $314,150 in December 2024 from the DOE EECBG Program, supporting water/energy efficiency kit purchases and related education/outreach in low-wealth areas, beginning 2025.", "citation": {"source": "progress2024", "page": 21}},
    ],
    12: [
        {"year": 2023, "status": "Ongoing", "citation": {"source": "progress2023", "page": 15}},
        {"year": 2024, "status": "Ongoing", "text": "The Water Resources Department finalized its Electrical System Evaluation and Preliminary Engineering Report; replaced three motor control centers; added a new power feeder at T.Z. Osborne; working to replace two outdated emergency generators.", "citation": {"source": "progress2024", "page": 21}, "note": "Not individually called out by number in the 2025 report, though the underlying Water Resources Goal 2 narrative continues there."},
    ],
    26: [
        {"year": 2023, "status": "Ongoing", "text": "Greensboro was designated SolSmart Bronze in 2021. Additional actions, including policy amendments, are needed to earn Silver or Gold.", "citation": {"source": "progress2023", "page": 15}},
    ],
}

for num, hist in ACTION_HISTORY.items():
    a = find_action(num)
    a["statusHistory"] = hist

save("prioritized-actions.json", actions)
print("Phase 1d (prioritized-actions.json) complete.")

# ---------------------------------------------------------------------------
# NEW FILE: citywide-energy-timeseries.json — Report B's 2007-2024 table, kept SEPARATE
# from baseline-2019.json since Natural Gas and Unleaded figures don't reconcile with the
# original SEP's Table 1/Table 10 for the same nominal 2019 baseline (Electricity and Diesel do).
# ---------------------------------------------------------------------------
citywide = {
    "_notes": "This is a DISTINCT citywide-total time series from baseline-2019.json's SEP-sourced tables. "
              "Prepared by OSR itself (2024 Progress Report, p.6) as an 'estimate' for 2022-2024, using "
              "different underlying data sources than the original 2022 SEP (Piedmont Natural Gas direct "
              "data, USEPA eGrid Virginia/Carolinas emissions factors) and explicitly marked 'data subject "
              "to revision' by its own footnote. Electricity and Diesel figures reconcile closely with the "
              "original SEP's Table 1/Table 10 2007/2019 figures; Natural Gas and Unleaded gasoline do NOT "
              "(see reconciliationNote below) — flagged rather than silently merged or overwritten. No "
              "department-level breakdown exists for 2022-2024 in either report — this is citywide-total only.",
    "citation": {"source": "progress2024", "page": 6, "table": "Energy Use in City Operations / Estimated GHG Emissions from City Operations"},
    "reconciliationNote": {
        "reconciles": ["Electricity (MWh)", "Diesel (gal)"],
        "doesNotReconcile": ["Natural Gas", "Unleaded/Gasoline (gal)"],
        "detail": "For the same nominal 2019 baseline: this series states Natural Gas as 834,468 therms (~83,427-83,447 MMBtu converted), vs. the original SEP's Table 1/Table 10 figure of 94,872 MMBTU — an ~12% gap. This series states Unleaded as 792,941 gal, vs. the original SEP's Table 1/Table 10 'Gasoline' figure of 1,181,995 gal — a ~33% gap. Electricity (139,414.4 vs. 139,414 MWh) and Diesel (1,478,395.0 vs. 1,478,395 gal) match almost exactly. Not resolved to a single authoritative number — both series are shown, separately labeled.",
    },
    "energyUseOriginalUnits": {
        "unit": "Electricity: MWh · Natural Gas: Therms · Diesel/Unleaded/B20 Biodiesel: gal",
        "series": {
            "electricityMwh": {2007: 141392.1, 2019: 139414.4, 2022: 135589.6, 2023: 135920.8, 2024: 121890.9},
            "naturalGasTherms": {2007: 797149.0, 2019: 834468.0, 2022: 1003434.0, 2023: 1053035.0, 2024: 1114891.0},
            "dieselGal": {2007: 1261650.4, 2019: 1478395.0, 2022: 1285079.6, 2023: 1276295.4, 2024: 1308965.2},
            "unleadedGal": {2007: 803444.2, 2019: 792941.0, 2022: 630263.5, 2023: 623315.2, 2024: 652225.3},
            "b20BiodieselGal": {2007: 389686.9, 2019: 0.0, 2022: 0.0, 2023: 0.0, 2024: 0.0},
        },
    },
    "energyUseCommonUnitsMmbtu": {
        "series": {
            "electricity": {2007: 482450.1, 2019: 475701.7, 2022: 462650.8, 2023: 463781.2, 2024: 415909.2},
            "naturalGas": {2007: 79695.8, 2019: 83426.9, 2022: 100319.4, 2023: 105278.3, 2024: 111462.5},
            "diesel": {2007: 173326.8, 2019: 203103.4, 2022: 176545.5, 2023: 175338.7, 2024: 179826.9},
            "unleaded": {2007: 96643.1, 2019: 95379.7, 2022: 75811.9, 2023: 74976.1, 2024: 78453.6},
            "b20Biodiesel": {2007: 49587.7, 2019: 0.0, 2022: 0.0, 2023: 0.0, 2024: 0.0},
            "total": {2007: 881703.5, 2019: 857611.6, 2022: 815327.6, 2023: 819374.4, 2024: 785652.6},
        },
        "pctChangeFrom2007": {2007: 0.0, 2019: -2.73, 2022: -7.53, 2023: -7.07, 2024: -10.89},
    },
    "ghgEmissionsMtco2e": {
        "series": {
            "electricity": {2007: 72128.6, 2019: 42948.4, 2022: 38510.3, 2023: 36564.9, 2024: 32790.8},
            "naturalGas": {2007: 4468.2, 2019: 4678.4, 2022: 5625.7, 2023: 5603.8, 2024: 6250.0},
            "diesel": {2007: 12822.3, 2019: 15023.3, 2022: 13058.8, 2023: 12969.6, 2024: 13301.9},
            "unleaded": {2007: 7162.0, 2019: 7061.1, 2022: 5612.5, 2023: 5550.6, 2024: 5809.4},
            "b20Biodiesel": {2007: 3906.7, 2019: 0.0, 2022: 0.0, 2023: 0.0, 2024: 0.0},
            "total": {2007: 100487.8, 2019: 69711.1, 2022: 62807.2, 2023: 60988.9, 2024: 58152.2},
        },
        "pctChangeFrom2007": {2007: 0.0, 2019: -30.63, 2022: -37.50, 2023: -39.31, 2024: -42.13},
    },
    "sourceFootnote": "Electricity use data from Duke Energy; natural gas use data from Piedmont Natural Gas; unleaded, diesel, and biodiesel data from the City of Greensboro; emissions factors from USEPA eGrid Virginia/Carolinas sub-region; global warming potentials from IPCC 4th, 5th, and 6th Assessment Reports. (Data subject to revision.)",
}
save("citywide-energy-timeseries.json", citywide)
print("Phase 1e (citywide-energy-timeseries.json) complete.")

# ---------------------------------------------------------------------------
# NEW FILE: progress-2023-2024-misc.json — HHW/Food Waste stats, CSC roster check, tree
# canopy/EPT timeline, mirrors progress-2025-misc.json's conventions for the two earlier years.
# ---------------------------------------------------------------------------
misc = {
    "_notes": "Mirrors progress-2025-misc.json's structure for the 2023 and 2024 reporting years. Kept as a separate file (rather than renaming/restructuring progress-2025-misc.json) per the instruction not to restructure existing files.",
    "hhwStatistics": {
        "citation": {"source": "progress2024", "page": 8},
        "note": "2023 column also independently stated in the 2023 report (progress2023, p.8): calls 2,972, facility visitors 22,847, tons HHW 961, tons electronics 362, tons diverted 1,323 — matches Report B's 2023 column exactly.",
        "byYear": {
            2023: {"callsToHotline": 2972, "facilityVisitors": 22847, "tonsHhwCollected": 961, "tonsElectronicsCollected": 362, "totalTonsDivertedFromLandfills": 1323},
            2024: {"callsToHotline": 3361, "facilityVisitors": 23495, "tonsHhwCollected": 876, "tonsElectronicsCollected": 361, "totalTonsDivertedFromLandfills": 1237},
        },
    },
    "foodWasteCollectionPilot": {
        "citation": {"source": "progress2024", "page": 9},
        "startDate": "2023-04",
        "startLocation": "Greensboro Farmers Curb Market",
        "expansionNote": "Moved to Deep Roots Market (Oct. 2023); second drop-off at Congregational United Church of Christ added March 2024. Cart count tripled and pickup frequency increased due to demand.",
        "totals2023": {"totalDiverted": "2.788 tons (5,576 lbs)", "estimatedGhgAvoidedMtco2e": 2.34, "citation": {"source": "progress2023", "page": 8}},
        "totals2024": {"cartloads": 205, "pounds": 50981, "shortTons": 25.49, "ghgEmissionsAvoidedMtco2e": 16.6, "methodNote": "Estimated using the US EPA Waste Reduction Model (WARM).", "citation": {"source": "progress2024", "page": 9}},
    },
    "treeCanopyEquityPrioritizationTimeline": {
        "citation": {"source": "progress2024", "page": 10},
        "grantAwarded": "2023-09",
        "grantAmountUsd": 825000,
        "grantSource": "USDA Forest Service (Inflation Reduction Act)",
        "studyKickoff": "2024-09",
        "consultant": "Planning Communities, LLC",
        "assessmentCompleted": "2024-12",
        "eptProjectedCompletion": "early 2025 (as stated in the 2024 report)",
        "eptActualLaunch": "2025-11",
        "eptTimelineNote": "Timeline refinement, not a contradiction: the 2024 report's 'early 2025' completion projection for the Equity Prioritization Tool slipped to an actual November 2025 hub launch, per the 2025 Progress Report already on this site.",
    },
    "cscRosterCheck": {
        "note": "Checked, immaterial: CSC roster is largely stable across the 2024 (this file) and 2025 (progress-2025-misc.json) reports. Report B (2024) lists Marikay Abuzuaiter as a non-counted liaison and 'Conor Baker, Chair'; the 2025 report lists Baker as 'Co-Chair' and doesn't separately list a liaison. Label variance only — no membership change identified.",
        "citation": {"source": "progress2024", "page": 4},
    },
    "buildingLogiX": {
        "note": "Energy sub-metering system installed October 2024, providing real-time electricity monitoring in the City's 10 largest buildings.",
        "citation": {"source": "progress2024", "page": 14},
    },
    "leaveTheLeaves2023": {
        "note": "Approx. 200 residents pledged to leave/mulch leaves from ~2,300 trees (2023); grew to ~285 households and ~3,027 trees by 2024 per the 'Greensboro's Prettiest Landscape Contest' coverage.",
        "citation": {"source": "progress2023", "page": 9},
    },
}
save("progress-2023-2024-misc.json", misc)
print("Phase 1f (progress-2023-2024-misc.json) complete.")

print()
print("All Phase 1 JSON updates applied.")
