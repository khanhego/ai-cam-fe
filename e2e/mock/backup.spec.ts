/**
 * Item 03 M15 trên MSW (02b-admin §13 E2E mock `backup.spec.ts`, UC-20): D23 Sao lưu cloud — drawer → xác nhận khóa →
 * Đang bật → kiểm tra kết nối; khóa cũ → tải lại; lệch mã băm / không thấy tệp tại kho → xử lý có lý do; quyền.
 * Kịch bản mock qua query lúc tải trang (`?backupState=`, `?oldKeys=1`, `?srcMissing=1` — 02b §12).
 * MSW giữ dữ liệu trong bộ nhớ trang → sau đăng nhập điều hướng trong app (`pushState`), không `goto`.
 */
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = (page: Page, name: string) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : Promise.resolve();

async function adminLogin(page: Page, user: string, query = "") {
  await page.goto(`/admin/login${query}`);
  await page.getByLabel("Tên đăng nhập").fill(user);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
}
async function go(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test("UC-20 (T-259): chưa xác nhận khóa → Dialog tick → Đang bật → Kiểm tra kết nối → Sao lưu DB ngay", async ({
  page,
}) => {
  await adminLogin(page, "tst_admin", "?backupState=KEY_UNCONFIRMED");
  await page.getByRole("link", { name: "Sao lưu" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sao lưu cloud" })).toBeVisible();
  await expect(page.getByText("Sao lưu chưa bật: xác nhận đã cất khóa giải mã.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sao lưu DB ngay" })).toBeDisabled();
  await shot(page, "d23-key-unconfirmed");

  await page.getByRole("button", { name: "Xác nhận" }).click();
  const dialog = page.getByRole("dialog", { name: "Đã cất khóa giải mã?" });
  await expect(dialog).toContainText("Dấu vân tay: 7F3A-91C2-0B5E-44D1.");
  await expect(dialog.getByRole("button", { name: "Bật sao lưu" })).toBeDisabled();
  await dialog.getByLabel("Tôi đã cất bản sao khóa ở nơi an toàn ngoài máy chủ").check();
  await shot(page, "d23-confirm-key");
  await dialog.getByRole("button", { name: "Bật sao lưu" }).click();
  await expect(page.getByText("Đã bật sao lưu cloud.")).toBeVisible();
  await expect(page.getByText("Đang bật", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Kiểm tra kết nối" }).click();
  await expect(page.getByText("Kết nối kho lưu tốt (ghi, đọc, xóa thử thành công).")).toBeVisible();
  await page.getByRole("button", { name: "Sao lưu DB ngay" }).click();
  await expect(page.getByText("Đã bắt đầu sao lưu DB.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Lịch sử 14 ngày" }).getByRole("row")).toHaveCount(16);
  await shot(page, "d23-on");
});

test("EX-K6 / EX-K7 / EX-K9 (T-263): khóa cũ → tải lại; lệch mã băm → Vẫn sao lưu; không thấy tệp → Thử lại ngay", async ({
  page,
}) => {
  await adminLogin(page, "tst_admin", "?oldKeys=1&srcMissing=1");
  await go(page, "/admin/settings/backup");
  await expect(
    page.getByText(
      "812 tệp bằng chứng và 42 bản DB mã hóa bằng khóa 21C4-0D9A-77E1-5B30 (cũ) — giữ khóa cũ để khôi phục được các bản này.",
    ),
  ).toBeVisible();
  await shot(page, "d23-issues");

  await page.getByRole("button", { name: "Tải lại bằng chứng bằng khóa mới" }).click();
  const re = page.getByRole("dialog", { name: "Tải lại bằng chứng bằng khóa mới?" });
  await expect(re).toContainText("Tải lại 790 tệp còn ở kho bằng khóa mới? Khoảng 136 GB");
  await re.getByRole("button", { name: "Tải lại" }).click();
  await expect(page.getByText("Đã xếp 790 tệp vào hàng chờ.")).toBeVisible();

  const hash = page.getByRole("alert").filter({ hasText: "2 clip có mã băm khác lúc tạo" });
  await hash.getByRole("button", { name: "Xem danh sách" }).click();
  await page.getByRole("button", { name: "Vẫn sao lưu — SPXTST0000004" }).click();
  const r1 = page.getByRole("dialog", { name: "Vẫn sao lưu bản hiện có?" });
  await r1.getByLabel("Lý do*").fill("Đã xem tay video, đúng kiện");
  await shot(page, "d23-resolve");
  await r1.getByRole("button", { name: "Vẫn sao lưu" }).click();
  await expect(page.getByText("Đã ghi nhận.")).toBeVisible();
  await expect(page.getByText("1 clip có mã băm khác lúc tạo — không được sao lưu.")).toBeVisible();

  const missing = page.getByRole("alert").filter({ hasText: "không thấy trên ổ của máy chủ" });
  await missing.getByRole("button", { name: "Xem danh sách" }).click();
  await page.getByRole("button", { name: "Thử lại ngay — SPXTST0000006" }).click();
  const r2 = page.getByRole("dialog", { name: "Thử lại ngay?" });
  await r2.getByLabel("Lý do*").fill("IT đã chép lại từ ổ cũ");
  await r2.getByRole("button", { name: "Thử lại ngay" }).click();
  await expect(page.getByText("Đã xếp thử lại.")).toBeVisible();
});

test("Quyền: Supervisor không có mục Sao lưu; mở URL D23 → D12", async ({ page }) => {
  await adminLogin(page, "tst_sup");
  await expect(page.getByRole("link", { name: "Sao lưu" })).toHaveCount(0);
  await go(page, "/admin/settings/backup");
  await expect(page).toHaveURL(/\/admin\/forbidden$/);
});
