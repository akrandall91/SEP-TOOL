/* SEP Tracker — shared loader for data/live/*.json snapshot files (Phase 5 integrations).
   These are NOT baked at build time like data/*.json — they're regenerated on a schedule by
   GitHub Actions (see .github/workflows/refresh-*.yml) and committed as plain static files, so a
   client-side fetch() always gets whatever the last successful Action run produced. Degrades
   gracefully to null on any failure (missing file, network error, bad JSON) — callers must handle
   null rather than assuming data is present, same resilience standard as pvwatts-widget.js. */

async function loadLiveData(filename, base) {
  try {
    const res = await fetch(`${base}data/live/${filename}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}
