#!/usr/bin/env python3
"""
SEP Tracker static build step.

Pages are GENERATED between BUILD:HEADER / BUILD:FOOTER marker comments — do not
hand-edit the header/footer markup inside those markers in individual page files.
Edit partials/header.html and partials/footer.html (the source of truth), then
re-run this script:

    python build.py

Why this exists: the shell (header/footer/nav) used to be loaded at runtime via
fetch('partials/header.html'). Browsers block fetch() to local files when a page
is opened via file:// (double-clicking the HTML file, no server) — which is
exactly how someone cloning this repo would first open it. This script inlines
the shell at build time instead, so every generated page is fully self-contained
and works with no server at all. Data fetches for page CONTENT (departments.json,
funding.json, etc., loaded by pages like departments/water-resources.html) are a
separate, currently-unfixed instance of the same file:// restriction — see the
"KNOWN LIMITATION" note at the bottom of this file.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
PARTIALS = ROOT / "partials"

# path (relative to ROOT), nav id (must match a data-nav-id in partials/header.html)
PAGES = [
    ("index.html", "dashboard"),
    ("about.html", "about"),
    ("recommendations.html", "recommendations"),
    ("funding.html", "funding"),
    ("timeline.html", "timeline"),
    ("departments/water-resources.html", "departments"),
]

HEADER_MARKER = re.compile(r'<!-- BUILD:HEADER.*?-->.*?<!-- /BUILD:HEADER -->', re.DOTALL)
FOOTER_MARKER = re.compile(r'<!-- BUILD:FOOTER.*?-->.*?<!-- /BUILD:FOOTER -->', re.DOTALL)


def base_for(page_path: str) -> str:
    depth = page_path.count("/")
    return "../" * depth if depth else "./"


def render_header(template: str, base: str, active_nav_id: str) -> str:
    html = template

    def repl_href(m):
        target = m.group(1)
        return f'href="{base}{target}"'

    html = re.sub(r'data-nav-href="([^"]+)"', repl_href, html)

    # mark the active nav item (data-nav-id survives the href substitution above)
    def repl_active(m):
        tag = m.group(0)
        if f'data-nav-id="{active_nav_id}"' in tag:
            return tag[:-1] + ' aria-current="page">' if tag.endswith(">") else tag
        return tag

    # simplest robust approach: insert aria-current right after the matching data-nav-id attr
    html = re.sub(
        rf'(data-nav-id="{re.escape(active_nav_id)}")',
        r'\1 aria-current="page"',
        html,
    )
    return html


def render_footer(template: str, base: str, updated_date: str) -> str:
    html = template
    html = re.sub(r'href="(data/[^"]+)"', lambda m: f'href="{base}{m.group(1)}"', html)
    html = html.replace(
        'Loading last-updated date…',
        f'Data last extracted/updated: {updated_date}',
    )
    return html


def build():
    header_tpl = (PARTIALS / "header.html").read_text(encoding="utf-8")
    footer_tpl = (PARTIALS / "footer.html").read_text(encoding="utf-8")
    index_data = json.loads((ROOT / "data" / "index.json").read_text(encoding="utf-8"))
    updated_date = index_data["generatedAt"]

    for page_path, nav_id in PAGES:
        full_path = ROOT / page_path
        if not full_path.exists():
            print(f"  SKIP (not found): {page_path}")
            continue
        base = base_for(page_path)
        src = full_path.read_text(encoding="utf-8")

        rendered_header = render_header(header_tpl, base, nav_id)
        rendered_footer = render_footer(footer_tpl, base, updated_date)

        header_block = f"<!-- BUILD:HEADER nav=\"{nav_id}\" -->\n{rendered_header}\n<!-- /BUILD:HEADER -->"
        footer_block = f"<!-- BUILD:FOOTER -->\n{rendered_footer}\n<!-- /BUILD:FOOTER -->"

        if HEADER_MARKER.search(src):
            src = HEADER_MARKER.sub(lambda m: header_block, src, count=1)
        else:
            print(f"  WARNING: no BUILD:HEADER marker found in {page_path} — run migrate_to_markers.py first")
            continue

        if FOOTER_MARKER.search(src):
            src = FOOTER_MARKER.sub(lambda m: footer_block, src, count=1)
        else:
            print(f"  WARNING: no BUILD:FOOTER marker found in {page_path} — run migrate_to_markers.py first")
            continue

        full_path.write_text(src, encoding="utf-8")
        print(f"  built: {page_path}  (base={base}, nav={nav_id})")


if __name__ == "__main__":
    print("SEP Tracker — building shell into pages from partials/header.html + partials/footer.html")
    build()
    print("Done. Header/footer are now inlined — no runtime fetch, works over file://.")
    print()
    print("KNOWN LIMITATION (not fixed by this script): department pages still fetch their")
    print("CONTENT data (departments.json, funding.json, baseline-2019.json) at runtime via")
    print("fetch(). That has the identical file:// restriction as the old shell include did —")
    print("opening departments/water-resources.html via file:// will render the shell fine now,")
    print("but the chart/goals/citations body will fail with the same 'Failed to fetch' pattern.")
    print("Fixing that would mean baking the JSON data into the page (or a bundled <script> data")
    print("blob) at build time too — out of scope for this pass; flagging per instructions.")
