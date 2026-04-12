# Next Steps — Taking the Project to the Next Level

Assessment and recommendations based on a full review of the codebase (April 2025).

---

## Current strengths

The project is in strong shape for an exploratory phase. The dataset descriptor system is well-designed and extensible. The caching strategy (memory + IDB + in-flight dedup + preload) is sophisticated. The map interaction model — selection, comparison, drill-down, hover with sub-boundary preview — is polished. 15 datasets across SCB and ESV, with election geodata spatial interpolation at DeSO/RegSO, is substantial. TypeScript strict mode with zero lint warnings is a clean foundation.

The main risks are all about the gap between "works great for one person exploring" and "something you'd share with others and build on confidently."

---

## Medium-impact, strategic

### 7. Kolada integration

Kolada has 1,000+ municipal KPIs with a clean REST API — school results, healthcare wait times, elder care costs, tax rates. Biggest dataset expansion available with the least integration friction (clean JSON, municipal codes match existing geometry).

**Approach:** Start with 3-5 Kolada indicators that tell an interesting story alongside existing SCB data (e.g. tax rate alongside median income; school merit points alongside education level). Each becomes a new `DatasetDescriptor` with a `fetch` that calls the Kolada API directly.

### 8. "Find areas like this"

The most unique feature idea in the roadmap — and the one most likely to make someone share the tool. Given a selected area, compute a similarity score across available datasets (normalize, Euclidean distance or cosine similarity) and highlight the top N matches on the map.

"I live in X, where else in Sweden looks like X?" — cross-dataset synthesis that no existing Swedish stats tool offers.

### 9. Testing foundation

The dataset fetch + transform pipeline is the highest-value thing to test: well-typed inputs (SCB JSON-stat2) and well-typed outputs (`ScalarDatasetResult`, `ElectionDatasetResult`). Vitest is zero-config with Vite.

Doesn't need to be comprehensive. 20-30 tests covering data transform logic catches the most painful class of bugs (wrong aggregation, mismatched codes, off-by-one in year indexing).

---

## Longer-term directions

### 10. Population change animation

The year slider + choropleth is the foundation — animating through years to show rural depopulation and suburban growth would be visually compelling and shareable (especially as GIF/video export). URL-state (#1) is a prerequisite so people can link to specific time ranges.

### 11. Gender dimension as a cross-cutting filter

Extending datasets (income, education, employment) to accept a gender filter — "show men / show women / show gap" — would add a powerful analytical dimension without new data sources. SCB tables often have the gender breakdown already; it's just not being requested.

### 12. Comparison mode polish

Shift-click comparison exists but is subtle. Making it discoverable (a "Compare" button in the selection panel, side-by-side profile cards, delta values) would make the analytical capability more accessible.

---

## Suggested priority order

1. **URL-driven state** — unlocks shareability, foundation everything else builds on
2. **CI quality gates** — 15 min of work, prevents silent breakage forever
3. **Pre-selected default dataset** — immediate first-impression improvement
4. **Code splitting** — bundle is 2x recommended size
5. **Caddy cache headers** — one-line config, meaningful perf win
6. **MapPage decomposition** — reduces friction for everything that follows
7. **Kolada integration** — biggest dataset expansion per unit of effort
8. **Testing foundation** — Vitest + fixture tests for data transforms
9. **"Find areas like this"** — the differentiating feature

Items 1-5 are independent and can be done in any order or in parallel. Items 6-9 are where the project transitions from "impressive side project" to "the best way to explore Swedish public data."
