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
        // More specific rule must come first — Vite matches in insertion order.
        // /api/kolada/* → https://api.kolada.se/v3/* (CORS not available on Kolada v3)
        "/api/kolada": {
          target: "https://api.kolada.se",
          rewrite: (path) => path.replace("/api/kolada", "/v3"),
          changeOrigin: true,
        },
        "/api": "http://localhost:3001",
        "/geoserver": env.GEOSERVER_URL ?? "http://localhost:8080",
      },
    },
  };
});
