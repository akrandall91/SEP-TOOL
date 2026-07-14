# SEP Tracker

Independent, cited tracker for the City of Greensboro's Strategic Energy Plan. Not an official
City of Greensboro product — see [about.html](about.html).

## Running locally

Any static file server works, e.g.:

```
python -m http.server 8842
```

Then open `http://localhost:8842/index.html`.

You can also open `index.html` directly by double-clicking it (`file://`, no server) — the
shell (header/nav/footer) is pre-generated into every page, so it works either way. Only the
department pages' data-driven content (chart, goals, citations) still requires a server; see
**Known limitation** below.

## ⚠ Generated files — don't hand-edit the header/footer

The `<header>`/`<footer>` markup inside every page's `<!-- BUILD:HEADER --> ... <!-- /BUILD:HEADER -->`
and `<!-- BUILD:FOOTER --> ... <!-- /BUILD:FOOTER -->` comment blocks is **generated** —
edits inside those markers get overwritten the next time the build runs. Edit
`partials/header.html` / `partials/footer.html` instead (the source of truth), then:

```
python build.py
```

Everything *outside* the marker blocks in each page is normal hand-edited page content and is
left untouched by the build script.

## Known limitation: department pages still require a server

`build.py` fixed the header/footer include (previously loaded via `fetch()` at runtime, which
browsers block under `file://`). Department pages like `departments/water-resources.html` have
a **second, currently-unfixed instance of the same problem**: they fetch their actual content
(`data/departments.json`, `data/funding.json`, `data/baseline-2019.json`) at runtime via
`fetch()`. That still requires a server — opening a department page via `file://` will show the
header/footer correctly now, but the chart/goals/citations body will fail to load. Fixing this
would mean baking the JSON data into each page (or a bundled `<script>` data blob) at build time
too. Not yet done — flagged here rather than left as a silent second gap.

## Data

Everything under `data/*.json` is directly linked from every page's footer and is the full,
independently-re-derivable source of every figure on the site. Start with
[data/index.json](data/index.json) and [data/SCHEMA.md](data/SCHEMA.md).
