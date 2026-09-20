# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision

A sleek, interactive data explorer for Sweden. Users browse official public datasets (SCB, ESV, and other government sources) mapped to Swedish administrative boundaries at five levels: country, region (län), municipality (kommun), RegSO, and DeSO.

The core UX goal is frictionless navigation: switch datasets, switch boundary levels, see the data update — without losing your place or fighting the interface. Design should be clean and purposeful, letting the data speak rather than the chrome. The map is the primary shell; admin boundaries are the lens through which datasets are explored.

The project is currently in a learning/exploratory phase (OpenLayers, GeoServer, React patterns). New work should push toward this vision.

## Project Overview

Rikskartan (repo: sweden-stats, live at datamedmera.se) — interactive visualizations of public Swedish data (SCB, Kolada, ESV) using a React frontend and a FastAPI backend. Use the name "Rikskartan" in UI copy and docs.

## Development Commands

### Frontend (`frontend/`)
```bash
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Type-check + Vite build
npm run lint      # ESLint
npm run preview   # Preview production build
```
Node >=22 required. Both `npm` and `pnpm` lock files exist; either works.

### Backend (`backend/`)
```bash
bash start.sh     # uvicorn main:app --reload --port 3001
```
Requires Python with `fastapi`, `uvicorn`, `httpx` installed.

### Data Processing (`processing/`)
```bash
python parse_esv_utgifter.py   # Parse ESV expenses CSV → expenses_by_year.json
python parse_esv_inkomster.py  # Parse ESV revenue CSV
```
Output JSON files are copied to `data/economy/` for the backend to serve.

### Map Tiles
Vector tile layers (Region, Municipality, RegSO, DeSO) are served by a local GeoServer instance at `http://localhost:8080`.

## Architecture

### Service Ports
| Service | Port |
|---|---|
| Frontend (Vite) | 5173 |
| Backend (FastAPI) | 3001 |
| GeoServer (vector tiles) | 8080 |

### Frontend Structure

**Routing** (`frontend/src/App.tsx`):
- `/` → redirects to `/map`
- `/map` → `MapPage` — the whole app: sidebar, map / chart / table / profile views, selection panel. State is mirrored to the URL (`hooks/useUrlState.ts`).
- `/test` → `PopulationDataViewer` — dev scratch view on the RTK Query stack, not linked from the UI.

**Data layer** (`frontend/src/datasets/`): one descriptor per dataset (`registry.ts` lists them, `types.ts` defines `DatasetDescriptor`). A descriptor declares supported levels, views and chart types and fetches its own data — SCB v2beta and Kolada directly from the browser, ESV via the FastAPI backend. Results are cached in memory and IndexedDB (`datasets/cache.ts`). The RTK Query slice in `api/` only serves `/test`.

Path alias `@/` resolves to `frontend/src/`.

**State management**: React state in `MapPage`, split across hooks — `useNavigationState` (level, selection, drill stack), `useDatasetState` (dataset, year, party), `useViewState` (view, chart type, bivariate/scatter), `useDatasetFetch` (data + colour scale). Redux only backs the `/test` route.

**Charts** (`frontend/src/components/visualizations/`): D3 charts — ranked bar, histogram, diverging, box plot, scatter, multi-line time series, sunburst + bar (state expenses), share bar, donut, population pyramid. Shared colour tokens in `chartTokens.ts`, frame helper in `chartFrame.ts`.

**Map** (`frontend/src/components/map/`): OpenLayers map with switchable base layers (Esri tiles) and Swedish administrative boundary overlays as MVT vector tiles from GeoServer. Admin levels: Region (län), Municipality (kommuner), RegSO, DeSO. `MapView` renders the map, `MapSidebar` the level/dataset nav, `MapLegend` the classed or gradient legend, `SelectionPanel` the detail panel.

**KPI**: `datasets/scb/kpi.ts` fetches CPI (KPICOI80MN) from SCB v2beta and renders it through the multi-line chart.

### Backend Structure

`backend/main.py` — FastAPI app serving static pre-processed data (via `state_expenses_api.py`) from `data/economy/` at `/api/expenses/` and `/api/revenue/`. All SCB data is now fetched directly from SCB v2beta in the frontend — no proxy.

### Data Pipeline

ESV (Ekonomistyrningsverket) CSV files in `processing/data/esv/` → Python parsing scripts → hierarchical JSON structured for D3 sunburst (name/children/value tree) → stored in `data/economy/` → served by backend.

The processed JSON files (`state_expenses_1997_2024.json`, `state_revenue_2006_2024.json`) are keyed by year.

## UI Patterns

These patterns are established and must be followed consistently. Full rationale in `docs/ui-design-system.md`.

### Section / eyebrow labels
Use `<SectionLabel>` (`src/components/ui/SectionLabel.tsx`) for every small-caps label that appears above a control, stat, or section of content. Never write ad-hoc strings like `text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400` inline. Use the `className` prop to layer dynamic styles (e.g. `group-hover`).

### Select / dropdown controls
`Dropdown` (`src/components/ui/Dropdown.tsx`, wraps Radix Select) is the only select pattern. Do not use native `<select>` elements or `SelectInput` (deleted). `Dropdown` supports `inputSize="sm"` for tight contexts.

### Tooltips
- **Cursor-tracking tooltips** (D3 charts): use `UI.tooltip` from `src/theme.ts` as the className, `fixed` positioned.
- **Absolute-positioned tooltips** (within a `relative` container): write the classes inline but always use `bg-gray-900` as the background. Never use `bg-slate-800`.
- The existing `Tooltip` component (`src/components/ui/Tooltip.tsx`, forwardRef) is for D3 charts that need a permanently-mounted ref target.

### Number formatting
Every number that reaches the screen goes through `src/utils/format.ts` (`formatNumber`, `formatCompact`, `formatWithUnit`, `formatPercent`, `formatSigned`), which is sv-SE only. Do not call `toLocaleString`, `toFixed` or `d3.format` for display text or axis ticks.

### Buttons
`Button` (`src/components/ui/button.tsx`, shadcn) with `variant="ghost"` or `variant="outline"` is preferred over raw `<button className="...border...hover:...">` for non-navigation actions. Nav items with a left-border active style can remain bespoke. Audit button usages when touching a component.

---

## Working Preferences

- **Never commit without explicit user approval.** Always show what you plan to commit and wait for an "ok", "go ahead", or equivalent before running `git commit`.

### SCB API Notes
- **v2beta** (`api.scb.se/OV0104/v2beta/api/v2/tables`): All SCB data is fetched directly from v2beta in the frontend — no backend proxy.
- SCB responses use JSON-stat2 format; types are defined in `frontend/src/util/scb.ts`.
