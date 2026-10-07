/**
 * Item 03 M13 (T-262) — D7 "Kết nối sàn" + lọc sàn trên BE thật với TikTok mock (02b-admin §13 "E2E BE thật": kết nối
 * TikTok mock → đơn xuất hiện D3 lọc TikTok; AC-40, UC-10, EX-T7; 04 §1 `seed_phase3.py`: TikTok `TTMOCKA`
 * "TST TikTok A (mock)", `TTMOCKB` "TST TikTok B (mock)" cùng grant `MOCK-OPEN-1`, đơn `TTTST…`):
 * - AC-40: D7 → "Kết nối TikTok Shop" → API-71 trả callback API-155 của adapter mock (`/api/v1/shops/tiktok/callback?…`,
 *   tương đối) → trình duyệt gọi server (DEC-803) → 302 về D7 `?platform=tiktok&result=connected&count=2` → Toast,
 *   query bị xóa, 2 thẻ TikTok Đã kết nối → D3 lọc sàn TikTok Shop chỉ còn kiện TikTok (`TTTST…`).
 * - EX-T7 / AC-40 "1 shop không kéo shop khác": ngắt "TST TikTok B (mock)" → "Shop đã ngắt (1)", TikTok A vẫn Đã kết nối
 *   → "Kết nối lại TST TikTok B (mock)" → B về Đã kết nối.
 * - RF-41 / API-156: CSKH lọc D3 theo shop TikTok A (không vào được D7).
 * Stack dev: `TIKTOK_ENABLED=true`, `TIKTOK_ADAPTER=mock` (mặc định compose.dev.yml), `SHOPEE_ENABLED=false` → nhóm
 * Shopee hiện Alert chưa cấu hình. Cần BE T-205..T-211, T-207 (API-70..72, 154..156).
 * Chạy: `E2E_M13_BE=1 pnpm e2e:real e2e/real/phase3-m13-platforms.spec.ts`.
 * Trạng thái: CHƯA CHẠY — điều phối chạy sau khi dựng lại stack (T-262, 2026-10-07).
 */
import { expect, test, type Page } from "@playwright/test";

import { loginAdmin, resetData } from "./helpers";

test.skip(
  !process.env.E2E_M13_BE,
  "BE M13 (TikTok mock + seed Phase 3) — đặt E2E_M13_BE=1 khi chạy e2e:real",
);

test.beforeEach(() => resetData());

const group = (page: Page, name: "Shopee" | "TikTok Shop") => page.getByRole("region", { name, exact: true });
const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const TT_A = "TST TikTok A (mock)";
const TT_B = "TST TikTok B (mock)";

test("AC-40 / UC-10 (BE thật): Kết nối TikTok Shop (mock) → 2 shop Đã kết nối → D3 lọc TikTok chỉ còn kiện TikTok", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await loginAdmin(page, "tst_admin");
  await page.getByRole("link", { name: "Kết nối sàn" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kết nối sàn" })).toBeVisible();
  await expect(group(page, "TikTok Shop").getByRole("region", { name: TT_A })).toBeVisible();
  await expect(group(page, "TikTok Shop").getByRole("region", { name: TT_B })).toBeVisible();
  // SHOPEE_ENABLED=false trên stack dev → Alert trong nhóm Shopee, nút khóa sẵn (DEC-607 a).
  await expect(
    group(page, "Shopee").getByText("Chưa cấu hình Shopee Open Platform. Dùng Nhập đơn từ file."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Kết nối Shopee" })).toBeDisabled();

  await page.getByRole("button", { name: "Kết nối TikTok Shop" }).click();
  await expect(
    page.getByText("Đã kết nối 2 shop TikTok Shop. Lần đồng bộ đầu tiên chạy trong vài phút."),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/admin\/settings\/platforms$/);
  for (const name of [TT_A, TT_B])
    await expect(card(page, name).getByText("Đã kết nối", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Tra cứu đơn" }).click();
  await page.getByLabel("Sàn", { exact: true }).selectOption({ label: "TikTok Shop" });
  await expect(page).toHaveURL(/[?&]platform=TIKTOK/);
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows.nth(1)).toBeVisible();
  const n = await rows.count();
  for (let i = 1; i < n; i++) {
    await expect(rows.nth(i).getByRole("img", { name: /^Sàn: TikTok Shop/ })).toBeVisible();
    await expect(rows.nth(i)).toContainText(/TTTST\d+/);
  }
  await expect(rows.filter({ hasText: "SPXTST0000001" })).toHaveCount(0);
});

test("EX-T7 (BE thật): ngắt TikTok B → 'Shop đã ngắt (1)', TikTok A không bị ngắt → Kết nối lại B", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await loginAdmin(page, "tst_admin");
  await page.goto("/admin/settings/platforms");
  const b = card(page, TT_B);
  await b.getByRole("button", { name: `Thao tác khác cho ${TT_B}` }).click();
  await page.getByRole("menuitem", { name: "Ngắt kết nối" }).click();
  await page
    .getByRole("dialog", { name: `Ngắt kết nối ${TT_B}?` })
    .getByRole("button", { name: "Ngắt kết nối" })
    .click();
  await expect(page.getByText(`Đã ngắt kết nối ${TT_B}.`)).toBeVisible();
  await expect(b).toHaveCount(0);
  await expect(card(page, TT_A).getByText("Đã kết nối", { exact: true })).toBeVisible();
  const tiktok = group(page, "TikTok Shop");
  await tiktok.getByText("Shop đã ngắt (1)").click();

  // "Kết nối lại" = ủy quyền lại cả sàn (API-71): grant mock trả cả 2 shop → B về Đã kết nối.
  await tiktok.getByRole("button", { name: `Kết nối lại ${TT_B}` }).click();
  await expect(page.getByText(/^Đã kết nối 2 shop TikTok Shop\./)).toBeVisible({ timeout: 20_000 });
  await expect(card(page, TT_B).getByText("Đã kết nối", { exact: true })).toBeVisible();
  await expect(tiktok.getByText(/^Shop đã ngắt/)).toHaveCount(0);
});

test("RF-41 / API-156 (BE thật): CSKH lọc D3 theo shop TikTok A; không có D7", async ({ page }) => {
  await loginAdmin(page, "tst_cskh");
  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
  await expect(nav.getByRole("link", { name: "Kết nối sàn" })).toHaveCount(0);
  await page.goto("/admin/packages?platform=TIKTOK");
  const shop = page.getByLabel("Shop", { exact: true });
  await expect(shop.getByRole("option", { name: TT_A })).toHaveCount(1);
  await shop.selectOption({ label: TT_A });
  await expect(page).toHaveURL(/[?&]shop=[0-9a-f-]{36}/);
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows.nth(1)).toBeVisible();
  const n = await rows.count();
  for (let i = 1; i < n; i++)
    await expect(rows.nth(i).getByRole("img", { name: `Sàn: TikTok Shop, shop ${TT_A}` })).toBeVisible();
  await page.goto("/admin/settings/platforms");
  await expect(page).toHaveURL(/\/admin\/forbidden/);
});
