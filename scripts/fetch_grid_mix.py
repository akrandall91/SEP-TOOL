#!/usr/bin/env python3
"""
Fetches Duke Energy Carolinas' current generation fuel mix from the EIA API and writes it to
data/live/grid-mix.json — a static file the site reads client-side like any other data/*.json,
so no API key ever ships to the browser.

Requires an EIA_API_KEY environment variable (a free key from https://www.eia.gov/opendata/register.php).
Run manually with:  EIA_API_KEY=xxx python scripts/fetch_grid_mix.py
Run automatically by .github/workflows/refresh-grid-mix.yml on a schedule.

NOT independently verified end-to-end in this session: this environment has no EIA_API_KEY and
sandboxed network access returned only a 403 (consistent with "route exists, key required," but
not a confirmed success response). The route/params below follow EIA's documented v2 API structure
(electricity/rto/fuel-type-data, respondent=DUK for Duke Energy Carolinas) — verify the first live
run's output shape against https://www.eia.gov/opendata/browser/electricity/rto/fuel-type-data
before trusting this blindly in production.
"""

import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT_PATH = ROOT / "data" / "live" / "grid-mix.json"

EIA_BASE = "https://api.eia.gov/v2/electricity/rto/fuel-type-data/data/"
RESPONDENT = "DUK"  # Duke Energy Carolinas balancing authority code


def fetch_grid_mix(api_key: str) -> dict:
    params = {
        "frequency": "hourly",
        "data[0]": "value",
        "facets[respondent][]": RESPONDENT,
        "sort[0][column]": "period",
        "sort[0][direction]": "desc",
        "length": "24",  # most recent 24 hourly readings across fuel types
        "api_key": api_key,
    }
    url = f"{EIA_BASE}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def summarize(raw: dict) -> dict:
    rows = raw.get("response", {}).get("data", [])
    by_fuel = {}
    latest_period = None
    for row in rows:
        fuel = row.get("fueltype") or row.get("type-name") or "unknown"
        val = row.get("value")
        period = row.get("period")
        if latest_period is None or (period and period > latest_period):
            latest_period = period
        if val is None:
            continue
        by_fuel.setdefault(fuel, []).append(float(val))

    mix = {fuel: round(sum(vals) / len(vals), 1) for fuel, vals in by_fuel.items() if vals}
    total = sum(mix.values()) or 1
    pct_mix = {fuel: round(100 * v / total, 1) for fuel, v in mix.items()}

    return {
        "source": "EIA API v2 — electricity/rto/fuel-type-data",
        "respondent": RESPONDENT,
        "respondentLabel": "Duke Energy Carolinas",
        "latestPeriod": latest_period,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "avgMwByFuelType": mix,
        "pctMixByFuelType": pct_mix,
        "comparisonNote": "2019 SEP baseline (Table/Figure 3, sep2022 p.20): 39% natural gas/fuel oil, 37% nuclear, 22% coal, 2% hydro/renewable. Compare pctMixByFuelType above against that baseline to see whether the grid's emissions factor is improving or worsening since the SEP was written.",
        "citation": {
            "sourceType": "external",
            "publisher": "U.S. Energy Information Administration",
            "title": "Hourly fuel-type data for Duke Energy Carolinas (DUK)",
            "url": "https://www.eia.gov/opendata/browser/electricity/rto/fuel-type-data",
            "retrievedDate": datetime.now(timezone.utc).date().isoformat(),
        },
    }


def main():
    api_key = os.environ.get("EIA_API_KEY")
    if not api_key:
        print("ERROR: EIA_API_KEY environment variable not set.", file=sys.stderr)
        print("Register a free key at https://www.eia.gov/opendata/register.php", file=sys.stderr)
        sys.exit(1)

    raw = fetch_grid_mix(api_key)
    summary = summarize(raw)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH} — latest period {summary['latestPeriod']}")


if __name__ == "__main__":
    main()
