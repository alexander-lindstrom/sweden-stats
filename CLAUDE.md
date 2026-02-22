# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sweden Data Visualizer — interactive visualizations of public Swedish data (SCB, ESV) using a React frontend and a FastAPI backend.

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
- `/` → `LandingPage`
- `/category/economy` → `EconomicIndicators` (tabbed: KPI + State Expenses)
- `/category/map` → `MapView`
- `/category/test` → `PopulationDataViewer`

**API Layer** — two patterns coexist:
1. **RTK Query** (`frontend/src/api/BaseApi.ts`, `ScbApi.ts`): Redux store-backed, used for population statistics (direct to SCB v2beta API).
2. **Plain fetch** (`frontend/src/api/backend/`): Used for state expenses/revenue and SCB v1 proxy, all hitting the FastAPI backend at `localhost:3001`.

Path alias `@/` resolves to `frontend/src/`.

**State Management**: Redux Toolkit (`frontend/src/app/store.ts`) with a single RTK Query API slice.

**Charts** (`frontend/src/components/charts/sunBurstWithBar/`): D3-based sunburst + bar chart pair used in the State Expenses dashboard. Clicking arcs/bars drills down the hierarchy; a root button resets to top level.

**Map** (`frontend/src/components/map/`): OpenLayers map with switchable base layers (Esri tiles) and Swedish administrative boundary overlays as MVT vector tiles from GeoServer. Admin levels: Region (län), Municipality (kommuner), RegSO, DeSO.

**KPI** (`frontend/src/components/Kpi/`): Fetches CPI data from SCB (KPICOI80MN table) via the backend proxy, transforms it, and renders as a line chart.

### Backend Structure

`backend/main.py` — FastAPI app with two responsibilities:
1. **SCB proxy** (`POST /api/scb/{path}`): Forwards requests to `https://api.scb.se/OV0104/v1/doris/sv/ssd/{path}` to avoid CORS issues with the v1 API.
2. **Static data** (via `state_expenses_api.py`): Serves pre-processed JSON from `data/economy/` at `/api/expenses/` and `/api/revenue/`.

### Data Pipeline

ESV (Ekonomistyrningsverket) CSV files in `processing/data/esv/` → Python parsing scripts → hierarchical JSON structured for D3 sunburst (name/children/value tree) → stored in `data/economy/` → served by backend.

The processed JSON files (`state_expenses_1997_2024.json`, `state_revenue_2006_2024.json`) are keyed by year.

### SCB API Notes
- **v1** (`api.scb.se/OV0104/v1/doris/sv/ssd`): Used for KPI and other table queries, proxied through backend.
- **v2beta** (`api.scb.se/OV0104/v2beta/api/v2/tables`): Used directly by the RTK Query population endpoint (no proxy needed).
- SCB responses use JSON-stat2 format; types are defined in `frontend/src/util/scb.ts`.
