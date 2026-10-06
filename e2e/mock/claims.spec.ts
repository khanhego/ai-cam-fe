/** UC-04 / UC-12 trên MSW (02b-admin §13 E2E mock `claims.spec.ts`): D16 → D17 → nhận phụ trách → đổi trạng thái → gói zip; D4 → tạo hồ sơ → D17. */
import { expect, test, type Page } from "@playwright/test";

async function loginDashboard(page: Page, username = "tst_cskh") {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
}

test("UC-04: drawer → D16 tab Mới → KN-000124 → D17 → Nhận phụ trách → Đã gửi (mã sàn)", async ({ page }) => {
  await loginDashboard(page);
  await page.getByRole("link", { name: /Hồ sơ khiếu nại/ }).click();
  await expect(page.getByRole("tab", { name: /^Mới \d+$/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("table").getByRole("link", { name: "KN-000124" }).click();

  await expect(page).toHaveURL(/\/admin\/claims\/cl-000124$/);
  await expect(page.getByRole("heading", { name: /KN-000124 · Hộp rỗng · gửi Sàn/ })).toBeVisible();
  const steps = page.getByRole("list", { name: "Tiến trình hồ sơ" });
  await expect(steps.locator('[aria-current="step"]')).toContainText("Mới");

  await page.getByRole("button", { name: "Nhận phụ trách" }).click();
  await expect(page.getByRole("button", { name: "Nhận phụ trách" })).toHaveCount(0);
  await page.getByRole("button", { name: "Đổi trạng thái" }).click();
  await page.getByRole("menuitem", { name: "Đã gửi" }).click();
  const dialog = page.getByRole("dialog", { name: 'Chuyển sang "Đã gửi"' });
  await dialog.getByLabel("Mã tham chiếu sàn").fill("SPE-998877");
  await dialog.getByRole("button", { name: "Xác nhận" }).click();
  await expect(steps.locator('[aria-current="step"]')).toContainText("Đã gửi");
  await expect(page.getByRole("list", { name: "Ghi chú" }).getByText("Mới → Đã gửi.")).toBeVisible();

  // UC-12 / TC-08.16 (UI): gói bằng chứng — tiến độ → tải zip.
  await page.getByRole("button", { name: "Xuất gói bằng chứng" }).click();
  const pack = page.getByRole("dialog", { name: "Xuất gói bằng chứng" });
  await expect(pack.getByText(/^Gói gồm: clip gốc, video ghép có chữ cho 2 phiên chính/)).toBeVisible();
  await pack.getByRole("button", { name: "Tạo gói" }).click();
  await expect(pack.getByRole("progressbar")).toBeVisible();
  const zip = pack.getByRole("button", { name: "Tải gói bằng chứng (.zip)" });
  await expect(zip).toBeVisible({ timeout: 15_000 });
  const download = page.waitForEvent("download");
  await zip.click();
  expect((await download).suggestedFilename()).toBe("KN-000124.zip");
});

test("FR-08.01: D4 → Tạo hồ sơ khiếu nại → D17 hồ sơ mới có bằng chứng tự chọn", async ({ page }) => {
  await loginDashboard(page);
  // MSW giữ phiên trong bộ nhớ → điều hướng trong app (không `goto`).
  await page.getByRole("link", { name: /Tra cứu đơn/ }).click();
  await page.getByLabel("Mã vận đơn hoặc mã đơn").fill("SPXTST0000010");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/packages\/pkg-0000010$/);
  await page.getByRole("button", { name: "Tạo hồ sơ khiếu nại" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo hồ sơ khiếu nại" });
  await dialog.getByLabel("Ghi chú").fill("Khách báo thiếu 1 tất");
  await dialog.getByRole("button", { name: "Tạo hồ sơ" }).click();
  await expect(page).toHaveURL(/\/admin\/claims\/cl-\d+$/);
  await expect(
    page.getByRole("heading", { name: /KN-\d{6} · Khách báo thiếu \/ sai · gửi Sàn/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Xem Phiên đóng gói/ })).toBeVisible();
  await expect(page.getByText("Khách báo thiếu 1 tất")).toBeVisible();
});

test("D16 / D17 ở 360px: card, một cột, không cuộn ngang", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginDashboard(page);
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page.getByRole("link", { name: /Hồ sơ khiếu nại/ }).click();
  await expect(page.getByRole("list", { name: "Kết quả" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole("list", { name: "Kết quả" }).getByRole("link", { name: "KN-000124" }).click();
  await expect(page.getByRole("heading", { name: /KN-000124/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
