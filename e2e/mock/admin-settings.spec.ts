/** D7 Kết nối sàn + D8 Lưu trữ video trên MSW (02b-admin §12). */
import { expect, test } from "@playwright/test";

test("TC-02.09 / TC-05.01 (UI, mock): D8 chặn clip < video thô, lưu được; D7 hiện shop + đồng bộ ngay", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill("tst_admin");
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });

  await nav.getByRole("link", { name: "Lưu trữ video" }).click();
  await page.getByLabel("Số ngày giữ clip").fill("20");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Số ngày giữ clip phải lớn hơn hoặc bằng video thô.")).toBeVisible();
  await page.getByLabel("Số ngày giữ clip").fill("120");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Sức khỏe hệ thống" }).getByText(/Đã dùng .* \(83%\)/),
  ).toBeVisible();

  // item 03 (T-252, DEC-547): D7 đổi tên "Kết nối sàn", mock nhiều shop (DEC-549) — shop Phase 1 là "TST Shop A".
  await nav.getByRole("link", { name: "Kết nối sàn" }).click();
  const shop = page.getByRole("region", { name: "TST Shop A" });
  await expect(shop.getByText("Đã kết nối")).toBeVisible();
  await shop.getByRole("button", { name: "Đồng bộ ngay" }).click();
  await expect(page.getByText("Đã bắt đầu đồng bộ. Số liệu sẽ tự cập nhật.")).toBeVisible();
});
