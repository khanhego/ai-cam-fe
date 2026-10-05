/**
 * D11 với BE thật (FR-01.05): API-65 → mỗi camera một bắt tay WHEP (POST SDP kèm Bearer → 201 + answer).
 * Khung hình thật: MediaMTX dev mở ICE 8189 (UDP + TCP, quảng bá 127.0.0.1) — trên máy dev media đi qua ICE-TCP.
 */
import { expect, test } from "@playwright/test";

import { loginAdmin, resetData } from "./helpers";

test.beforeEach(() => resetData());

test("TC-01.10 (bắt tay): D11 mở WHEP cho Cam 1 + Cam 2 TST Station 01 qua /live", async ({ page }) => {
  const whep: number[] = [];
  page.on("response", (r) => {
    if (r.request().method() === "POST" && /\/live\/cam-.+\/whep$/.test(r.url())) whep.push(r.status());
  });
  await loginAdmin(page, "tst_sup");
  await page.goto("/admin/live");

  await expect(page.getByRole("figure", { name: "TST Station 01 · Cam 1" })).toBeVisible();
  await expect(page.getByRole("figure", { name: "TST Station 01 · Cam 2" })).toBeVisible();
  await expect.poll(() => whep.filter((s) => s === 201).length).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Station chưa gắn camera.")).toBeVisible(); // TST Station 02 trong seed
});

test("TC-01.10 (khung hình): Cam 1 và Cam 2 phát video thật qua WebRTC (ICE-TCP trên máy dev)", async ({
  page,
}) => {
  await loginAdmin(page, "tst_sup");
  await page.goto("/admin/live");

  for (const name of ["TST Station 01 · Cam 1", "TST Station 01 · Cam 2"]) {
    const video = page.getByRole("figure", { name }).locator("video");
    // Có khung hình (kích thước thật) và đang chạy (thời gian phát tăng) — không chỉ bắt tay WHEP.
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => (v.videoWidth > 0 ? v.currentTime : 0)), {
        timeout: 20_000,
      })
      .toBeGreaterThan(1);
  }
});
