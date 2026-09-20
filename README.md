# Rikskartan

Interactive explorer for official Swedish statistics (SCB, Kolada, ESV) mapped to
administrative boundaries: country, län, kommun, RegSO and DeSO. Pick a dataset,
switch level, and the map, charts and tables update in place. Live at
[datamedmera.se](https://datamedmera.se).

## Layout

| Directory     | What                                                        |
|---------------|-------------------------------------------------------------|
| `frontend/`   | React + Vite + OpenLayers + D3 app (the whole UI)           |
| `backend/`    | FastAPI service serving pre-processed ESV budget data       |
| `processing/` | Python scripts that turn ESV CSV exports into JSON          |
| `data/`       | Processed JSON served by the backend                        |
| `docs/`       | Design notes and dataset investigations                     |

## Running locally

```bash
# Frontend (http://localhost:5173) — Node >= 22
cd frontend && npm install && npm run dev

# Backend (http://localhost:3001) — needs fastapi, uvicorn, httpx
cd backend && bash start.sh
```

Boundary tiles come from a GeoServer at `http://localhost:8080`. Without a local
GeoServer, a Vite config that proxies `/api` and `/geoserver` to the production
host works well for UI work; see `frontend/README.md`.

## Conventions

See `CLAUDE.md` for architecture, UI patterns and the working rules that apply
to changes in this repository.
