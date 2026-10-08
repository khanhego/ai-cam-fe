/**
 * Item 03 M13 trên MSW (02b-admin §13 E2E mock `platforms.spec.ts`, UC-10 / AC-40; việc treo DEC-607 — T-262):
 * D7 "Kết nối sàn" — drawer → 2 nhóm sàn → Kết nối TikTok Shop (MSW trả thẳng `?platform=tiktok&result=connected&count=2`)
 * → Toast, query bị xóa, shop hết hạn thành Đã kết nối → D3 lọc sàn TikTok; ngắt kết nối → "Shop đã ngắt (n)";
 * link cũ `/admin/settings/shopee?result=denied` → D7 + Alert nhóm Shopee; Supervisor không có D7.
 * Dữ liệu mock (DEC-549): Shopee "TST Shop A", "TST B", "TST Shop cũ" (đã ngắt); TikTok "TST TikTok A (mock)",
 * "TST TikTok B (mock)" (hết hạn). MSW giữ dữ liệu trong bộ nhớ trang → sau đăng nhập điều hướng trong app.
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
async function go(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}
const group = (page: Page, name: "Shopee" | "TikTok Shop") => page.getByRole("region", { name, exact: true });
const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("UC-10 / AC-40 (T-253): Kết nối TikTok Shop → 2 shop → Toast; D3 lọc sàn TikTok chỉ còn đơn TikTok", async ({
  page,
}) => {
  await adminLogin(page, "tst_admin");
  await page.getByRole("link", { name: "Kết nối sàn" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/platforms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Kết nối sàn" })).toBeVisible();
  await expect(group(page, "Shopee").getByRole("region", { name: "TST Shop A" })).toBeVisible();
  const ttB = card(page, "TST TikTok B (mock)");
  await expect(ttB.getByText("Hết hạn", { exact: true })).toBeVisible();
  await expect(ttB.getByRole("button", { name: "Kết nối lại" })).toBeVisible();
  await expect(ttB.getByRole("button", { name: "Đồng bộ ngay" })).toHaveCount(0);
  await shot(page, "d7-before");

  await page.getByRole("button", { name: "Kết nối TikTok Shop" }).click();
  await expect(
    page.getByText("Đã kết nối 2 shop TikTok Shop. Lần đồng bộ đầu tiên chạy trong vài phút."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/settings\/platforms$/);
  await expect(ttB.getByText("Đã kết nối", { exact: true })).toBeVisible();
  await expect(card(page, "TST Shop A").getByText("Đã kết nối", { exact: true })).toBeVisible();
  await shot(page, "d7-connected");

  // D3: lọc sàn TikTok Shop → URL + mọi dòng chip TikTok.
  await page.getByRole("link", { name: "Tra cứu đơn" }).click();
  await page.getByLabel("Sàn", { exact: true }).selectOption({ label: "TikTok Shop" });
  await expect(page).toHaveURL(/[?&]platform=TIKTOK/);
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows.nth(1)).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThan(1);
  for (let i = 1; i < n; i++)
    await expect(rows.nth(i).getByRole("img", { name: /^Sàn: TikTok Shop/ })).toBeVisible();
  await shot(page, "d3-tiktok");
});

test("EX-T7 (T-253): ngắt kết nối shop TikTok → Toast, vào 'Shop đã ngắt (1)' có Kết nối lại; Hủy không đổi", async ({
  page,
}) => {
  await adminLogin(page, "tst_admin");
  await go(page, "/admin/settings/platforms");

  const a = card(page, "TST Shop A");
  await a.getByRole("button", { name: "Thao tác khác cho TST Shop A" }).click();
  await page.getByRole("menuitem", { name: "Ngắt kết nối" }).click();
  await page
    .getByRole("dialog", { name: "Ngắt kết nối TST Shop A?" })
    .getByRole("button", { name: "Hủy" })
    .click();
  await expect(a.getByText("Đã kết nối", { exact: true })).toBeVisible();

  const tt = card(page, "TST TikTok A (mock)");
  await tt.getByRole("button", { name: "Thao tác khác cho TST TikTok A (mock)" }).click();
  await page.getByRole("menuitem", { name: "Ngắt kết nối" }).click();
  const dialog = page.getByRole("dialog", { name: "Ngắt kết nối TST TikTok A (mock)?" });
  await expect(
    dialog.getByText(/Hệ thống ngừng đồng bộ đơn, trạng thái và hàng hoàn của shop này\./),
  ).toBeVisible();
  await shot(page, "d7-disconnect-dialog");
  await dialog.getByRole("button", { name: "Ngắt kết nối" }).click();
  await expect(page.getByText("Đã ngắt kết nối TST TikTok A (mock).")).toBeVisible();
  await expect(tt).toHaveCount(0);
  const tiktok = group(page, "TikTok Shop");
  await tiktok.getByText("Shop đã ngắt (1)").click();
  await expect(tiktok.getByRole("button", { name: "Kết nối lại TST TikTok A (mock)" })).toBeEnabled();
  await shot(page, "d7-disconnected");
});

test("02b-admin §2: link cũ /admin/settings/shopee?result=denied → D7, Alert trong nhóm Shopee, query bị xóa", async ({
  page,
}) => {
  await adminLogin(page, "tst_admin");
  await go(page, "/admin/settings/shopee?result=denied");
  await expect(page).toHaveURL(/\/admin\/settings\/platforms$/);
  await expect(
    group(page, "Shopee").getByText("Shopee từ chối ủy quyền. Bấm Kết nối lại để thử lần nữa."),
  ).toBeVisible();
  await expect(
    group(page, "TikTok Shop").getByText("Shopee từ chối ủy quyền. Bấm Kết nối lại để thử lần nữa."),
  ).toHaveCount(0);
});

test("TC-P.08: Supervisor không có mục 'Kết nối sàn'; mở URL D7 → D12", async ({ page }) => {
  await adminLogin(page, "tst_sup");
  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
  await expect(nav.getByRole("link", { name: /Tổng quan/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Kết nối sàn" })).toHaveCount(0);
  await go(page, "/admin/settings/platforms");
  await expect(page).toHaveURL(/\/admin\/forbidden/);
  await expect(page.getByText("Tài khoản của bạn không có quyền xem trang này.")).toBeVisible();
});
