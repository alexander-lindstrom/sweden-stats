# Roadmap

Ideas and planned work for the Sweden Data Explorer. Not a strict backlog — more a living document for thinking through direction.

---

## Vision

Make the map the most compelling way to explore Swedish public data. The differentiator is **spatial-first exploration at DeSO/RegSO granularity** — a level of detail that SCB's own tools and most other Swedish stats sites don't surface well. Every interaction should reward curiosity and reveal something non-obvious.

---

## Near-term

### DeSO-level income and demographics

SCB has DeSO-level data for disposable income, country of birth/foreign background, age distribution, housing tenure, and employment rate. Loading this unlocks the most genuinely interesting story in the dataset: two DeSOs a kilometer apart in a Swedish city can look completely different. Hard to find visualized elsewhere.

---

## Medium-term

### Comparison mode

Select two areas, see them side by side across all loaded datasets. UX: click one area, shift-click another, SelectionPanel splits into two columns showing the same metrics for both with a delta row. The map highlights both areas in distinct colours (e.g. blue + orange). Charts (diverging, ranked bar) can mark both features. Main risk is panel crowding — the two-column layout needs to stay compact. Builds directly on the existing SelectionPanel infrastructure.

### Bivariate choropleth

Encode two variables simultaneously in a single 2D color scale (e.g. income × foreign-born %). Visually striking and tells the segregation story in one view — most compelling at DeSO level. Implementation: quantize each variable into 3 bins → 9-cell 3×3 palette (Joshua Stevens-style); each area gets a color from the grid; legend is a small labeled 3×3 square. The scatter plot's Y-axis dataset picker is already ~80% of the secondary dataset selection UX. Main new work: 2D color assignment on the map, 2D legend component, handling the "active dataset" concept when there are two. Worth doing — genuinely hard to find elsewhere for Swedish data.

### Population change animation

Lean harder into the year slider — show which areas are growing or shrinking over time. The map becomes a time machine. Most interesting at municipality level where rural depopulation and suburban growth are clearly visible.

---

## Data sources to explore

| Source                    | What's interesting                           | Level               |
| ------------------------- | -------------------------------------------- | ------------------- |
| SCB — income/demographics | Disposable income, foreign background %, age | DeSO                |
| SCB — housing             | Tenure type, housing stock                   | DeSO/Kommun         |
| Skolverket                | School merit points, pass rates              | Kommun              |
| Valmyndigheten            | Election results by party                    | Kommun/DeSO/RegSO ✓ |
| Folkhälsomyndigheten      | Public health indicators                     | Region/Kommun       |
| Kolada                    | 1000+ municipal KPIs, easy API               | Kommun              |

Election results are politically sensitive but produce some of the most spatially interesting patterns, especially combined with income/demographics.

Kolada is worth a look — it aggregates many official sources into one clean API and covers things that would otherwise require separate integrations.

### Municipal equalization (utjämningsbidrag)

Show what municipalities actually receive or pay net through the Swedish kommunal utjämning system, then surface why the formula doesn't fully reflect structural fiscal reality. The interesting story: some municipalities in the north receive large transfers but host state-owned enterprises (e.g. LKAB in Gällivare/Kiruna) whose taxes flow to the state rather than the municipality; government agencies are heavily concentrated around Stockholm, artificially inflating the tax base there.

**Suggested approach:**
1. Start with raw Kolada equalization data — net transfer per capita is a clean, comparable metric across all municipalities. Explore the Kolada API first to confirm what's available (indicators: kommunalekonomisk utjämning, LSS-utjämning, skatteunderlag, net transfer per capita).
2. Get the raw data on the map as a first dataset.
3. The contextual weighting (LKAB tax flows, government employment geography) would need to be assembled from multiple sources (SCB enterprise data, ESV employment data) and is genuinely original analysis — better treated as annotations or a secondary overlay rather than baked into the metric.

---

## Known limitations and future work

### SelectionPanel: show deviation from mean alongside rank

The right-hand panel currently shows rank (#5/21) and a percentile bar. It should also show **deviation from the peer mean** — e.g. "+8.3 pp" or "−12 tkr" — so the user immediately understands not just where an area ranks but how different it is from typical. This is especially meaningful for income, foreign background %, and employment rate where the absolute gap matters. Implementation: extend `toStat` to compute `deviation = value − mean`, then display it in `StatRow` alongside the existing rank.



### RegSO/DeSO historical data (SCB vintage code problem)

SCB's fine-grained area codes carry a **vintage suffix** reflecting boundary revisions. The 2025 revision introduced `_RegSO2025` and `_DeSO2025` codes across tables like TAB6574, TAB6679, TAB6693, and TAB6680. These new codes exist in the metadata and claim coverage back to 2010–2020, but the actual data cells are `null` for all years except 2024. SCB's documented policy: _"Previous years are not updated to the new division."_

Consequence: the population sparkline is hidden at RegSO/DeSO level, and the year slider is disabled there, because fetching any year other than 2024 returns an empty dataset and breaks the choropleth.

**Implementing historical RegSO/DeSO data (the messy way)**

The historical data exists under the _old_ vintage codes (`_RegSO2020`, `_DeSO2018`) in older SCB tables (e.g. TAB5722 Demografivariabler 2007–2023). The challenge is that the boundary geometries changed between vintages, so codes don't map 1-to-1.

The path forward:

1. **Build a correspondence table** using the GeoPackage files (`DeSO_2018.gpkg`, `RegSO_2020.gpkg`) and the current 2025-boundary GeoPackages. Compute geometric intersection areas to produce a weighted mapping: `old_code → [(new_code, weight), ...]` where weight = intersection area / old area.
2. **Run a Python preprocessing step** that fetches historical data under old codes, applies the correspondence weights to reproject values onto 2025-vintage codes, and writes the result to a static JSON file (keyed by `level/year`).
3. **Serve the static files** from the backend (or bundle as assets) and load them in place of live SCB API calls for historical years at RegSO/DeSO level.

This is high-effort, low-generalisation work. Worth doing only if the time-series story at DeSO level becomes a core feature of the explorer.

---

## Election data — what's in place

Election results for riksdagsval, regionval, and kommunval (2022) are available at Country, Region, Municipality, RegSO, and DeSO levels.

- **Country/Region/Municipality**: fetched live from SCB v2beta (TAB2706/2697/2685), covering all elections years back to 1998.
- **RegSO/DeSO**: area-weighted spatial interpolation from Valmyndigheten valdistrikt boundaries and vote counts onto DeSO/RegSO polygons. Processed offline (`processing/process_election_geodata.py`), served as static JSON from the backend. Currently 2022 only.
- Local parties that reach ≥0.5% share in any area keep their own identity; below that they fold into Övriga.

## Election data — known gaps and future work

### Övriga breakdown

At the municipality level, local parties sometimes form the largest single block inside "Övriga". Currently Övriga is pre-aggregated (we request only the 9 main party codes from SCB and they fold the rest). To surface the largest sub-party:

1. Fetch all party codes from table metadata instead of the fixed 9.
2. Client-side: bucket the 8 known parties normally; sum the rest into Övriga while tracking the per-geo leader.
3. Extend `ElectionDatasetResult` with `ovrigaLeader?: Record<string, { label: string; share: number }>`.
4. Show it in the winner column of `ElectionTable` and the `ElectionDonut` when Övriga wins.

### Multi-year DeSO/RegSO election data

The interpolation pipeline is designed to support multiple years. Adding 2018 (and earlier) requires the same Valmyndigheten source files. Once added, re-running `process_election_geodata.py` produces the additional JSONs; the frontend year slider unlocks automatically (the lock is boundary-driven, not hard-coded to 2022).

The multiline chart is intentionally absent at DeSO/RegSO for now — it becomes meaningful once more than one year of interpolated data exists.

### Election results at valdistrikt granularity

Valmyndigheten publishes boundaries and results at the valdistrikt (polling district) level — higher spatial resolution than DeSO in dense urban areas. Integrating this would require a GeoServer layer for valdistrikt boundaries. Worth revisiting if the DeSO-level patterns prove compelling.

---

## Ideas parking lot

- **"Find areas like this"** — given a selected area, surface the N most similar areas nationally (by statistical profile). Useful and unusual.
- **Percentile bands** — instead of raw choropleth values, show which quintile each area falls into, making cross-metric comparison more intuitive
- **Mobile** — the map works on mobile but the UI isn't optimized for it
