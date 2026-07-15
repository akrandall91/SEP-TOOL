#!/usr/bin/env python3
"""
Fetches Census ACS 5-year tract-level poverty rate, median household income, and population for
Guilford County, NC (state FIPS 37, county FIPS 081 — Greensboro's county), and writes
data/live/census-acs.json. Used by Recommendation 3 ("identify the most impacted and vulnerable
communities") in place of a static CEJST-style dot map — see the CEJST note below for why.

Requires a CENSUS_API_KEY environment variable (a free, instant self-serve key from
https://api.census.gov/data/key_signup.html). Run manually with:
  CENSUS_API_KEY=xxx python scripts/fetch_census_acs.py
Run automatically by .github/workflows/refresh-census-acs.yml on a schedule.

ENDPOINT VERIFIED in this session (not fully end-to-end — no key was available in this environment):
a real unauthenticated request to https://api.census.gov/data/2022/acs/acs5 with the exact params
below returned an HTTP 200 "Missing Key" HTML error page (not a 404 or a malformed-request error),
confirming the route/params/year are current and correctly structured — the only missing piece is
the key itself. Verify the first live run's actual JSON output shape before trusting this blindly,
same caveat as this project's existing EIA grid-mix script.

Why this replaces CEJST rather than supplementing it: EPA's official EJScreen subdomain
(ejscreen.epa.gov) returned a DNS resolution failure in this session — the subdomain does not
resolve at all, consistent with the tool being taken down. The Council on Environmental Quality's
CEJST was removed from official White House hosting in January 2025; the only surviving copy found
during verification is an unofficial community mirror (Public Environmental Data Partners, GitHub-
hosted, no documented REST API — see https://github.com/Public-Environmental-Data-Partners/cejst-2).
Building a civic accountability tool's live data layer against an unofficial, unversioned mirror of
a decommissioned federal tool was judged not worth the fragility for this pass. Census ACS — an
official, stable, actively maintained federal API — is used alone instead. This is a real reduction
in scope from a CEJST-equivalent view (no combined environmental+demographic burden score, no
official "disadvantaged community" designation flag) — documented here rather than faked.
"""

import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT_PATH = ROOT / "data" / "live" / "census-acs.json"

ACS_BASE = "https://api.census.gov/data/2022/acs/acs5"
STATE_FIPS = "37"   # North Carolina
COUNTY_FIPS = "081"  # Guilford County

# B17001_002E = population below poverty level, B17001_001E = population for whom poverty status
# is determined (the correct denominator). B19013_001E = median household income. B01003_001E =
# total population.
VARIABLES = ["NAME", "B17001_002E", "B17001_001E", "B19013_001E", "B01003_001E"]


def fetch_tracts(api_key: str) -> list:
    params = {
        "get": ",".join(VARIABLES),
        "for": "tract:*",
        "in": f"state:{STATE_FIPS}+county:{COUNTY_FIPS}",
        "key": api_key,
    }
    url = f"{ACS_BASE}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise RuntimeError(f"Census API did not return JSON — got: {raw[:300]}")


def summarize(rows: list) -> dict:
    header, *data = rows
    idx = {name: i for i, name in enumerate(header)}
    tracts = []
    for row in data:
        try:
            below_poverty = float(row[idx["B17001_002E"]])
            poverty_denom = float(row[idx["B17001_001E"]])
            median_income = row[idx["B19013_001E"]]
            population = float(row[idx["B01003_001E"]])
        except (ValueError, TypeError):
            continue
        if poverty_denom <= 0:
            continue
        tracts.append({
            "tractName": row[idx["NAME"]],
            "tractFips": row[idx["tract"]],
            "population": int(population),
            "povertyRatePct": round(100 * below_poverty / poverty_denom, 1),
            "medianHouseholdIncomeUsd": int(median_income) if median_income not in (None, "-666666666") else None,
        })

    tracts.sort(key=lambda t: t["povertyRatePct"], reverse=True)
    top_10_pct_count = max(1, len(tracts) // 10)

    return {
        "source": "Census ACS 5-Year Estimates 2022, tract-level, Guilford County NC",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "tractCount": len(tracts),
        "highestPovertyTracts": tracts[:top_10_pct_count],
        "allTracts": tracts,
        "cejstNote": (
            "This replaces a CEJST-style vulnerable-communities view, not supplements it. EPA's "
            "official EJScreen subdomain (ejscreen.epa.gov) does not resolve (DNS failure, confirmed "
            "directly). CEJST was removed from official White House hosting in January 2025; the only "
            "surviving copy is an unofficial community-run mirror with no documented REST API. This "
            "dataset is Census ACS poverty-rate/income data alone — a real, official, live federal "
            "source, but not a combined environmental+demographic burden score and not an official "
            "'disadvantaged community' designation. See data/SCHEMA.md for the full account."
        ),
        "citation": {
            "sourceType": "external",
            "publisher": "U.S. Census Bureau",
            "title": "American Community Survey 5-Year Estimates, 2022 — Guilford County, NC tracts",
            "url": "https://api.census.gov/data/2022/acs/acs5",
            "retrievedDate": datetime.now(timezone.utc).date().isoformat(),
        },
    }


def main():
    api_key = os.environ.get("CENSUS_API_KEY")
    if not api_key:
        print("ERROR: CENSUS_API_KEY environment variable not set.", file=sys.stderr)
        print("Register a free instant key at https://api.census.gov/data/key_signup.html", file=sys.stderr)
        # Write a "pending" placeholder (same pattern as fetch_aqs_snapshot.py) so the site can
        # render an explicit "pending API key" state instead of a bare failed fetch.
        placeholder = {
            "status": "pending-api-key",
            "note": (
                "Census API requires a free, instant self-serve key that has not yet been added to "
                "this repository's secrets. Endpoint/params verified live (unauthenticated request "
                "returned the expected 'Missing Key' response) — see scripts/fetch_census_acs.py."
            ),
            "checkedAt": datetime.now(timezone.utc).isoformat(),
        }
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(placeholder, indent=2), encoding="utf-8")
        print(f"Wrote pending-state placeholder to {OUT_PATH}")
        sys.exit(1)

    rows = fetch_tracts(api_key)
    summary = summarize(rows)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH} — {summary['tractCount']} tracts")


if __name__ == "__main__":
    main()
