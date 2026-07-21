#!/usr/bin/env python3
"""Download the public Greensboro canopy assessment tables without resident-level data."""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "canopy-assessment.json"
PORTAL = "https://canopy.greensboro-nc.gov/pages/resources"
ARCGIS = "https://services1.arcgis.com/A7KFW0gHh8qBaXk3/arcgis/rest/services"

LAYERS = {
    "strata": f"{ARCGIS}/city_stratum_canopy_table/FeatureServer/97",
    "tractCanopy": f"{ARCGIS}/city_tracts_stratum_canopy_table/FeatureServer/96",
    "gridBenefits": f"{ARCGIS}/Canopy_Grid_Analysis/FeatureServer/224",
    "priorityTracts": f"{ARCGIS}/PriorityPlantingAreas_Dashboard20250408/FeatureServer/1",
    "priorityNeighborhoods": f"{ARCGIS}/PriorityPlantingAreas_Dashboard20250408/FeatureServer/2",
}


def get_json(url, params=None):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "SEP-Accountability/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        value = json.load(response)
    if "error" in value:
        raise RuntimeError(f"ArcGIS error for {url}: {value['error']}")
    return value


def query(url, fields="*", order_by=None):
    params = {"where": "1=1", "outFields": fields, "returnGeometry": "false", "f": "json", "resultRecordCount": 2000}
    if order_by:
        params["orderByFields"] = order_by
    return [row["attributes"] for row in get_json(url + "/query", params).get("features", [])]


def aggregate_benefits():
    fields = {
        "trees": "SUM_Trees",
        "canopyAcres": "SUM_Canopy_Acres",
        "annualBenefitsUsd": "SUM_Total_Annual_Benefits____yr",
        "energySavingsUsd": "SUM_Energy_Savings____yr_",
        "carbonStorageLb": "SUM_Carbon_Storage__lb_",
        "grossCarbonSequestrationUsd": "SUM_Gross_Carbon_Sequestration1",
        "avoidedRunoffCubicFtPerYear": "SUM_Avoided_Runoff__ft_3_yr_",
        "pollutionRemovalUsdPerYear": "SUM_Pollution_Removal____yr_",
    }
    stats = [{"statisticType": "sum", "onStatisticField": field, "outStatisticFieldName": name} for name, field in fields.items()]
    params = {"where": "1=1", "outStatistics": json.dumps(stats, separators=(",", ":")), "returnGeometry": "false", "f": "json"}
    rows = get_json(LAYERS["gridBenefits"] + "/query", params).get("features", [])
    return rows[0]["attributes"] if rows else {}


def main():
    strata = query(LAYERS["strata"], order_by="OBJECTID")
    total_area = sum(row.get("area_sq_m") or 0 for row in strata)
    total_canopy = sum(row.get("Total_Canopy") or 0 for row in strata)
    city_pct = 100 * total_canopy / total_area if total_area else None
    payload = {
        "$schema": "schemas/canopy-assessment.schema.json",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourcePeriod": {"historicImageryYear": 2012, "currentImageryYear": 2022},
        "summary": {
            **aggregate_benefits(),
            "canopyCoveragePct": city_pct,
            "canopyCoverageDisplayPct": round(city_pct) if city_pct is not None else None,
        },
        "strata": strata,
        "tractCanopy": query(LAYERS["tractCanopy"], order_by="TRACT_FIPS,Stratum"),
        "priorityTracts": query(LAYERS["priorityTracts"], order_by="GEOID"),
        "priorityNeighborhoods": query(LAYERS["priorityNeighborhoods"], order_by="NAME_1"),
        "sources": {
            "portal": PORTAL,
            "storyMap": "https://storymaps.arcgis.com/stories/25ef40eec89a4ba4aa57024ab49fc035",
            "changeDashboard": "https://greensboro.maps.arcgis.com/apps/dashboards/487abeea81614ecda1cbdd899aa469c4",
            "priorityDashboard": "https://greensboro.maps.arcgis.com/apps/dashboards/eab809e5c2f343da9c7e1657e327558a",
            "layers": LAYERS,
        },
        "methodologyNotes": [
            "Canopy change compares 2012 and 2022 NAIP aerial imagery; it is not an annual series.",
            "Tree counts and environmental benefits are modeled estimates, not a physical inventory or audited savings.",
            "Priority and vulnerability fields are contextual planning indicators; do not present them as an official CEJST designation without separate methodology verification.",
            "No resident names, street addresses, or exact residential coordinates are retained in this snapshot.",
        ],
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(payload['tractCanopy'])} tract/stratum rows, {len(payload['priorityTracts'])} priority tracts")


if __name__ == "__main__":
    main()
