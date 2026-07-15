#!/usr/bin/env python3
"""
Fetches GTA's (Greensboro Transit Authority) static GTFS feed and its three GTFS-Realtime feeds,
and writes a summary to data/live/gtfs-snapshot.json.

VERIFIED END-TO-END in this session (not just route/params review): a real run of this exact logic
against https://trackmygta.com/gtfs and https://trackmygta.com/gtfs-rt/vehiclepositions returned a
1.19MB static feed and 18 live vehicle positions, 5 of them on CrossMax Purple (route_id 6349,
short_name "CMP") at the time of the test. No API key or CORS header is present on trackmygta.com
(publisher: GMV Syncromatics, per Transitland), so this runs server-side via a GitHub Action rather
than a client-side fetch, per this site's established architecture (see refresh-grid-mix.yml).

What this CAN verify against the 2024 Progress Report's CrossMax Purple claims:
  - "15-minute service": computed from the static schedule's own departure times — a real, derived
    headway distribution, not a single number confirmed or refuted. See `weekdayHeadwayMinutes`.
  - How many CrossMax Purple vehicles are actively reporting positions right now.
What this CANNOT verify: ridership ("10,000 riders/week"). GTFS/GTFS-RT carry schedule and vehicle
position data only — no ridership/boarding counts exist in either feed. That claim remains a
static-report-only figure; this script does not manufacture a ridership number to compare against it.

Run manually with:  python scripts/fetch_gtfs_snapshot.py
Run automatically by .github/workflows/refresh-gtfs.yml on a schedule.
"""

import csv
import io
import json
import statistics
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT_PATH = ROOT / "data" / "live" / "gtfs-snapshot.json"

GTFS_STATIC_URL = "https://trackmygta.com/gtfs"
GTFS_RT_VEHICLE_POSITIONS_URL = "https://trackmygta.com/gtfs-rt/vehiclepositions"
GTFS_RT_TRIP_UPDATES_URL = "https://trackmygta.com/gtfs-rt/tripupdates"
GTFS_RT_ALERTS_URL = "https://trackmygta.com/gtfs-rt/alerts"

TARGET_ROUTE_SHORT_NAME = "CMP"  # CrossMax Purple, route_id 6349 as of this writing


def fetch_bytes(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={"Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def to_minutes(hms: str) -> int:
    h, m, _s = hms.split(":")
    return int(h) * 60 + int(m)


def compute_weekday_headway(zf: zipfile.ZipFile, target_short_name: str) -> dict:
    routes = list(csv.DictReader(io.TextIOWrapper(zf.open("routes.txt"), encoding="utf-8")))
    route_row = next((r for r in routes if r["route_short_name"] == target_short_name), None)
    if not route_row:
        return {"error": f"route with short_name={target_short_name!r} not found in routes.txt"}
    route_id = route_row["route_id"]

    calendar = list(csv.DictReader(io.TextIOWrapper(zf.open("calendar.txt"), encoding="utf-8")))
    # pick the service_id that runs Mon-Fri (a normal weekday pattern), preferring the most
    # weekday-only-looking calendar row over a run-every-day one, to avoid diluting with Sat/Sun trips
    weekday_services = [
        c["service_id"] for c in calendar
        if c["monday"] == "1" and c["tuesday"] == "1" and c["wednesday"] == "1"
        and c["thursday"] == "1" and c["friday"] == "1"
    ]
    weekday_only = [
        c["service_id"] for c in calendar
        if c["service_id"] in weekday_services and c["saturday"] == "0" and c["sunday"] == "0"
    ]
    service_id = weekday_only[0] if weekday_only else (weekday_services[0] if weekday_services else None)
    if not service_id:
        return {"error": "no weekday service_id found in calendar.txt"}

    trips = list(csv.DictReader(io.TextIOWrapper(zf.open("trips.txt"), encoding="utf-8")))
    target_trip_ids = {
        t["trip_id"] for t in trips
        if t["route_id"] == route_id and t["service_id"] == service_id and t["direction_id"] == "0"
    }
    if not target_trip_ids:
        return {"error": "no direction_id=0 weekday trips found for this route"}

    first_stop_seq = {}
    first_departure = {}
    with zf.open("stop_times.txt") as raw:
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8"))
        for row in reader:
            tid = row["trip_id"]
            if tid not in target_trip_ids:
                continue
            seq = int(row["stop_sequence"])
            if tid not in first_stop_seq or seq < first_stop_seq[tid]:
                first_stop_seq[tid] = seq
                first_departure[tid] = row["departure_time"]

    times = sorted(to_minutes(t) for t in first_departure.values())
    gaps = [times[i + 1] - times[i] for i in range(len(times) - 1)]

    return {
        "routeId": route_id,
        "serviceId": service_id,
        "tripCountOneDirectionOneWeekday": len(times),
        "firstDeparture": f"{times[0] // 60:02d}:{times[0] % 60:02d}",
        "lastDeparture": f"{times[-1] // 60:02d}:{times[-1] % 60:02d}",
        "headwayMinutes": {
            "mean": round(statistics.mean(gaps), 1) if gaps else None,
            "median": statistics.median(gaps) if gaps else None,
            "min": min(gaps) if gaps else None,
            "max": max(gaps) if gaps else None,
            "distribution": dict(sorted(Counter(gaps).items())),
        },
    }


def compute_live_vehicle_counts(zf: zipfile.ZipFile, target_short_name: str) -> dict:
    from google.transit import gtfs_realtime_pb2

    trips = list(csv.DictReader(io.TextIOWrapper(zf.open("trips.txt"), encoding="utf-8")))
    routes = list(csv.DictReader(io.TextIOWrapper(zf.open("routes.txt"), encoding="utf-8")))
    trip_to_route = {t["trip_id"]: t["route_id"] for t in trips}
    route_short_names = {r["route_id"]: r["route_short_name"] for r in routes}

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(fetch_bytes(GTFS_RT_VEHICLE_POSITIONS_URL))

    counts = defaultdict(int)
    for entity in feed.entity:
        if entity.HasField("vehicle"):
            trip_id = entity.vehicle.trip.trip_id
            route_id = entity.vehicle.trip.route_id or trip_to_route.get(trip_id, "")
            short_name = route_short_names.get(route_id, route_id or "unknown")
            counts[short_name] += 1

    alerts_feed = gtfs_realtime_pb2.FeedMessage()
    alerts_feed.ParseFromString(fetch_bytes(GTFS_RT_ALERTS_URL))

    return {
        "feedTimestampUtc": datetime.fromtimestamp(feed.header.timestamp, tz=timezone.utc).isoformat() if feed.header.timestamp else None,
        "totalActiveVehicles": sum(counts.values()),
        "activeVehiclesByRoute": dict(counts),
        "activeVehiclesOnTargetRoute": counts.get(target_short_name, 0),
        "activeServiceAlerts": len(alerts_feed.entity),
    }


def main():
    try:
        static_bytes = fetch_bytes(GTFS_STATIC_URL)
    except Exception as e:
        print(f"ERROR: could not fetch static GTFS feed: {e}", file=sys.stderr)
        sys.exit(1)

    zf = zipfile.ZipFile(io.BytesIO(static_bytes))

    try:
        headway = compute_weekday_headway(zf, TARGET_ROUTE_SHORT_NAME)
    except Exception as e:
        headway = {"error": f"headway computation failed: {e}"}

    try:
        live = compute_live_vehicle_counts(zf, TARGET_ROUTE_SHORT_NAME)
    except Exception as e:
        live = {"error": f"live vehicle-position fetch failed: {e}"}

    summary = {
        "source": "GTA (Greensboro Transit Authority) GTFS + GTFS-Realtime, via trackmygta.com (GMV Syncromatics)",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "targetRoute": {"shortName": TARGET_ROUTE_SHORT_NAME, "longName": "CrossMax Purple"},
        "weekdayHeadway": headway,
        "liveVehiclePositions": live,
        "comparisonNote": (
            "The 2024 Progress Report describes CrossMax Purple as '10,000 riders/week, 15-minute "
            "service.' GTFS/GTFS-RT carry schedule and live-vehicle data only — no ridership "
            "figures exist in either feed, so the 10,000-riders/week claim cannot be checked here and "
            "is not restated as verified. The 15-minute-service claim is checked against the static "
            "schedule's own weekday departure times — see weekdayHeadway.headwayMinutes for the "
            "actual computed mean/median/distribution, which may show a non-uniform pattern rather "
            "than a flat 15-minute clock-face headway."
        ),
        "citation": {
            "sourceType": "external",
            "publisher": "Greensboro Transit Authority / GMV Syncromatics",
            "title": "GTA GTFS static feed and GTFS-Realtime vehicle positions/alerts feeds",
            "url": "https://trackmygta.com/gtfs",
            "retrievedDate": datetime.now(timezone.utc).date().isoformat(),
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  CrossMax Purple weekday headway: mean={headway.get('headwayMinutes', {}).get('mean')} min, median={headway.get('headwayMinutes', {}).get('median')} min")
    print(f"  CrossMax Purple vehicles active right now: {live.get('activeVehiclesOnTargetRoute')}")


if __name__ == "__main__":
    main()
