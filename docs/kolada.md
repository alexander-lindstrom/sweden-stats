# Kolada Integration

Research and planning notes for integrating Kolada KPI data into the explorer.

---

## What is Kolada

[Kolada](https://www.kolada.se) is the Swedish government's open database of municipal and regional KPIs, operated by RKA (Rådet för främjande av kommunala analyser). It covers ~4,500 indicators across ~290 municipalities and ~20 regions, with 20+ years of history for most series.

**API:** v3 (released April 2025) at `api.kolada.se/v3`
- CORS-enabled — can call directly from the browser, no backend proxy needed
- No authentication required
- Interactive docs: `https://api.kolada.se/v3/docs`

---

## API structure

### Data query

```
GET /v3/data/kpi/{kpiId}/municipality/all/year/{year}
```

Returns all ~290 municipalities in a single request. Comma-separate IDs for bulk queries:

```
/v3/data/kpi/N03005,N17099/municipality/all/year/2023
```

### Response shape

```json
{
  "values": [{
    "kpi": "N03005",
    "municipality": "0180",
    "period": "2023",
    "values": [
      { "gender": "T", "value": 32.8, "status": "ok" },
      { "gender": "K", "value": 32.8, "status": "ok" },
      { "gender": "F", "value": 32.8, "status": "ok" }
    ]
  }],
  "count": 290,
  "next_page": null
}
```

- `gender`: `T` = total, `K` = male, `F` = female
- `value`: float or `null` when data is unavailable
- Municipality codes are **exact SCB 4-digit codes** — no remapping needed

### Metadata

```
GET /v3/kpi/{kpiId}          — KPI description, unit, available years
GET /v3/municipality          — full municipality list with codes
GET /v3/kpi?per_page=100      — paginated KPI catalog
```

### Geographic coverage

| Level | Available |
|---|---|
| Municipality (kommun) | Yes — all ~290 |
| Region (landsting/län) | Yes — ~20, but **different codes** from SCB's 2-digit county codes |
| RegSO / DeSO | No |

For region-level Kolada data, the region codes need to be looked up via `/v3/municipality` (they are not the same as SCB's 2-digit county prefixes). For the initial integration, staying at Municipality level avoids this entirely.

---

## Starter indicators (5)

These were chosen to cross-reference directly with existing SCB datasets, so each one adds an interpretive layer rather than standing alone.

### 1. Kommunalskatt — municipal tax rate (%)

Cross-reference with: `medianinkomst`

"This municipality has median income 380 tkr and charges 33.2% in local tax." The pairing is immediate and analytically meaningful. Tax rate is one of the most consequential municipal decisions; exploring it spatially reveals the policy choices that diverge from economic conditions.

### 2. Grundskola meritvärde åk 9 — year-9 school merit points

Cross-reference with: `gymnasiebetyg`, `utbildningsniva`, `hogskolestudenter`

Merit points are the *input* to the education pipeline. With this dataset, you can trace the full arc: merit points → gymnasium grades → university participation → adult education level. Also pairs with `utlandsk_bakgrund` to show nuanced integration outcome differences across municipalities.

### 3. Valdeltagande kommunalvalet — municipal election turnout (%)

Cross-reference with: election datasets (`kommunval`)

The election descriptors already show *how* people voted. Turnout shows *whether* they voted. Displaying both as choropleths side by side — civic engagement vs. party preference — tells a completely different story using the same codes and years.

### 4. Försörjningsstöd per invånare — social welfare dependency rate (%)

Cross-reference with: `medianinkomst`, `utlandsk_bakgrund`

The project has income data but no economic vulnerability indicator. High median income in a municipality can coexist with significant welfare dependency. Both are needed for an honest picture.

### 5. Nettokostnad äldreomsorg per invånare 80+ — elder care cost per elderly resident (kr)

Cross-reference with: `medelalder`

Rural municipalities with older-skewing populations face a structural fiscal squeeze: high elder care costs per capita against a shrinking tax base. With `medelalder` and this indicator on screen together, that story is visible without any annotation.

---

## Implementation plan

### Phase 1 — five hand-coded descriptors (now)

Each indicator becomes a standard `DatasetDescriptor`. Write a shared helper:

```typescript
// datasets/kolada/api.ts
async function fetchKoladaMunicipality(
  kpiId: string,
  year: number,
): Promise<Record<string, number>> {
  const url = `https://api.kolada.se/v3/data/kpi/${kpiId}/municipality/all/year/${year}`;
  const res = await fetch(url);
  const json: KoladaResponse = await res.json();
  const values: Record<string, number> = {};
  for (const entry of json.values) {
    const total = entry.values.find(v => v.gender === 'T');
    if (total?.value != null) values[entry.municipality] = total.value;
  }
  return values;
}
```

Each descriptor's `fetch` calls this helper with its own KPI ID and maps the result to `ScalarDatasetResult`. Gender breakdown (`K`/`F`) can be threaded through later for indicators where it matters (e.g. merit points, employment).

### Phase 2 — descriptor factory

Once 5 descriptors exist, the pattern is clear enough to extract:

```typescript
makeKoladaDescriptor({
  id: 'kommunalskatt',
  kpiId: 'N03005',
  label: 'Kommunalskatt',
  unit: '%',
  availableYears: [...],
})
```

Kolada's `/v3/kpi/{id}` metadata endpoint can supply `availableYears` programmatically so descriptors don't need hardcoded year ranges.

### Phase 3 — user-browsable Kolada catalog

The `/v3/kpi` endpoint returns all KPIs with titles, categories, and year ranges. This can power an "Add a Kolada indicator" panel: user browses or searches the catalog, picks an indicator, and the descriptor is built on the fly. No code change per indicator. This is where 4,500 KPIs become accessible without pre-work.

### Phase 4 — substrate for "Find areas like this"

With dozens of Kolada KPIs normalised per municipality, you have the multi-dimensional vector needed for meaningful similarity computation. Euclidean (or cosine) distance across that vector space surfaces genuine structural similarity — not just "similar income" but similar school outcomes, tax burden, demographic pressure, and welfare dependency simultaneously. Kolada's breadth is what makes that feature non-trivial to replicate elsewhere.

### Phase 5 — cross-source scatter plots

Kolada KPIs × SCB series as scatter plot axes: tax rate vs. median income, school merit vs. university participation, elder care cost vs. average age. The kind of analysis Swedish municipal researchers do in Excel today.

---

## Attribution

Per Kolada's terms of use, visualizations must include: **"Källa: Kolada"** (or "Source: Kolada" in English contexts).
