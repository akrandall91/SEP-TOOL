#!/usr/bin/env python3
"""
One-time (re-runnable) generator for department page skeletons.

Creates departments/<id>.html for every entry in data/departments.json that doesn't
already have a page, using the generic assets/js/department-page.js renderer. Existing
pages are left untouched (this only fills in gaps) — re-run safely after adding a new
department to departments.json.

After running this, run build.py to inline the header/footer/data into the new pages.
"""

import json
from pathlib import Path

ROOT = Path(__file__).parent
DEPARTMENTS_DIR = ROOT / "departments"

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title} — SEP Accountability</title>
<meta name="description" content="{description}" />
<link rel="stylesheet" href="../assets/css/tokens.css" />
<link rel="stylesheet" href="../assets/css/site.css" />
</head>
<body>
<!-- BUILD:HEADER --><!-- /BUILD:HEADER -->

<main class="page">
  <p style="font-size:var(--font-size-sm);margin-bottom:var(--space-4);"><a href="../index.html">← Departments</a></p>

  <header class="dept-header" id="dept-header">
    <!-- injected by department-page.js -->
  </header>
  <div class="plain-summary"><span class="plain-summary__label">In plain terms</span><p>{plain_summary}</p></div>

  <section class="card chart-card" style="margin-bottom:var(--space-5);" id="chart-section">
    <div class="section-title">Trend: actual vs. resolution target</div>
    <div id="trend-chart-mount"></div>
    <div class="chart-legend" id="chart-legend"></div>
    <div class="chart-annotation-box" id="chart-annotation"></div>
  </section>

  <section id="goals-section-wrap">
    <div class="section-title">{goals_section_title}</div>
    <div id="goals-section"></div>
  </section>
</main>

<!-- BUILD:FOOTER --><!-- /BUILD:FOOTER -->

<!-- BUILD:DATA files="departments.json,baseline-2019.json,funding.json" --><!-- /BUILD:DATA -->
<script>window.DEPT_ID = "{dept_id}";</script>
<script src="../assets/js/citation.js"></script>
<script src="../assets/js/components.js"></script>
<script src="../assets/js/trend-chart.js"></script>
<script src="../assets/js/department-page.js"></script>
</body>
</html>
"""


def main():
    data = json.loads((ROOT / "data" / "departments.json").read_text(encoding="utf-8"))
    created, skipped = [], []

    for dept in data["departments"]:
        dept_id = dept["id"]
        out_path = DEPARTMENTS_DIR / f"{dept_id}.html"
        if out_path.exists():
            skipped.append(dept_id)
            continue

        is_wsl = dept.get("externalOnly")
        goals_section_title = "Assets" if is_wsl else "Goals, Strategies & Actions"
        description = (
            f"{dept['name']} — a City-related renewable energy asset independently verified but "
            "absent from either Strategic Energy Plan source document."
            if is_wsl
            else f"Independent tracking of {dept['name']}'s Strategic Energy Plan goals: "
            "2025 reporting status and funding linkage."
        )
        # Plain-language reader summary — same generic, energy-source/goal-count pattern used for
        # every existing department page (see the batch insert this was originally applied with).
        # Departments with no ordinary "goals" list (external-only assets, or a city-wide program
        # with no single energy source) get a short hand-adjusted fallback instead of a number.
        energy_label = {
            "electricity": "electricity", "naturalGas": "natural gas",
            "gasoline": "gasoline", "diesel": "diesel",
        }
        if is_wsl:
            plain_summary = (
                f"This page covers {dept['name']}, a City-related energy asset that isn't "
                "credited to any single department in the City's own reports."
            )
        elif not dept.get("energySource") or dept["energySource"] not in energy_label:
            plain_summary = f"This page tracks {dept['name']}'s Strategic Energy Plan commitments."
        else:
            n = len(dept.get("goals", []))
            plural = "goal" if n == 1 else "goals"
            label = energy_label[dept["energySource"]]
            plain_summary = (
                f"This page tracks {n} energy {plural} for {dept['name']} — how it uses "
                f"{label} and what it's doing to use less of it."
            )

        html = TEMPLATE.format(
            title=dept["name"],
            description=description.replace('"', "&quot;"),
            goals_section_title=goals_section_title,
            plain_summary=plain_summary,
            dept_id=dept_id,
        )
        out_path.write_text(html, encoding="utf-8")
        created.append(dept_id)

    print(f"Created {len(created)} page(s): {', '.join(created) if created else '(none)'}")
    print(f"Skipped {len(skipped)} existing page(s): {', '.join(skipped) if skipped else '(none)'}")


if __name__ == "__main__":
    main()
