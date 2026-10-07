import { defineConfig, devices } from "@playwright/test";

/**
 * Stack khác stack dev (vd. stack QA riêng `aicam-qa` — T-229, DEC-820): `E2E_API_URL` (dạng
 * `http://localhost:8280/api/v1`, như admin-g4) → dev server riêng ở `E2E_FE_PORT` (mặc định 5281) proxy sang API đó,
 * WHEP sang `E2E_WEBRTC_URL`. Không đặt → như cũ (:5181 → :8180). `E2E_BASE_URL` = dùng server FE có sẵn.
 */
const API_ORIGIN = process.env.E2E_API_URL?.replace(/\/api\/v1\/?$/, "");
const FE_PORT = Number(process.env.E2E_FE_PORT ?? (API_ORIGIN ? 5281 : 5181));
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${FE_PORT}`;

/**
 * E2E với BE thật (04-test-cases §1, QA M1): stack `ai-cam-be/docker/compose.dev.yml` phải đang chạy (api :8180).
 * Dev server không MSW ở port 5181, proxy /api và /ws sang :8180. Dữ liệu reset bằng `ai-cam-be/scripts/qa-reset.sh`
 * trước mỗi test (helper `resetData`). KHÔNG chạy trên production.
 */
export default defineConfig({
  testDir: "./e2e/real",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm dev --port ${FE_PORT} --strictPort`,
        url: BASE_URL,
        // API khác: không dùng lại server đang chạy ở cổng đó (có thể đang proxy sang stack dev).
        reuseExistingServer: !API_ORIGIN,
        env: API_ORIGIN
          ? {
              API_URL: API_ORIGIN,
              MEDIAMTX_WEBRTC_URL: process.env.E2E_WEBRTC_URL ?? "http://localhost:58889",
            }
          : undefined,
      },
});
