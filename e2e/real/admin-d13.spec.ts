/**
 * UC-08 / TC-03.51 (bước 1–5), TC-03.40 với BE thật: station gửi yêu cầu → Supervisor duyệt trên D13 → station đổi
 * trạng thái ≤ 2 giây (AC-19). Cần BE T-13 (API-13/14/20/21 + WS-02 `approval.*`): chạy với `E2E_M3_BE=1`.
 */
import { expect, test, type Browser } from "@playwright/test";

import { loginAdmin, resetData, scan, stationReady } from "./helpers";

test.skip(!process.env.E2E_M3_BE, "Chờ BE T-13 (API-13/14/20/21) — chạy với E2E_M3_BE=1");
test.beforeEach(() => resetData());

async function openPair(browser: Browser) {
  const station = await (await browser.newContext()).newPage();
  const sup = await (await browser.newContext()).newPage();
  await stationReady(station);
  await loginAdmin(sup, "tst_sup");
  await sup.goto("/admin/approvals");
  return { station, sup };
}

test("TC-03.51: đóng gói lại — station gửi REPACK → Supervisor duyệt → station mở phiên đóng gói lại", async ({
  browser,
}) => {
  const { station, sup } = await openPair(browser);

  await scan(station, "SPXTST0000010");
  await station.getByRole("button", { name: /Yêu cầu đóng gói lại/ }).click();
  await expect(station.getByText("ĐANG CHỜ QUẢN LÝ DUYỆT")).toBeVisible();

  const card = sup.locator("article", { has: sup.getByRole("heading", { name: "TST Station 01" }) });
  await expect(card.getByText("Đóng gói lại", { exact: true })).toBeVisible({ timeout: 2_000 });
  await expect(card.getByText("SPXTST0000010")).toBeVisible();
  await expect(sup.getByRole("link", { name: /^Yêu cầu duyệt\s*,\s*1 yêu cầu đang chờ$/ })).toBeVisible();

  await card.getByRole("button", { name: "Duyệt đóng gói lại" }).click();
  await expect(sup.getByText("Đã duyệt đóng gói lại.")).toBeVisible();
  await expect(station.getByText("ĐANG ĐÓNG GÓI")).toBeVisible({ timeout: 2_000 });
  await expect(station.getByText("Đóng gói lại", { exact: true })).toBeVisible();

  await station.locator("body").click({ position: { x: 5, y: 5 } });
  await scan(station, "SPXTST0000010");
  await expect(station.getByText("SẴN SÀNG")).toBeVisible();
});

test("TC-03.40: lệch mã → Gọi quản lý → Cho tiếp tục → station về ĐANG ĐÓNG GÓI ≤ 2 giây", async ({
  browser,
}) => {
  const { station, sup } = await openPair(browser);

  await scan(station, "SPXTST0000001");
  await expect(station.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();
  await scan(station, "SPXTST0000002");
  await station.getByRole("button", { name: /Gọi quản lý/ }).click();
  await expect(station.getByText("ĐANG CHỜ QUẢN LÝ DUYỆT")).toBeVisible();

  const card = sup.locator("article", { has: sup.getByRole("heading", { name: "TST Station 01" }) });
  await expect(card.getByText("Lệch mã", { exact: true })).toBeVisible({ timeout: 2_000 });
  await expect(card.getByText("SPXTST0000002")).toBeVisible();

  await card.getByRole("button", { name: "Cho tiếp tục" }).click();
  await expect(station.getByText("ĐANG ĐÓNG GÓI")).toBeVisible({ timeout: 2_000 });
  await expect(sup.getByText("Không có yêu cầu nào đang chờ.")).toBeVisible();
});
