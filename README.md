# SEP Accountability Dashboard

Independent, cited accountability dashboard for Greensboro's Strategic Energy Plan. It is not
an official City product. The interface distinguishes City commitments, City-reported progress,
external verification, derived analysis, contradictions, and missing information.

## Repository and authoritative data

- `data/departments.json`: authoritative 21-goal department dataset and annual status history.
- `data/index.json`: central source index and generated date.
- `data/funding.json`: funding records with internal/external provenance.
- `data/funding-linkage.json`: goal-level funding/reporting cross-tab.
- `data/SCHEMA.md`: complete field dictionary and evidence rules.
- `partials/`: authoritative shared header and footer.
- `build.py`: deterministic shell/data baker for static and `file://` use.
- `assets/js/accountability.js`: explorer, matrix, source drawer, theme, and downloads.

The public information architecture is Overview, Goal Explorer, Reporting Matrix, Funding,
Equity Map, Sources, Methodology, and Changes. Existing department, recommendation, chart, and
timeline views remain available.

## Build, validation, and tests

After editing a partial or authoritative JSON file:

```text
python build.py
python scripts/validate_data.py
```

Validation checks unique goal IDs, allowed history years/statuses, citation references, funding
link coverage, and equivalence between every baked block and source JSON. The machine-readable
core schema is `data/schemas/departments.schema.json`.

## Preview and deployment

Core pages and department pages work when opened directly through `file://` after running the
build. For a realistic local preview:

```text
python -m http.server 8842
```

Open `http://localhost:8842/index.html`. Deployment is static: publish the repository contents
after running the build and validation commands. No application server or framework is required.

## Status and citation definitions

“Reported” means a goal-specific update appears in that annual report. “Not reported” does not
mean inactive. “Went silent” means a goal appeared in both 2023 and 2024 reporting and then had
no goal-specific 2025 update. Funding is linked only when published evidence supports a
defensible goal-level connection. See `methodology.html` and `data/SCHEMA.md` for citation tiers,
external-verification rules, contradiction handling, and all other definitions.

## Known limitations

No reliable coordinates connect goal-level projects to Census tracts, so the equity view does
not invent project markers. Address geocoding is omitted to preserve offline use. Some funding
may exist without a defensible published link. Live-refresh utilities require network access,
but a failed refresh never replaces the last valid baked snapshot.
