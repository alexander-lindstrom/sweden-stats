# Rikskartan — frontend

React 19 + Vite, OpenLayers for the map, D3 for charts, Tailwind + Radix for UI.

```bash
npm run dev       # http://localhost:5173
npm run build     # type-check + production build
npm run lint
```

Expects the FastAPI backend on port 3001 and a GeoServer on port 8080. To run
against the production services instead, create a local Vite config that
proxies `/api` and `/geoserver` to `https://datamedmera.se` and start with
`npx vite --config <that-config>`.

Where things live is documented in the repository `CLAUDE.md` (Frontend
Structure). Every on-screen number goes through `src/utils/format.ts`.
