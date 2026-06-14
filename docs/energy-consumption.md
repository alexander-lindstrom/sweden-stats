# Energy Consumption — TAB3654

Research notes on adding energy consumption data alongside the existing electricity production dataset (TAB3451 / `elproduktion.ts`).

---

## Data source

**Table:** TAB3654 — "Slutanvändning (MWh), efter län och kommun, förbrukarkategori samt bränsletyp"
**Source:** Energimyndigheten (Swedish Energy Agency) via SCB
**API endpoints:**
- Data: `https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB3654/data?outputFormat=json-stat2`
- Metadata: `https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB3654/metadata`

---

## Coverage

| Aspect | TAB3654 (consumption) | TAB3451 (production) |
|---|---|---|
| Geographic levels | Riket, Län (21), Kommun (290) | Riket, Län (21), Kommun (290) |
| Time range | 2009–2024 | 2009–2024 |
| Unit | MWh | MWh |
| Source agency | Energimyndigheten | Energimyndigheten |

The two tables are structurally near-identical, making consumption a natural companion to the existing production dataset.

---

## Dimensions

### Förbrukarkategori (consumer category)

| Code | Label |
|---|---|
| | Jordbruk, skogsbruk, fiske |
| | Industri, byggverksamhet |
| | Offentlig verksamhet |
| | Transporter |
| | Övriga tjänster |
| | Småhus |
| | Flerbostadshus |
| | Fritidshus |
| | Totalt |

### Bränsletyp (fuel / energy type)

| Code | Label |
|---|---|
| | Flytande (ej förnybart) |
| | Fast (ej förnybart) |
| | Gas (ej förnybart) |
| | Flytande (förnybart) |
| | Fast (förnybart) |
| | Gas (förnybart) |
| | Fjärrvärme |
| | El |
| | Totalt |

Exact SCB variable codes need to be read from the metadata endpoint before implementation.

---

## Implementation notes

- Model on `datasets/scb/elproduktion.ts` — same `category: 'energi'`, same supported levels (`Country`, `Region`, `Municipality`).
- Country-level donut by consumer category (analogous to production-type donut).
- A second donut angle by fuel type is possible but optional.
- Time series: national consumption by consumer category or fuel type over 2009–2024.
- Region/municipality scalar map: total consumption in GWh.
- ~43k cells per year (312 regions × 9 categories × 9 fuel types) — well within SCB cell limits, no batching needed.
- Production vs. consumption comparison (ratio or side-by-side) could be a future feature.
