/** D9 Người dùng + D10 Nhật ký với BE thật (API-90..92 có ở BE) — 04-test-cases M10. */
import { expect, test } from "@playwright/test";

import { loginAdmin, PASSWORD, resetData } from "./helpers";

test.beforeEach(() => resetData());

test("FR-10.01: tạo người dùng CSKH trên D9 → đăng nhập được bằng tài khoản mới", async ({
  page,
  browser,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/users");
  await page.getByRole("button", { name: "Thêm người dùng" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên đăng nhập").fill("qa_e2e_cskh");
  await dialog.getByLabel("Tên hiển thị").fill("QA CSKH");
  await dialog.getByLabel("Vai trò").selectOption("CSKH");
  await dialog.getByLabel("Mật khẩu").fill("12345678");
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();

  await expect(page.getByText("Đã tạo tài khoản.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Người dùng" }).getByText("qa_e2e_cskh")).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  await other.goto("/admin/login");
  await other.getByLabel("Tên đăng nhập").fill("qa_e2e_cskh");
  await other.getByLabel("Mật khẩu").fill("12345678");
  await other.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(other).toHaveURL(/\/admin$/);
});

test("TC-10.08: trùng username → lỗi dưới ô Tên đăng nhập", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/users");
  await page.getByRole("button", { name: "Thêm người dùng" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên đăng nhập").fill("tst_admin");
  await dialog.getByLabel("Tên hiển thị").fill("x");
  await dialog.getByLabel("Mật khẩu").fill("12345678");
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();

  await expect(dialog.getByText("Tên đăng nhập đã tồn tại.")).toBeVisible();
});

test("TC-10.07: khóa Admin cuối → Phải còn ít nhất một Admin.; tst_admin vẫn đăng nhập được", async ({
  page,
  browser,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/users");
  const row = page.getByRole("table", { name: "Người dùng" }).getByRole("row", { name: /tst_admin/ });
  await row.getByRole("button", { name: "Khóa tài khoản tst_admin" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Khóa tài khoản" }).click();

  await expect(page.getByText("Phải còn ít nhất một Admin.")).toBeVisible();
  await expect(row.getByText("Đang hoạt động")).toBeVisible();
  const other = await (await browser.newContext()).newPage();
  await other.goto("/admin/login");
  await other.getByLabel("Tên đăng nhập").fill("tst_admin");
  await other.getByLabel("Mật khẩu").fill(PASSWORD);
  await other.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(other).toHaveURL(/\/admin$/);
});

test("TC-10.06 (bước 1–2): thu hồi đăng nhập tst_station01 → API-91 204, toast nêu ≤ 15 phút", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/users");
  const row = page.getByRole("table", { name: "Người dùng" }).getByRole("row", { name: /tst_station01/ });
  await row.getByRole("button", { name: "Thu hồi phiên đăng nhập tst_station01" }).click();
  const revoke = page.waitForResponse((r) => r.url().includes("/revoke-sessions"));
  await page.getByRole("dialog").getByRole("button", { name: "Thu hồi" }).click();

  expect((await revoke).status()).toBe(204);
  await expect(
    page.getByText("Đã thu hồi phiên đăng nhập. Station về màn đăng nhập trong tối đa 15 phút."),
  ).toBeVisible();
});

test("TC-10.09 (bước 10, UI): D10 hiện LOGIN của Quản trị; lọc Sửa tài khoản sau khi tạo user", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/admin/settings/users");
  await page.getByRole("button", { name: "Thêm người dùng" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên đăng nhập").fill("qa_audit");
  await dialog.getByLabel("Tên hiển thị").fill("QA Audit");
  await dialog.getByLabel("Mật khẩu").fill("12345678");
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByText("Đã tạo tài khoản.")).toBeVisible();

  await page.goto("/admin/settings/audit");
  const table = page.getByRole("table", { name: "Nhật ký thao tác" });
  await expect(table.getByRole("row", { name: /Quản trị.*Đăng nhập/ }).first()).toBeVisible();

  await page.getByLabel("Hành động").selectOption("USER_UPDATE");
  await expect(page).toHaveURL(/action=USER_UPDATE/);
  await expect(table.getByRole("row").nth(1)).toContainText("Sửa tài khoản");
  await expect(table.getByRole("row").nth(1)).toContainText("Quản trị");
  await page.getByLabel("Người").selectOption({ label: "Lan (tst_cskh)" });
  await expect(page.getByText("Không có thao tác nào khớp bộ lọc.")).toBeVisible();
});
