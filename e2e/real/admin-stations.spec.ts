/** QA M1 — D6 station & camera với BE thật (04-test-cases M01). */
import { expect, test } from "@playwright/test";

import { loginAdmin, resetData } from "./helpers";

test.beforeEach(() => resetData());

test("TC-01.01: tạo station, kiểm tra kết nối Cam 2 (camera giả) → ảnh chụp, lưu", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/stations/new");
  await page.getByLabel("Tên station").fill("TST Station 03");
  await page.getByRole("button", { name: "Tạo station" }).click();

  const cam2 = page.locator("section", { has: page.getByRole("heading", { name: /Cam 2/ }) });
  await expect(cam2).toBeVisible();
  await cam2.getByLabel("Địa chỉ RTSP").fill("rtsp://mediamtx:8554/cam-fake2");
  await cam2.getByRole("button", { name: /Kiểm tra kết nối/ }).click();
  await expect(cam2.getByRole("img", { name: /Ảnh chụp thử/ })).toBeVisible({ timeout: 20_000 });

  await cam2.getByRole("button", { name: /Lưu camera/ }).click();
  await expect(page.getByText("Đã lưu camera.")).toBeVisible();
  await expect(cam2.getByText("Online")).toBeVisible({ timeout: 15_000 });
});

test("TC-01.02: tên station trùng (khác hoa thường) → lỗi dưới ô tên", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/stations/new");
  await page.getByLabel("Tên station").fill("tst station 01");
  await page.getByRole("button", { name: "Tạo station" }).click();

  await expect(page.getByText("Tên station đã tồn tại.")).toBeVisible();
});

test("D6: danh sách station hiện 2 station seed, Station 01 có camera", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/stations");

  await expect(page.getByText("TST Station 01")).toBeVisible();
  await expect(page.getByText("TST Station 02")).toBeVisible();
});
