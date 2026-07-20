#!/usr/bin/env python3
"""
One-time fetch of Guilford County, NC census tract boundary polygons from the Census Bureau's
TIGERweb ArcGIS REST service, simplified and written to data/geo/guilford-tracts.json.

Kept as a ONE-TIME script (same convention as scripts/apply_2023_2024_merge.py) rather than a
recurring GitHub Action: tract boundaries only change on decennial redistricting, so there is
nothing to "refresh" on a schedule. Re-run manually only if the Census Bureau redraws tract lines.

VERIFIED END-TO-END: a real request to
  https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/4/query
(state=37 NC, county=081 Guilford) returned 126 real tract polygons in WGS84 (outSR=4326), no key
required, no pagination needed (under the service's transfer limit in one request).

Coordinates are simplified with a pure-Python Douglas-Peucker implementation (tolerance in decimal
degrees, ~0.0004° ≈ 35m at this latitude) to keep the committed file a reasonable size for a
client-side-rendered choropleth — full-resolution TIGERweb rings run 100-300+ points each across
126 tracts, which is unnecessary detail for a small inline map.

The tract join key is the last 6 digits of GEOID (e.g. GEOID "37081011400" -> tractFips "011400"),
matching the tractFips field already written by scripts/fetch_census_acs.py to
data/live/census-acs.json. This file is purely geometric — no poverty/income data is duplicated
here, so the two files can be regenerated independently.
"""

import json
import urllib.request
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT_PATH = ROOT / "data" / "geo" / "guilford-tracts.json"

TIGERWEB_BASE = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/4/query"
SIMPLIFY_TOLERANCE_DEG = 0.0004


def fetch_tracts() -> list:
    params = {
        "where": "STATE='37' AND COUNTY='081'",
        "outFields": "GEOID,BASENAME",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
        "resultRecordCount": "500",
    }
    url = f"{TIGERWEB_BASE}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if data.get("exceededTransferLimit"):
        raise RuntimeError("TIGERweb result exceeded transfer limit — pagination needed, script does not handle this yet")
    return data.get("features", [])


def perpendicular_distance(pt, line_start, line_end):
    x, y = pt
    x1, y1 = line_start
    x2, y2 = line_end
    if (x1, y1) == (x2, y2):
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    num = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1)
    den = ((y2 - y1) ** 2 + (x2 - x1) ** 2) ** 0.5
    return num / den


def douglas_peucker(points, tolerance):
    if len(points) < 3:
        return points
    dmax, index = 0.0, 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], points[0], points[-1])
        if d > dmax:
            dmax, index = d, i
    if dmax > tolerance:
        left = douglas_peucker(points[: index + 1], tolerance)
        right = douglas_peucker(points[index:], tolerance)
        return left[:-1] + right
    return [points[0], points[-1]]


def main():
    features = fetch_tracts()
    tracts = []
    all_lons, all_lats = [], []

    for f in features:
        attrs = f["attributes"]
        geoid = attrs.get("GEOID", "")
        tract_fips = geoid[-6:] if len(geoid) >= 6 else geoid
        rings = f.get("geometry", {}).get("rings", [])
        simplified_rings = []
        for ring in rings:
            pts = [(pt[0], pt[1]) for pt in ring]
            simplified = douglas_peucker(pts, SIMPLIFY_TOLERANCE_DEG)
            simplified_rings.append(simplified)
            all_lons.extend(p[0] for p in simplified)
            all_lats.extend(p[1] for p in simplified)
        tracts.append({
            "geoid": geoid,
            "tractFips": tract_fips,
            "basename": attrs.get("BASENAME"),
            "rings": simplified_rings,
        })

    out = {
        "source": "U.S. Census Bureau TIGERweb — Tracts_Blocks/MapServer/4, Guilford County NC (state 37, county 081)",
        "coordinateSystem": "WGS84 (EPSG:4326), lon/lat pairs",
        "simplification": f"Douglas-Peucker, tolerance {SIMPLIFY_TOLERANCE_DEG} decimal degrees (~35m)",
        "tractCount": len(tracts),
        "bbox": {"minLon": min(all_lons), "maxLon": max(all_lons), "minLat": min(all_lats), "maxLat": max(all_lats)},
        "tracts": tracts,
        "citation": {
            "sourceType": "external",
            "publisher": "U.S. Census Bureau",
            "title": "TIGERweb Census Tract boundaries, Guilford County, NC",
            "url": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/4",
            "retrievedDate": "2026-07-20",
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    orig_pts = sum(len(r) for f in features for r in f.get("geometry", {}).get("rings", []))
    simp_pts = sum(len(r["rings"][i]) for r in tracts for i in range(len(r["rings"])))
    print(f"Wrote {OUT_PATH} — {len(tracts)} tracts, {orig_pts} -> {simp_pts} points ({100*simp_pts//max(orig_pts,1)}%), size {OUT_PATH.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
