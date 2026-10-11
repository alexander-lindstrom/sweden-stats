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

## Geodata

GeoServer serves boundary GeoPackages that are not in git. They are built from
SCB's DeSO and RegSO boundaries and published as GitHub releases
named `geodata-<version>`; `data/geodata.lock` pins the version the server runs.

```bash
# Build from scratch into data/geopackage/ (downloads from SCB, ~20 s)
pip install -r processing/requirements.txt
python processing/build_geodata.py

# Put the pinned release in data/geopackage/; every deploy runs this
scripts/restore_geodata.sh
```

To publish a new version, run the **Geodata** workflow (Actions → Geodata → Run
workflow) with a version such as `2025.2`. It builds on a clean runner, publishes
the release and prints the lines for `data/geodata.lock`; commit those to deploy
it. If SCB has changed a source, the build stops with its new fingerprint: review
the change, then update `SCB_SOURCES` in `processing/build_geodata.py`.

`geodata-2025.0` is the set that was live before the build existed, made from
SCB's `2025_v1` release, which SCB no longer serves; the build reproduces it apart
from SCB's later corrections.

## Conventions

See `CLAUDE.md` for architecture, UI patterns and the working rules that apply
to changes in this repository.
