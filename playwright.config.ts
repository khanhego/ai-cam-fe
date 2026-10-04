import { defineConfig, devices } from "@playwright/test";

/**
 * E2E với MSW (02b-station §13, 02b-admin §13): `pnpm e2e` (dev:mock, port 5180).
 * E2E với BE thật: `pnpm e2e:real` — xem playwright.real.config.ts.
 */
export default defineConfig({
  testDir: "./e2e/mock",
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
