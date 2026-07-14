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
and works with no server at all.

As of this revision, page CONTENT data (departments.json, funding.json, etc.) gets
the same treatment via BUILD:DATA markers: the listed data/*.json files are baked
into the page as inline <script type="application/json" id="baked-*"> blocks. The
page's own JS (see assets/js/department-water-resources.js's loadJson()) reads the
baked copy first and only falls back to a live fetch() if no baked block exists —
so the page is fully self-contained when built, but still degrades gracefully to
fetch() if someone edits data/*.json without re-running this script.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
PARTIALS = ROOT / "partials"
DATA_DIR = ROOT / "data"

# path (relative to ROOT), nav id (must match a data-nav-id in partials/header.html)
STATIC_PAGES = [
    ("index.html", "dashboard"),
    ("about.html", "about"),
    ("recommendations.html", "recommendations"),
    ("funding.html", "funding"),
    ("timeline.html", "timeline"),
]


def discover_department_pages():
    """Every departments/*.html gets nav id 'departments' — auto-discovered so adding a
    new department page (via generate_departments.py) doesn't require editing this list."""
    dept_dir = ROOT / "departments"
    if not dept_dir.exists():
        return []
    return [(f"departments/{p.name}", "departments") for p in sorted(dept_dir.glob("*.html"))]


PAGES = STATIC_PAGES + discover_department_pages()

HEADER_MARKER = re.compile(r'<!-- BUILD:HEADER.*?-->.*?<!-- /BUILD:HEADER -->', re.DOTALL)
FOOTER_MARKER = re.compile(r'<!-- BUILD:FOOTER.*?-->.*?<!-- /BUILD:FOOTER -->', re.DOTALL)
DATA_MARKER = re.compile(r'<!-- BUILD:DATA(.*?)-->.*?<!-- /BUILD:DATA -->', re.DOTALL)
DATA_FILES_ATTR = re.compile(r'files="([^"]*)"')


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


def render_data_block(file_list_csv: str) -> str:
    filenames = [f.strip() for f in file_list_csv.split(",") if f.strip()]
    blocks = []
    for filename in filenames:
        data_path = DATA_DIR / filename
        if not data_path.exists():
            print(f"    WARNING: BUILD:DATA references missing file data/{filename} — skipped")
            continue
        raw = data_path.read_text(encoding="utf-8")
        # re-serialize through json.load/dump to guarantee valid embedded JSON
        # (also collapses whitespace, keeping baked pages leaner than a raw copy)
        parsed = json.loads(raw)
        compact = json.dumps(parsed, separators=(",", ":"))
        # </script> can never legally appear inside valid JSON string content unescaped this way,
        # but guard anyway since this is untrusted-ish city-document text passing through.
        compact = compact.replace("</script", "<\\/script")
        script_id = "baked-" + filename.replace(".json", "")
        blocks.append(f'<script type="application/json" id="{script_id}">{compact}</script>')
    return "\n".join(blocks)


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

        data_marker_match = DATA_MARKER.search(src)
        if data_marker_match:
            files_attr_match = DATA_FILES_ATTR.search(data_marker_match.group(1))
            files_csv = files_attr_match.group(1) if files_attr_match else ""
            rendered_data = render_data_block(files_csv)
            data_block = f'<!-- BUILD:DATA files="{files_csv}" -->\n{rendered_data}\n<!-- /BUILD:DATA -->'
            src = DATA_MARKER.sub(lambda m: data_block, src, count=1)
            baked_count = files_csv.count(",") + 1 if files_csv else 0
        else:
            baked_count = 0

        full_path.write_text(src, encoding="utf-8")
        suffix = f", {baked_count} data file(s) baked" if baked_count else ""
        print(f"  built: {page_path}  (base={base}, nav={nav_id}{suffix})")


if __name__ == "__main__":
    print("SEP Tracker — building shell + data into pages from partials/ and data/")
    build()
    print("Done. Header/footer/data are now inlined for pages with BUILD:DATA markers —")
    print("no runtime fetch required, works over file:// with no server.")
    print()
    print("Pages without a BUILD:DATA marker (the current placeholder pages — recommendations.html,")
    print("funding.html, timeline.html — and the homepage once it aggregates data) still have no")
    print("baked data because they don't fetch any yet. Add a BUILD:DATA marker to any page once it")
    print("starts loading data/*.json, same pattern as departments/water-resources.html.")
