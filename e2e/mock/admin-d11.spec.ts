/** D11 Live view trên MSW (02b-admin §12: `<video>` lặp thay WHEP) — luồng UI TC-01.10, chọn station phóng to. */
import { expect, test } from "@playwright/test";

test("TC-01.10 (UI, mock): Live view hiện ô camera có REC, Cam 2 mất tín hiệu + Thử lại", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill("tst_admin");
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("link", { name: "Live view" })
    .click();
  await expect(page).toHaveURL(/\/admin\/live$/);
  const cam1 = page.getByRole("figure", { name: "TST Station 01 · Cam 1" });
  await expect(cam1.getByText("REC", { exact: true })).toBeVisible();
  // Seed mock: Cam 2 TST Station 01 OFFLINE.
  const cam2 = page.getByRole("figure", { name: "TST Station 01 · Cam 2" });
  await expect(cam2.getByText("Mất tín hiệu")).toBeVisible();
  await expect(cam2.getByRole("button", { name: "Thử lại" })).toBeVisible();
});
