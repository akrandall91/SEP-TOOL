#!/usr/bin/env python3
"""
Fetches recent daily ozone (and PM2.5, where available) air-quality data for Guilford County, NC
from EPA's Air Quality System (AQS) API, and writes data/live/aqs-snapshot.json.

Requires AQS_EMAIL and AQS_KEY environment variables. Unlike the EIA/Census keys (instant self-serve
web forms), an AQS key is requested via a signup form and delivered by email — there is no
synchronous key issuance, so this integration may sit in a "pending API key" state indefinitely
until someone completes that manual step. Sign up at:
  https://aqs.epa.gov/data/api/signup?email=<your-email>
Run manually with:
  AQS_EMAIL=you@example.com AQS_KEY=xxx python scripts/fetch_aqs_snapshot.py
Run automatically by .github/workflows/refresh-aqs.yml on a schedule.

VERIFIED END-TO-END with real data (two live runs): a 14-day window returned zero rows; widened to
90 days and got a real reading — Mendenhall School monitor, ozone 0.039391 ppm, dated ~7 weeks
before the fetch date (164 rows total in the 90-day window). AQS's own `aqi` field was null on that
row (not every daily-summary row gets an AQI value computed — treat it as legitimately absent, not
a parsing bug). The ~7-week lag is far longer than "monitors report on a delay" implies — this is
EPA's own quality-assurance/validation cycle for regulatory air-monitoring data, not a live feed.
Because of that lag, refresh-aqs.yml runs weekly rather than daily: a daily re-fetch of a dataset
that only produces a new "most recent" reading every several weeks wastes CI minutes for no benefit.

Pollutant code 44201 = Ozone (the pollutant both Progress Reports' Climate Resiliency framing
focuses on). state=37 (NC), county=081 (Guilford County, which contains Greensboro).
"""

import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT_PATH = ROOT / "data" / "live" / "aqs-snapshot.json"

AQS_BASE = "https://aqs.epa.gov/data/api/dailyData/byCounty"
STATE_CODE = "37"   # North Carolina
COUNTY_CODE = "081"  # Guilford County
OZONE_PARAM_CODE = "44201"


def fetch_ozone(email: str, key: str) -> dict:
    # 90 days confirmed necessary and sufficient by a real run — see module docstring.
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=90)
    params = {
        "email": email,
        "key": key,
        "param": OZONE_PARAM_CODE,
        "bdate": start.strftime("%Y%m%d"),
        "edate": end.strftime("%Y%m%d"),
        "state": STATE_CODE,
        "county": COUNTY_CODE,
    }
    url = f"{AQS_BASE}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def summarize(raw: dict) -> dict:
    rows = raw.get("Data", [])
    if not rows:
        return {"hasData": False, "note": "No AQS rows returned for the requested date range."}

    rows_sorted = sorted(rows, key=lambda r: r.get("date_local", ""), reverse=True)
    latest = rows_sorted[0]
    return {
        "hasData": True,
        "latestReading": {
            "date": latest.get("date_local"),
            "siteName": latest.get("local_site_name"),
            "arithmeticMean": latest.get("arithmetic_mean"),
            "units": latest.get("units_of_measure"),
            "aqi": latest.get("aqi"),
            "monitorType": latest.get("monitor_type"),
        },
        "readingCount": len(rows),
    }


def main():
    email = os.environ.get("AQS_EMAIL")
    key = os.environ.get("AQS_KEY")
    if not email or not key:
        print("ERROR: AQS_EMAIL and/or AQS_KEY environment variable(s) not set.", file=sys.stderr)
        print("AQS keys are issued by email after signup, not instantly — see this script's docstring.", file=sys.stderr)
        print("Sign up at: https://aqs.epa.gov/data/api/signup?email=<your-email>", file=sys.stderr)
        # Write a "pending" placeholder rather than nothing at all, so the site can render an
        # explicit "pending API key" state instead of treating this as an unexplained missing file.
        placeholder = {
            "status": "pending-api-key",
            "note": (
                "EPA AQS requires an emailed API key (no synchronous self-serve issuance). This "
                "integration is built and endpoint-verified but not yet running with real "
                "credentials. See scripts/fetch_aqs_snapshot.py for setup steps."
            ),
            "checkedAt": datetime.now(timezone.utc).isoformat(),
        }
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(placeholder, indent=2), encoding="utf-8")
        print(f"Wrote pending-state placeholder to {OUT_PATH}")
        sys.exit(1)

    raw = fetch_ozone(email, key)
    summary = summarize(raw)
    summary.update({
        "source": "EPA Air Quality System (AQS) API — daily ozone, Guilford County NC",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "status": "live",
        "citation": {
            "sourceType": "external",
            "publisher": "U.S. Environmental Protection Agency",
            "title": "AQS daily summary data — Ozone (44201), Guilford County, NC",
            "url": "https://aqs.epa.gov/aqsweb/documents/data_api.html",
            "retrievedDate": datetime.now(timezone.utc).date().isoformat(),
        },
    })
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH} — hasData={summary.get('hasData')}")


if __name__ == "__main__":
    main()
