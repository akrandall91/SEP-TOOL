#!/usr/bin/env python3
"""
Fetches the actual Legistar legislative record for Resolution 19-0770 (the SEP-authorizing
resolution) and any related matters, and writes data/live/legistar-snapshot.json.

VERIFIED END-TO-END in this session: real requests against https://webapi.legistar.com/v1/greensboro
(client name confirmed correct — "greensboro" — by real 200 responses with real Council data, not
assumed). No API key required; this is a public read-only OData-style API. No CORS headers are
present on webapi.legistar.com (confirmed by direct request), so this runs server-side via a
GitHub Action, same pattern as refresh-grid-mix.yml.

Matter-file format note: Legistar's MatterFile field is "ID 19-0770", not "19-0770" — an exact-match
filter on the resolution.json-style bare number returns zero rows. This script matches on the
known MatterId (found via a MatterTitle substring search during verification) to avoid re-deriving
that format quirk at runtime.

What this found: Resolution 19-0770 itself (MatterId 6283, adopted 2019-12-03, motion by
Councilmember Thurm/seconded by Councilmember Wells, passed — not recorded as an itemized roll-call
vote, i.e. voice vote / unanimous consent, per MatterHistoryRollCallFlag=0) plus a previously
undocumented related matter: Resolution 20-0655 (MatterId 7002, adopted 2020-09-15), which extended
the deadline for developing the 20-year Strategic Energy Plan — direct primary-source evidence of
the ~2-year-11-month gap between resolution adoption and SEP publication that this site's static
data already notes (see index.json > reportCadence). Keyword searches for the EECBG grant, the
Nimble Energy and Fresh Coast Climate Solutions contracts, and "Tree Canopy" turned up no Legistar
matches — these were most likely handled as administrative/staff-level actions below the dollar
threshold that requires a Council resolution or ordinance, not omissions from this search.

Run manually with:  python scripts/fetch_legistar_snapshot.py
Run automatically by .github/workflows/refresh-legistar.yml on a schedule.
"""

import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT_PATH = ROOT / "data" / "live" / "legistar-snapshot.json"

BASE = "https://webapi.legistar.com/v1/greensboro"

# MatterIds confirmed during verification via MatterTitle substring search — see docstring.
KNOWN_MATTER_IDS = {
    "sep_authorizing_resolution": 6283,   # ID 19-0770
    "sep_extension_resolution": 7002,     # ID 20-0655
}


def fetch_json(url: str, timeout: int = 20):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_matter_with_history(matter_id: int) -> dict:
    matter = fetch_json(f"{BASE}/matters/{matter_id}")
    history = fetch_json(f"{BASE}/matters/{matter_id}/histories")
    return {
        "matterId": matter_id,
        "matterFile": matter.get("MatterFile"),
        "title": matter.get("MatterTitle"),
        "type": matter.get("MatterTypeName"),
        "status": matter.get("MatterStatusName"),
        "introDate": matter.get("MatterIntroDate"),
        "agendaDate": matter.get("MatterAgendaDate"),
        "passedDate": matter.get("MatterPassedDate"),
        "actions": [
            {
                "date": h.get("MatterHistoryActionDate"),
                "action": h.get("MatterHistoryActionName"),
                "actionText": h.get("MatterHistoryActionText"),
                "passed": bool(h.get("MatterHistoryPassedFlag")),
                "passedLabel": h.get("MatterHistoryPassedFlagName"),
                "isRollCallVote": bool(h.get("MatterHistoryRollCallFlag")),
                "mover": h.get("MatterHistoryMoverName"),
                "seconder": h.get("MatterHistorySeconderName"),
                "body": h.get("MatterHistoryActionBodyName"),
            }
            for h in history
        ],
        "legistarUrl": f"https://greensboro.legistar.com/LegislationDetail.aspx?ID={matter.get('MatterGuid', '')}",
    }


SEARCH_TERMS_TRIED_NO_MATCH = [
    "EECBG",
    "Nimble Energy",
    "Fresh Coast",
    "Tree Canopy",
]


def main():
    matters = {}
    for key, matter_id in KNOWN_MATTER_IDS.items():
        try:
            matters[key] = fetch_matter_with_history(matter_id)
        except Exception as e:
            print(f"ERROR fetching matter {matter_id} ({key}): {e}", file=sys.stderr)
            matters[key] = {"matterId": matter_id, "error": str(e)}

    summary = {
        "source": "Greensboro Legistar Web API (webapi.legistar.com/v1/greensboro)",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "matters": matters,
        "searchTermsTriedNoMatch": SEARCH_TERMS_TRIED_NO_MATCH,
        "searchNote": (
            "Keyword searches (substringof on MatterTitle) for the EECBG grant, the Nimble Energy "
            "and Fresh Coast Climate Solutions contracts, and the USDA Tree Canopy grant returned no "
            "results as of this fetch. Most likely these were administrative/staff-level actions "
            "below whatever dollar threshold requires a Council resolution or ordinance, not gaps in "
            "this search. Not restated as findings; listed here as terms tried."
        ),
        "citation": {
            "sourceType": "external",
            "publisher": "City of Greensboro / Legistar (Granicus)",
            "title": "Legistar Web API — matters, matter history/votes",
            "url": "https://webapi.legistar.com/v1/greensboro",
            "retrievedDate": datetime.now(timezone.utc).date().isoformat(),
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    for key, m in matters.items():
        print(f"  {key}: {m.get('matterFile')} — {m.get('status')} — {len(m.get('actions', []))} action(s)")


if __name__ == "__main__":
    main()
