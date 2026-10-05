/**
 * UC-08 phần dashboard trên MSW (02b-admin §13): D2 "Cần xử lý" → Duyệt → D13 → quyết định → badge về 0.
 * MSW chạy trong từng trang nên station ↔ dashboard hai cửa sổ chỉ kiểm được với BE thật (e2e/real/admin-d13).
 */
import { expect, test } from "@playwright/test";

test("TC-03.43 / 03.44 (UI): D2 → Duyệt → D13, khóa Đóng phiên khi khay sai, Cho tiếp tục → hết yêu cầu", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill("tst_sup");
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
  await expect(nav.getByRole("status", { name: "1 yêu cầu đang chờ" })).toBeVisible();
  const attention = page.getByRole("region", { name: "Cần xử lý" });
  await attention.getByRole("link", { name: "Duyệt" }).click();

  await expect(page).toHaveURL(/\/admin\/approvals$/);
  const card = page.locator("article", { has: page.getByRole("heading", { name: "TST Station 02" }) });
  await expect(card.getByText("Lệch mã", { exact: true })).toBeVisible();
  await expect(card.getByText("SPXTST0000021")).toBeVisible();
  await expect(card.getByRole("button", { name: "Đóng phiên có ghi chú" })).toBeDisabled();
  await expect(
    card.getByText("Cam 2 vẫn thấy phiếu sai, Cho tiếp tục sẽ đưa station về Lệch mã."),
  ).toBeVisible();

  await card.getByRole("button", { name: "Cho tiếp tục" }).click();
  await expect(page.getByText("Đã cho station tiếp tục.")).toBeVisible();
  await expect(page.getByText("Không có yêu cầu nào đang chờ.")).toBeVisible();
  await expect(nav.getByRole("status", { name: /yêu cầu đang chờ/ })).toHaveCount(0);
});
