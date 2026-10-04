import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (02b-station §13, 02b-admin §13). Mặc định chạy với MSW (`pnpm dev:mock`, port 5180);
 * chạy với BE thật: đặt E2E_BASE_URL và bỏ VITE_MOCK.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5180",
    trace: "retain-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev:mock", url: "http://localhost:5180", reuseExistingServer: true, timeout: 60_000 },
});
