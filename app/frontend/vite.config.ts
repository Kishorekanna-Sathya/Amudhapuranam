import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => {
  // Dev Docker: VITE_BASE="/" | GitHub Pages build: VITE_BASE="/Amudhapuranam/" (default)
  const base = process.env.VITE_BASE ?? (command === "build" ? "/Amudhapuranam/" : "/");

  return {
    base,
    plugins: [react()],
    server: {
      port: 3000,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: "http://backend:4000",
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 3000,
      host: "0.0.0.0",
    },
  };
});
