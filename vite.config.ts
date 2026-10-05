/// <reference types="vitest/config" />
import { rmSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Không đưa service worker MSW và video mẫu (public/mock) vào build production (02b §12). */
const dropMockWorker = (): Plugin => ({
  name: "aicam:drop-msw-worker",
  apply: "build",
  closeBundle() {
    rmSync(fileURLToPath(new URL("./dist/mockServiceWorker.js", import.meta.url)), { force: true });
    rmSync(fileURLToPath(new URL("./dist/mock", import.meta.url)), { recursive: true, force: true });
  },
});

const API_URL = process.env.API_URL ?? "http://localhost:8180";
const WEBRTC_URL = process.env.MEDIAMTX_WEBRTC_URL ?? "http://localhost:58889";

export default defineConfig({
  plugins: [react(), tailwindcss(), dropMockWorker()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5180,
    strictPort: true,
    // Cùng origin trong dev để cookie refresh (path /api/v1/auth) hoạt động như production qua Caddy.
    proxy: {
      "/api": { target: API_URL, changeOrigin: false },
      "/ws": { target: API_URL.replace(/^http/, "ws"), ws: true },
      // WHEP (API-65 `whep_url` = /live/<path>/whep): production qua Caddy; dev thẳng tới MediaMTX WebRTC.
      "/live": { target: WEBRTC_URL, changeOrigin: true, rewrite: (p) => p.replace(/^\/live/, "") },
    },
  },
  build: { sourcemap: "hidden", target: "es2022" },
  test: {
    globals: true,
    css: false,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
