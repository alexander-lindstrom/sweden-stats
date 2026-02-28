# Roadmap

Ideas and planned work for the Sweden Data Explorer. Not a strict backlog — more a living document for thinking through direction.

---

## Vision

Make the map the most compelling way to explore Swedish public data. The differentiator is **spatial-first exploration at DeSO/RegSO granularity** — a level of detail that SCB's own tools and most other Swedish stats sites don't surface well. Every interaction should reward curiosity and reveal something non-obvious.

---

## Near-term

### Selected area panel
When a feature is clicked, slide out a panel showing a summary for that area across multiple datasets — not just one metric, but a snapshot of the place.

What to show:
- Key stats (population, median income, employment rate) with a visual indicator of how they compare to the national average
- Trend sparkline for 2–3 metrics (lean on the existing year data)
- Internal spread: if a region/municipality is selected, show the distribution across its sub-areas (e.g. this municipality's DeSOs range from X to Y on income) — surfaces within-area inequality

This makes every click feel rewarding and creates a narrative around place.

### DeSO-level income and demographics
SCB has DeSO-level data for disposable income, country of birth/foreign background, age distribution, housing tenure, and employment rate. Loading this unlocks the most genuinely interesting story in the dataset: two DeSOs a kilometer apart in a Swedish city can look completely different. Hard to find visualized elsewhere.

---

## Medium-term

### Comparison mode
Select two areas, see them side by side across all loaded datasets. UX: click one area, shift-click another, panel splits. Simple interaction, high payoff.

### Bivariate choropleth
Encode two variables simultaneously in a single 2D color scale (e.g. income × foreign-born %). Visually striking and tells the segregation story in one view. More complex to implement and to explain to users, but a genuinely novel presentation.

### Population change animation
Lean harder into the year slider — show which areas are growing or shrinking over time. The map becomes a time machine. Most interesting at municipality level where rural depopulation and suburban growth are clearly visible.

---

## Data sources to explore

| Source | What's interesting | Level |
|---|---|---|
| SCB — income/demographics | Disposable income, foreign background %, age | DeSO |
| SCB — housing | Tenure type, housing stock | DeSO/Kommun |
| Skolverket | School merit points, pass rates | Kommun |
| Valmyndigheten | Election results by party | Kommun |
| Folkhälsomyndigheten | Public health indicators | Region/Kommun |
| Kolada | 1000+ municipal KPIs, easy API | Kommun |

Election results are politically sensitive but produce some of the most spatially interesting patterns, especially combined with income/demographics.

Kolada is worth a look — it aggregates many official sources into one clean API and covers things that would otherwise require separate integrations.

---

## Ideas parking lot

- **"Find areas like this"** — given a selected area, surface the N most similar areas nationally (by statistical profile). Useful and unusual.
- **Ranking view** — sortable list of all municipalities/regions on a chosen metric, linked to the map (hover list item → highlight on map)
- **Percentile bands** — instead of raw choropleth values, show which quintile each area falls into, making cross-metric comparison more intuitive
- **Mobile** — the map works on mobile but the UI isn't optimized for it
