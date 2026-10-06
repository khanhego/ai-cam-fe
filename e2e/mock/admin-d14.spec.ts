/** D14 Hàng hoàn trên MSW (02b-admin §13 E2E mock, T-153): tab có số → Quá hạn → D4; Chưa xác định → Gắn đơn (UC-13). TC-07.37, 07.33. */
import { expect, test, type Page } from "@playwright/test";

async function loginDashboard(page: Page, username = "tst_sup") {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
}

test("TC-07.37: drawer → D14 tab Đang về (có số) → Quá hạn → bấm dòng mở D4", async ({ page }) => {
  await loginDashboard(page, "tst_cskh");
  await page.getByRole("link", { name: /Hàng hoàn/ }).click();
  await expect(page.getByRole("heading", { name: "Hàng hoàn" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Đang về \d+$/ })).toHaveAttribute("aria-selected", "true");
  const table = page.getByRole("table", { name: "Danh sách hồ sơ hàng hoàn" });
  await expect(table.getByText("Chiều về SPXRTTST000041")).toBeVisible();

  await page.getByRole("tab", { name: "Quá hạn 1" }).click();
  await expect(page).toHaveURL(/\/admin\/returns\?tab=MISSING$/);
  const row = table.getByRole("row").filter({ hasText: "Quá hạn chưa về" });
  await expect(row).toContainText("8 ngày");
  await row.click();
  await expect(page).toHaveURL(/\/admin\/packages\/pkg-0000049$/);
  await expect(page.getByRole("heading", { name: /SPXTST0000049/ })).toBeVisible();
});

test("TC-07.33 (UI): D14 tab Chưa xác định → Gắn đơn → SPXTST0000046 → D4 kiện đích", async ({ page }) => {
  await loginDashboard(page);
  await page.getByRole("link", { name: /Hàng hoàn/ }).click();
  await page.getByRole("tab", { name: /^Chưa xác định/ }).click();
  const row = page.getByRole("table").getByRole("row").filter({ hasText: "TAM-000001" });
  await row.getByRole("button", { name: "Gắn đơn" }).click();
  const dialog = page.getByRole("dialog", { name: "Gắn đơn" });
  await dialog.getByLabel("Mã đơn sàn hoặc mã vận đơn gốc").fill("SPXTST0000046");
  await dialog.getByRole("button", { name: "Tìm" }).click();
  await expect(dialog.getByRole("group", { name: "Đơn tìm được" })).toContainText("SPXTST0000046");
  await dialog.getByRole("button", { name: "Gắn đơn này" }).click();
  await expect(page.getByText("Đã gắn đơn 2410TST00046.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/packages\/pkg-0000046$/);

  // Hồ sơ đã gắn đơn → không còn trong tab Chưa xác định.
  await page.getByRole("link", { name: /Hàng hoàn/ }).click();
  await page.getByRole("tab", { name: /^Chưa xác định/ }).click();
  await expect(page.getByText("Không có kiện hoàn chưa xác định.")).toBeVisible();
});
