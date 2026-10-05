/** D9 Người dùng + D10 Nhật ký trên MSW (02b-admin §12). */
import { expect, test } from "@playwright/test";

test("FR-10.01 / TC-10.07 (UI, mock): tạo tài khoản, khóa Admin cuối bị chặn, D10 có dòng Sửa tài khoản", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill("tst_admin");
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });

  await nav.getByRole("link", { name: "Người dùng" }).click();
  await page.getByRole("button", { name: "Thêm người dùng" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên đăng nhập").fill("qa_mock");
  await dialog.getByLabel("Tên hiển thị").fill("QA Mock");
  await dialog.getByLabel("Mật khẩu").fill("12345678");
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByText("Đã tạo tài khoản.")).toBeVisible();
  const users = page.getByRole("table", { name: "Người dùng" });
  await expect(users.getByText("qa_mock")).toBeVisible();

  await users
    .getByRole("row", { name: /tst_admin/ })
    .getByRole("button", { name: "Khóa tài khoản tst_admin" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Khóa tài khoản" }).click();
  await expect(page.getByText("Phải còn ít nhất một Admin.")).toBeVisible();

  await nav.getByRole("link", { name: "Nhật ký thao tác" }).click();
  await page.getByLabel("Hành động").selectOption("USER_UPDATE");
  const audit = page.getByRole("table", { name: "Nhật ký thao tác" });
  await expect(audit.getByRole("row").nth(1)).toContainText("Sửa tài khoản");
  await expect(audit.getByRole("row").nth(1)).toContainText("Quản trị");
});
