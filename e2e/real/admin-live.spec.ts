/**
 * D11 với BE thật (FR-01.05): API-65 → mỗi camera một bắt tay WHEP (POST SDP kèm Bearer → 201 + answer).
 * Không kiểm khung hình: stack dev không publish cổng ICE UDP 8189 của MediaMTX nên media không tới được trình duyệt
 * (TC-01.10 / 01.14 phát video thật cần PRE-7 — DEC-83).
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
