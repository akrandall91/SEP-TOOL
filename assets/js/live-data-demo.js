/* SEP Tracker — live external data source demo (About page).
   Confirms, in the visitor's own browser, that the Esri Hub Search API endpoints documented on
   this page are genuinely live — not just claimed. Read-only, no API key needed for this endpoint. */

async function loadCanopyHubDemo() {
  const el = document.getElementById("canopy-hub-demo");
  if (!el) return;
  try {
    const res = await fetch("https://canopy.greensboro-nc.gov/api/search/v1/collections/all/items");
    const data = await res.json();
    const items = (data.features || []).map((f) => f.properties?.title || f.properties?.name || f.id).filter(Boolean);
    el.innerHTML = `<span style="color:var(--status-good);font-weight:700;">✓ Live — ${data.numberMatched ?? items.length} items found just now.</span> ${items.length ? "Sample: " + items.slice(0, 5).join(", ") : ""}`;
  } catch (e) {
    el.innerHTML = `<span style="color:var(--status-critical);">✗ Fetch failed right now: ${e.message}</span>`;
  }
}

document.addEventListener("DOMContentLoaded", loadCanopyHubDemo);
