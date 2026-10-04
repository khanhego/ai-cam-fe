/** UC-03 trên MSW (02b-admin §13): D2 → D3 → quét mã → D4 → xem clip → giữ → xuất → tải. TC-07.01, 07.07 (UI), 09.02. */
import { expect, test, type Page } from "@playwright/test";

async function loginDashboard(page: Page, username = "tst_cskh") {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
}

test("UC-03: tra cứu bằng máy quét → chi tiết → giữ clip → xuất Ghép → 2 nút tải", async ({ page }) => {
  await loginDashboard(page);

  await page.getByRole("link", { name: /Tra cứu đơn/ }).click();
  await expect(page.getByLabel("Mã vận đơn hoặc mã đơn")).toBeFocused();
  // Máy quét HID: gõ liền ≤ 5 ms/phím + Enter.
  await page.keyboard.type("SPXTST0000001", { delay: 5 });
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/admin\/packages\/pkg-0000001$/);
  await expect(page.getByRole("heading", { name: /SPXTST0000001/ })).toBeVisible();
  const clip = page.getByRole("region", { name: "Clip" });
  await expect(clip.locator('video[aria-label="Cam 1"]')).toHaveAttribute("preload", "none");
  await clip.getByRole("tab", { name: "Ghép" }).click();
  await expect(clip.locator("video")).toHaveCount(2);

  await page.getByRole("button", { name: "Giữ clip" }).click();
  await expect(page.getByRole("button", { name: "Bỏ giữ" })).toBeVisible();
  await expect(page.getByText("Đã giữ clip. Clip sẽ không bị xóa tự động.")).toBeVisible();

  await clip.getByRole("button", { name: "Xuất clip" }).click();
  const dialog = page.getByRole("dialog", { name: "Xuất clip" });
  await expect(dialog.getByRole("button", { name: "Ghép" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Tạo file xuất" }).click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Tải file MP4/ })).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole("link", { name: "Tải thông tin (JSON)" })).toBeVisible();
});

test("TC-09.02: thẻ D2 dẫn sang D3 đúng bộ lọc, số dòng = số trên thẻ", async ({ page }) => {
  await loginDashboard(page, "tst_sup");

  const card = page.getByRole("link", { name: /^Đã đóng gói: \d+\./ });
  const n = (await card.getAttribute("aria-label"))!.match(/: (\d+)\./)![1];
  await card.click();

  await expect(page).toHaveURL(/session_status=COMPLETED/);
  await expect(page.getByText(`${n} kết quả`)).toBeVisible();
});

test("D3 ở 360px: không cuộn ngang, kết quả dạng card (TC-07.12 trên Chromium)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginDashboard(page);
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page.getByRole("link", { name: /Tra cứu đơn/ }).click();

  await expect(page.getByRole("list", { name: "Kết quả" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
