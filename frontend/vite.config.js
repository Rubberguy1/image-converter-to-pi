import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy API calls to the FastAPI backend so the browser talks to a
// single origin. Defaults to the local backend (:8000); set VITE_API_TARGET to
// point at a Raspberry Pi instead, e.g.:
//   VITE_API_TARGET=http://raspberrypi.local:8000 npm run dev
// so you get instant frontend HMR while driving the REAL panels on the Pi.
const apiTarget = process.env.VITE_API_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": apiTarget,
      "/healthz": apiTarget,
    },
  },
  build: {
    outDir: "dist",
  },
});
