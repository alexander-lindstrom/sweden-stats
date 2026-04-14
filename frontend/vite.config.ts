import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, ".."), "");
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/ol/')) { return 'vendor-ol'; }
            if (id.includes('/node_modules/d3') || id.includes('/node_modules/d3-')) { return 'vendor-d3'; }
          },
        },
      },
    },
    server: {
      proxy: {
        // All /api/* requests go to the FastAPI backend at :3001.
        // Kolada proxying is handled there (avoids CORS — Kolada v3 has no CORS headers).
        "/api": "http://localhost:3001",
        "/geoserver": env.GEOSERVER_URL ?? "http://localhost:8080",
      },
    },
  };
});
