/** D15 Lệch trạng thái trên MSW (02b-admin §13 E2E mock `recon.spec.ts`, T-156): UC-06 — TC-06.02, 06.12, 06.16 (UI). */
import { expect, test, type Page } from "@playwright/test";

async function loginDashboard(page: Page, username = "tst_sup") {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
}

test("UC-06: drawer (badge Cao) → D15 lọc Cao → Xử lý BR-14 'Đã kiểm kệ' → tab Đã xử lý", async ({
  page,
}) => {
  await loginDashboard(page);
  const nav = page.getByRole("link", { name: /Lệch trạng thái/ });
  await expect(nav).toContainText("3");
  await nav.click();
  await expect(page.getByRole("tab", { name: "Đang mở 7" })).toHaveAttribute("aria-selected", "true");

  await page.getByLabel("Mức").selectOption("HIGH");
  await expect(page).toHaveURL(/severity=HIGH/);
  const table = page.getByRole("table", { name: "Danh sách cảnh báo lệch trạng thái" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByRole("row").filter({ hasText: "SPXTST0000049" })).toContainText(
    "Hàng hoàn quá 7 ngày chưa về",
  );

  await page.getByRole("button", { name: "Xóa bộ lọc" }).first().click();
  await table
    .getByRole("row")
    .filter({ hasText: "SPXTST0000052" })
    .getByRole("button", { name: /Xử lý/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Xử lý cảnh báo" });
  await expect(dialog.getByText(/Kho: Đã đóng gói/).first()).toBeVisible();
  await dialog.getByLabel("Ghi chú").fill("Đã kiểm kệ");
  await dialog.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đã xử lý cảnh báo.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Đang mở 6" })).toBeVisible();

  await page.getByRole("tab", { name: "Đã xử lý" }).click();
  await expect(table.getByRole("row").filter({ hasText: "SPXTST0000052" })).toContainText("Đã kiểm kệ");
});

test("TC-06.16 (UI): BR-19 → Tạo hồ sơ khiếu nại (Thất lạc, ĐVVC) → D17", async ({ page }) => {
  await loginDashboard(page);
  await page.getByRole("link", { name: /Lệch trạng thái/ }).click();
  await page
    .getByRole("table")
    .getByRole("row")
    .filter({ hasText: "SPXTST0000051" })
    .getByRole("button", { name: /Xử lý/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Xử lý cảnh báo" });
  await dialog.getByRole("button", { name: "Tạo hồ sơ khiếu nại" }).click();
  await expect(dialog.getByLabel("Loại")).toHaveValue("LOST_IN_TRANSIT");
  await dialog.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/claims\/cl-/);
  await expect(page.getByRole("heading", { name: /Thất lạc · gửi Đơn vị vận chuyển/ })).toBeVisible();
});
