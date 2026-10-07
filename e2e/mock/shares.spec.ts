/**
 * Item 03 M16 trên MSW (02b-admin §13 E2E mock, UC-16 / 17, FR-07.08, 07.09): D21 Link chia sẻ — drawer → tab có số →
 * sao chép → thu hồi (Dialog xác nhận) → tab Đã thu hồi; CSKH không thu hồi link người khác; khối Link ở D17 → "Xem tất
 * cả" → D21 lọc hồ sơ; kho mất Internet (`?cloudOffline=1`) → "Đang thu hồi — chờ Internet".
 * MSW giữ dữ liệu trong bộ nhớ trang → sau đăng nhập điều hướng trong app (`pushState`), không `goto`.
 */
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = (page: Page, name: string) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : Promise.resolve();

async function login(page: Page, user: string, query = "") {
  await page.goto(`/admin/login${query}`);
  await page.getByLabel("Tên đăng nhập").fill(user);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
}

test("UC-17 (T-257): CSKH — D21 tab có số, sao chép, thu hồi link mình tạo; không thu hồi link người khác", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, "tst_cskh");
  await page.getByRole("link", { name: "Link chia sẻ" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Link chia sẻ" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Đang hoạt động 2" })).toHaveAttribute("aria-selected", "true");
  const table = page.getByRole("table", { name: "Danh sách link chia sẻ" });
  const mine = table.getByRole("row").filter({ hasText: "CSKH Shopee – phiếu 98765" });
  const other = table.getByRole("row").filter({ hasText: "Bưu cục Thủ Đức – khiếu nại 5521" });
  await expect(other.getByRole("button", { name: /^Thu hồi/ })).toHaveCount(0);
  await shot(page, "d21-active");

  await mine.getByRole("button", { name: /^Sao chép/ }).click();
  await expect(page.getByText("Đã sao chép link.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https:\/\/.+share-1/);

  await mine.getByRole("button", { name: /^Thu hồi/ }).click();
  const dialog = page.getByRole("dialog", { name: "Thu hồi link?" });
  await expect(dialog).toContainText("Người nhận sẽ không mở được link này nữa (trong vòng 1 phút).");
  await shot(page, "d21-revoke-dialog");
  await dialog.getByRole("button", { name: "Thu hồi link" }).click();
  await expect(page.getByText("Đã thu hồi link.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Đang hoạt động 1" })).toBeVisible();
  await page.getByRole("tab", { name: /^Đã thu hồi/ }).click();
  await expect(table.getByRole("row").filter({ hasText: "CSKH Shopee – phiếu 98765" })).toContainText(
    /Đã thu hồi — Lan|Đang thu hồi — chờ Internet/,
  );
});

test("EX-S7 + D17 (T-257): Supervisor thu hồi khi kho mất Internet; khối Link ở D17 → Xem tất cả", async ({
  page,
}) => {
  await login(page, "tst_sup", "?cloudOffline=1");
  await page.getByRole("link", { name: "Link chia sẻ" }).click();
  const table = page.getByRole("table", { name: "Danh sách link chia sẻ" });
  const row = table.getByRole("row").filter({ hasText: "CSKH Shopee – phiếu 98765" });
  await row.getByRole("button", { name: /^Thu hồi/ }).click();
  await page
    .getByRole("dialog", { name: "Thu hồi link?" })
    .getByRole("button", { name: "Thu hồi link" })
    .click();
  await page.getByRole("tab", { name: /^Đã thu hồi/ }).click();
  await expect(table.getByText("Đang thu hồi — chờ Internet")).toBeVisible();
  await shot(page, "d21-revoke-pending");

  // Nguồn → D17 → khối Link chia sẻ → Xem tất cả → D21 lọc hồ sơ.
  await page.getByRole("tab", { name: /^Tất cả/ }).click();
  const claimLink = table.getByRole("row").filter({ hasText: "Bưu cục Thủ Đức" }).getByRole("link").first();
  const code = (await claimLink.textContent())!.trim();
  await claimLink.click();
  const block = page.getByRole("region", { name: /^Link chia sẻ \(\d+ đang hoạt động\)$/ });
  await expect(block).toBeVisible();
  await shot(page, "d17-shares-block");
  await block.getByRole("link", { name: "Xem tất cả" }).click();
  await expect(page.getByText(`Nguồn: ${code}`)).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Tất cả/ })).toHaveAttribute("aria-selected", "true");
});
