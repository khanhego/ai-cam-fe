/**
 * UC-03 với BE thật (04-test-cases M07, M09): D2 → D3 → D4 → xuất. `pnpm e2e:real admin-uc03`.
 * M8 (T-154): D4 không còn "Giữ clip" (API-42 chỉ ADMIN — TC-02.36); thay bằng chip bảo vệ / gợi ý tạo hồ sơ.
 * Cần stack dev + camera giả (clip READY ≤ 60 giây sau khi đóng phiên).
 */
import { expect, test } from "@playwright/test";

import { loginAdmin, resetData, scan, stationReady } from "./helpers";

test.beforeEach(() => resetData());

test("TC-07.01 + TC-07.07 (UI): đóng phiên ở station → CSKH quét mã ở D3 → D4 có clip → xuất Ghép → tải", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const station = await (await browser.newContext()).newPage();
  await stationReady(station);
  await scan(station, "SPXTST0000001");
  await expect(station.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();
  await station.waitForTimeout(5000);
  await scan(station, "SPXTST0000001");
  await expect(station.getByText("SẴN SÀNG")).toBeVisible();

  const page = await (await browser.newContext()).newPage();
  await loginAdmin(page, "tst_cskh");
  await page.goto("/admin/packages");
  await expect(page.getByLabel("Mã vận đơn hoặc mã đơn")).toBeFocused();
  await scan(page, "SPXTST0000001");
  await expect(page).toHaveURL(/\/admin\/packages\/[0-9a-f-]+$/);

  const clip = page.getByRole("region", { name: "Clip" });
  // TC-02.11: đang cắt → tự hiện player (poll 10 giây), không tải lại trang.
  await expect(clip.locator('video[aria-label="Cam 1"]')).toBeVisible({ timeout: 90_000 });
  // TC-02.36 (M8): API-42 chỉ ADMIN — D4 không còn "Giữ clip"; kiện chưa có hồ sơ → gợi ý tạo hồ sơ (API-31 protection).
  await expect(page.getByRole("button", { name: "Giữ clip" })).toHaveCount(0);
  await expect(clip.getByText("Muốn giữ clip? Tạo hồ sơ khiếu nại.")).toBeVisible();
  await clip.getByRole("button", { name: "Xuất clip" }).click();
  const dialog = page.getByRole("dialog", { name: "Xuất clip" });
  await dialog.getByRole("button", { name: "Tạo file xuất" }).click();
  await expect(dialog.getByRole("link", { name: /Tải file MP4/ })).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByRole("link", { name: "Tải thông tin (JSON)" })).toBeVisible();
});

test("TC-09.03: D2 tự cập nhật thẻ Đã đóng gói ≤ 5 giây sau khi station đóng phiên", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await loginAdmin(page, "tst_sup");
  const card = page.getByRole("link", { name: /^Đã đóng gói: \d+\./ });
  const before = Number((await card.getAttribute("aria-label"))!.match(/: (\d+)\./)![1]);

  const station = await (await browser.newContext()).newPage();
  await stationReady(station);
  await scan(station, "SPXTST0000002");
  await expect(station.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();
  await scan(station, "SPXTST0000002");
  await expect(station.getByText("SẴN SÀNG")).toBeVisible();

  await expect(page.getByRole("link", { name: new RegExp(`^Đã đóng gói: ${before + 1}\\.`) })).toBeVisible({
    timeout: 5_000,
  });
});
