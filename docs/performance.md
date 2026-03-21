# Performance Notes

Reviewed after first production deployment (2026-03-10). Primary symptom: noticeable load delay when switching admin boundary levels, especially to RegSO/DeSO.

---

## What we have today

### Client-side session cache (`datasets/cache.ts`)
Three in-memory Maps (results, hierarchy, time series) with in-flight deduplication — if the same key is requested twice concurrently, both callers share one Promise. Generation tokens in `useDatasetFetch` prevent stale responses from landing. Solid foundation.

### Background preloading
When a dataset result arrives, the adjacent admin levels (±1) are preloaded in the background. Helps when navigating step by step but doesn't cover direct jumps (e.g. Län → DeSO).

### Map tile caching
Vector tiles are served via GeoServer GWC (`/geoserver/gwc/service/wmts`), so server-side tile caching is active. OpenLayers caches tiles in memory for the session.

### Vite asset hashing
All JS/CSS filenames include a content hash. Long-term browser caching is structurally possible — just not yet configured in Caddy.

---

## What's missing / where time is being lost

### 1. Slow level switches (the main pain point)
SCB v2beta calls for DeSO (~5 600 areas) and RegSO (~3 600 areas) are large and SCB's API is the bottleneck. The current preload only covers ±1 level, so jumping levels always waits on a live fetch. The session cache helps on the second switch but is wiped on every page reload.

**Options:**
- **Aggressive preload** — when a dataset is first selected, fire off requests for all levels in the background immediately, not just ±1 after data arrives. Low risk, small change.
- **Persist cache to IndexedDB** — survive page reloads; fetches from two minutes ago don't cost anything on refresh. Medium effort. Use a TTL (e.g. 24 h) since SCB data is annual.
- **Both** — aggressive preload fills the cache fast on first visit; IndexedDB persistence makes subsequent visits free.

### 2. No HTTP cache headers on backend responses
The FastAPI backend returns `state_expenses`, `revenue`, and `election-geodata` JSON with no `Cache-Control` headers. Caddy doesn't add any either. Every page load re-fetches these files from disk regardless of whether they've changed.

The `election-geodata` files and ESV JSON are static between deployments — they should get long-lived cache headers.

**Fix:** Add a `header` directive in Caddyfile for `/api/expenses/*`, `/api/revenue/*`, `/api/election-geodata/*`, `/api/geo-labels/*`:
```
Cache-Control: public, max-age=86400, stale-while-revalidate=3600
```

### 3. Backend reads JSON from disk on every request
`state_expenses_api.py` opens and parses the 1.8 MB expenses file on every call. Same for revenue and election geodata. Module-level in-memory caching would eliminate this entirely.

### 4. No long-term caching for frontend assets
Vite hashes asset filenames so they're immutable, but Caddy isn't configured to tell browsers to cache them. Every visit re-validates JS/CSS bundles.

**Fix:** Add to Caddyfile:
```
@assets path /assets/*
header @assets Cache-Control "public, max-age=31536000, immutable"
```
`index.html` should remain `Cache-Control: no-cache`.

### 5. No route-based code splitting
OpenLayers (~600 KB gzipped) and D3 (~250 KB) are in the initial bundle, loaded even on the landing page. Lazy-loading route components (`React.lazy` + `Suspense`) would significantly reduce the initial parse/execute cost.

### 6. RTK Query cache duration
Default `keepUnusedDataFor` is 60 seconds. Population stats are annual data — no reason to re-fetch after a minute. Set to at least 1 hour in `BaseApi.ts`.

---

## Todo list

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Aggressive all-levels preload on dataset selection | Small | High — eliminates wait on level switch |
| 2 | Persist dataset cache to IndexedDB (with TTL) | Medium | High — subsequent visits are instant |
| 3 | Caddy cache headers for hashed `/assets/*` | Trivial | Medium — faster repeat visits |
| 4 | Caddy/backend cache headers for static API routes | Small | Medium — avoids redundant re-fetches |
| 5 | Backend in-memory JSON cache (module-level) | Small | Medium — removes per-request disk I/O |
| 6 | Route-based code splitting (lazy route imports) | Medium | High — smaller initial bundle |
| 7 | RTK Query `keepUnusedDataFor` increase | Trivial | Low |
| 8 | Migrate KPI from SCB v1 proxy to v2beta direct | Small | Low (simplification, not perf) |

Items 3–5 and 7 are pure housekeeping with no risk — good candidates for a single tidy-up pass.
Items 1 and 2 directly address the reported symptom and should be prioritised.
Item 6 (code splitting) is the biggest win for cold initial load.
Item 8 is a cleanup todo unrelated to performance.

---

## What is NOT the problem

- The backend proxy for SCB — only KPI still uses it, and it adds negligible latency (~50–100 ms). All map datasets (population, medianinkomst, medelålder, elections at region/municipality level, val DeSO/RegSO) call SCB v2beta directly from the browser.
- GeoServer tile loading — GWC is active, tiles are cached server-side.
