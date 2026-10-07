/**
 * Item 03 M17 trên MSW (02b-admin §13 E2E mock `notify.spec.ts`, UC-18): D22 Thông báo — drawer → thêm kênh Telegram
 * (Zalo OA chưa cấu hình: Alert + khóa) → gửi thử được / lỗi dưới dòng → giờ yên lặng → nhật ký lọc → xóa kênh có
 * Dialog xác nhận; card ở ≤ 600 px; quyền. MSW giữ dữ liệu trong bộ nhớ trang → điều hướng trong app, không `goto`.
 */
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = (page: Page, name: string) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : Promise.resolve();

async function adminLogin(page: Page, user: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill(user);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
}

test("UC-18 (T-258): thêm kênh → gửi thử → lỗi dưới dòng → giờ yên lặng → nhật ký → xóa kênh", async ({
  page,
}) => {
  await adminLogin(page, "tst_admin");
  await page.getByRole("link", { name: "Thông báo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Thông báo" })).toBeVisible();
  await expect(page.getByText("Chưa cấu hình Zalo OA trên máy chủ. Liên hệ IT.")).toBeVisible();
  const table = page.getByRole("table", { name: "Kênh thông báo" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await shot(page, "d22-list");

  await page.getByRole("button", { name: "Thêm kênh" }).click();
  const dialog = page.getByRole("dialog", { name: "Thêm kênh" });
  await expect(dialog.getByRole("button", { name: "Zalo OA" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(dialog.getByText("Chọn ít nhất 1 sự kiện.")).toBeVisible();
  await dialog.getByLabel("Tên kênh *").fill("Quản trị");
  await dialog.getByLabel("Chat ID *").fill("-100555");
  await dialog.getByRole("checkbox", { name: /Sao lưu cloud trễ/ }).check();
  await dialog.getByRole("checkbox", { name: /Ổ lưu video sắp đầy/ }).check();
  await shot(page, "d22-add-dialog");
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã thêm kênh Quản trị.")).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(5);

  await table.getByRole("button", { name: "Gửi thử kênh Quản trị" }).click();
  await expect(page.getByText("Đã gửi tin thử tới Quản trị.")).toBeVisible();
  await expect(
    table.getByRole("row", { name: /Quản trị/ }).getByText(/^Gửi được \d{2}:\d{2}$/),
  ).toBeVisible();

  await table.getByRole("button", { name: "Gửi thử kênh CSKH" }).click();
  await expect(
    table.getByText("Gửi thử lỗi: Telegram không nhận Chat ID này. Kiểm tra bot đã vào nhóm."),
  ).toBeVisible();
  await shot(page, "d22-test-error");

  await page.getByRole("button", { name: "Sửa giờ yên lặng" }).click();
  const quiet = page.getByRole("dialog", { name: "Giờ yên lặng" });
  await quiet.getByLabel("Từ").fill("23:00");
  await quiet.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Giờ yên lặng: 23:00 – 07:00 (chỉ gửi mức Cao)")).toBeVisible();

  await page.getByLabel("Kết quả").selectOption("RETRYING");
  const log = page.getByRole("table", { name: "Nhật ký gửi (30 ngày)" });
  await expect(log.getByRole("row")).toHaveCount(2);
  await log.getByText("Hồ sơ khiếu nại sắp / quá hạn (1 mục)").click();
  await expect(log.getByText(/^\[CAO\] Hồ sơ khiếu nại/)).toBeVisible();

  await table.getByRole("button", { name: "Thao tác khác cho kênh CSKH" }).click();
  await page.getByRole("menuitem", { name: "Xóa kênh" }).click();
  const confirm = page.getByRole("dialog", { name: "Xóa kênh CSKH?" });
  await expect(confirm).toContainText("Tin đang chờ của kênh này bị bỏ.");
  await shot(page, "d22-delete");
  await confirm.getByRole("button", { name: "Xóa kênh" }).click();
  await expect(page.getByText("Đã xóa kênh CSKH.")).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(4);
  // Tin RETRYING của CSKH → DROPPED: lọc "Lỗi · thử lại" còn rỗng.
  await expect(page.getByText("Không có tin khớp bộ lọc.")).toBeVisible();
});

test("D22 ≤ 600 px: bảng → card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adminLogin(page, "tst_admin");
  await page.evaluate(() => {
    history.pushState({}, "", "/admin/settings/notifications");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  const cards = page.getByRole("list", { name: "Kênh thông báo" });
  await expect(cards.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("table", { name: "Kênh thông báo" })).toBeHidden();
  await shot(page, "d22-mobile");
});

test("Quyền: Supervisor không có mục drawer 'Thông báo', URL → D12", async ({ page }) => {
  await adminLogin(page, "tst_sup");
  await expect(page.getByRole("link", { name: "Thông báo" })).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState({}, "", "/admin/settings/notifications");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/admin\/forbidden$/);
});
