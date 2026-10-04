import { defineConfig, devices } from "@playwright/test";

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
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5181",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev --port 5181 --strictPort",
        url: "http://localhost:5181",
        reuseExistingServer: true,
      },
});
