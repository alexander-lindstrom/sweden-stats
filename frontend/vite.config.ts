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
    server: {
      proxy: {
        "/api": "http://localhost:3001",
        "/geoserver": env.GEOSERVER_URL ?? "http://localhost:8080",
      },
    },
  };
});
