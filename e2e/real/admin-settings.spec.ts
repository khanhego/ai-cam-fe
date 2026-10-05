/** D8 (API-80/81 có ở BE T-18) và D7 (cần BE T-16/T-22, `E2E_M4_BE=1`) với BE thật — 04-test-cases M02, M05. */
import { expect, test } from "@playwright/test";

import { loginAdmin, resetData } from "./helpers";

test.beforeEach(() => resetData());

test("TC-02.09: D8 clip 20 < thô 30 → lỗi dưới ô, không lưu; TC-02.07 (UI) lưu 180 ngày", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/storage");
  const clip = page.getByLabel("Số ngày giữ clip");
  await expect(clip).toHaveValue(/\d+/);

  await clip.fill("20");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Số ngày giữ clip phải lớn hơn hoặc bằng video thô.")).toBeVisible();

  await clip.fill("180");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Số ngày giữ clip")).toHaveValue("180");
});

test("API-81: D8 hiện sức khỏe — dịch vụ, ổ đĩa, camera seed", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/storage");
  const panel = page.getByRole("region", { name: "Sức khỏe hệ thống" });
  await expect(panel.getByText("Cơ sở dữ liệu")).toBeVisible();
  await expect(panel.getByText(/TST Station 01 · Cam 1/)).toBeVisible();
});

test.describe("D7 Shopee (cần BE T-16/T-22)", () => {
  test.skip(!process.env.E2E_M4_BE, "Chờ BE T-16/T-22 (API-70..73) — chạy với E2E_M4_BE=1");

  test("TC-05.03: SHOPEE_ENABLED=false → Kết nối Shopee báo chưa cấu hình", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/admin/settings/shopee");
    await page
      .getByRole("button", { name: /Kết nối (Shopee|lại)/ })
      .first()
      .click();
    await expect(page.getByText("Chưa cấu hình Shopee Open Platform. Dùng Nhập đơn từ file.")).toBeVisible();
  });
});
