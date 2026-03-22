# Education Datasets — Roadmap

Ideas for integrating Swedish education statistics, with a focus on the gender dimension. Data sources are primarily SCB (v2beta API) and UHR.

---

## 1. Educational attainment choropleth (map)

**What:** Percentage of the population with post-secondary / university education, shown as a choropleth on the map.

**Granularity:** Municipality level now; RegSO if SCB exposes it via v2beta.

**Gender angle:** Toggle or split between men / women / gap (diverging scale). The geographic + gender variation is striking — some DeSO-level areas have 60%+ women with university degrees vs 30% men.

**Data source:** SCB, "Befolkningens utbildningsnivå" (table series UF0506 / UF0525).

**Implementation:** Slots directly into the existing scalar dataset pattern — a new dataset descriptor in `datasets/scb/`. No new chart components needed. The gender toggle would either be a selector that switches between three descriptor variants, or a new first-class filter concept analogous to `activeParty` in elections.

**Priority:** High — low implementation effort, immediate map value, reuses existing infrastructure.

---

## 2. Gymnasiebetyg gender gap (time series)

**What:** Average gymnasie grade (meritvärde) over time, broken down by gender. Girls have consistently outperformed boys and the gap has widened over time.

**Granularity:** National + regional (county / municipality).

**Gender angle:** Two lines on a `MultiLineChart` — one per gender. Could optionally break down by municipality to show where the gap is largest (ranked bar view).

**Data source:** SCB TAB5311 — "Betygspoäng för elever på gymnasieskolan med slutbetyg", 2013/14–2023/24.

**Implementation:** Done. Uses `fetchTimeSeries`, returns two `TimeSeriesNode`s (Pojkar / Flickor). `timeSeriesUnit: 'poäng'` drives the y-axis label and tooltip in `MultiLineChart`.

**Regional limitation:** No county/municipality breakdown exists in SCB v2beta for actual grade points with gender. TAB6425 has region + gender but measures *continuation to higher education* (not the grades themselves) — a different question, potentially a future separate dataset.

**Priority:** Done.

---

## 3. University program choice by gender (categorical breakdown)

**What:** Distribution of enrolled students across program areas (engineering, medicine, education, humanities, social sciences, etc.) split by gender. The segregation is extreme and visually striking.

**Granularity:** National (possibly regional).

**Gender angle:** A 100% stacked bar chart — one row per field, showing the share of men vs women. Similar structure to `PartyShareBarChart`. This would also be a natural trigger for the pending refactor of `PartyShareBarChart` to accept generic `categories[]` rather than hardcoded party codes.

**Data source:** SCB, högskolans studenter efter utbildningsområde och kön.

**Implementation:** Refactor `PartyShareBarChart` → generic categorical chart, supply education program categories. Could live as a standalone national-level view or inside the profile tab.

**Priority:** Medium-high — most visually compelling gender story; doubles as the pending component generalization.

---

## 4. Högskoleprovet results (score distribution)

**What:** Score distributions and pass rates on the SweSAT (högskoleprovet) by gender. Boys tend to score relatively better on this test than on school grades — the reversal from the gymnasiebetyg trend is the interesting angle.

**Granularity:** National (possibly county if UHR publishes it).

**Gender angle:** Overlaid histograms or diverging bar chart showing score distribution by gender.

**Data source:** UHR (Universitets- och högskolerådet), not SCB. Data availability and structure needs investigation — UHR publishes PDF reports and some structured downloads; an API is not guaranteed.

**Implementation:** Histogram component already exists. Main risk is data sourcing — check if UHR has machine-readable data before committing to this. If structured data is available, this could be a static pre-processed JSON served by the backend (same pattern as ESV expenses).

**Priority:** Lower — data sourcing uncertain. Investigate before building.

---

## Implementation order suggestion

| # | Item | Effort | Data confidence |
|---|------|--------|-----------------|
| 1 | Educational attainment choropleth | Small | High (SCB v2beta) |
| 3 | University program choice by gender | Medium | High (SCB v2beta) |
| 2 | Gymnasiebetyg gender gap | Medium | High (SCB v2beta) |
| 4 | Högskoleprovet distributions | Medium | Low (UHR, verify first) |

Start with 1 (map value, existing pattern), then 3 (best visual payoff + pending refactor), then 2 and 4.
