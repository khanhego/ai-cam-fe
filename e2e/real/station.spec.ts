/** QA M1 — station với BE thật (04-test-cases M10, M03). Bằng chứng: report list + trace khi lỗi. */
import { expect, test } from "@playwright/test";

import { loginAdmin, loginStation, PASSWORD, resetData, scan, stationReady } from "./helpers";

test.beforeEach(() => resetData());

test("TC-10.01: station đăng nhập đúng → S1, tên station, cookie rt_station", async ({ page, context }) => {
  await loginStation(page);

  await expect(page.getByText("SẴN SÀNG")).toBeVisible();
  await expect(page.getByText("TST Station 01")).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name === "rt_station" && c.httpOnly)).toBe(true);
});

test("TC-10.02: sai mật khẩu → thông báo, ở lại S0", async ({ page }) => {
  await page.goto("/station/login");
  await page.getByLabel("Tài khoản station").fill("tst_station01");
  await page.getByLabel("Mật khẩu").fill("sai-mat-khau");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.getByText("Sai tài khoản hoặc mật khẩu. Kiểm tra lại hoặc hỏi Admin.")).toBeVisible();
  await expect(page).toHaveURL(/\/station\/login/);
});

test("TC-10.03: tài khoản dashboard đăng nhập ở station → bị từ chối", async ({ page }) => {
  await page.goto("/station/login");
  await page.getByLabel("Tài khoản station").fill("tst_cskh");
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(
    page.getByText("Tài khoản này không dùng cho station. Đăng nhập dashboard tại /admin."),
  ).toBeVisible();
});

test("TC-03.01, TC-03.02: quét mở → S2 có sản phẩm; quét lại → S1, Hôm nay 1 kiện", async ({ page }) => {
  await stationReady(page);

  await scan(page, "SPXTST0000012");
  await expect(page.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();
  await expect(page.getByText("SPXTST0000012").first()).toBeVisible();

  await scan(page, "SPXTST0000012");
  await expect(page.getByText("SẴN SÀNG")).toBeVisible();
  await expect(page.getByText("Hôm nay: 1 kiện")).toBeVisible();
});

test("TC-03.04: quét đóng sai mã → lệch mã", async ({ page }) => {
  await stationReady(page);
  await scan(page, "SPXTST0000001");
  await expect(page.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();

  await scan(page, "SPXTST0000002");

  // Chữ S3 theo L3 (item 02 T-136): hai tình huống — quên quét đóng kiện trước / dán nhầm phiếu.
  await expect(page.getByText("LỆCH MÃ — DỪNG LẠI, CHƯA DÁN PHIẾU")).toBeVisible();
  await expect(
    page.getByText("→ Gỡ phiếu SPXTST0000002, dán phiếu SPXTST0000001, quét lại mã."),
  ).toBeVisible();
});

test("TC-03.08: đơn đã hủy trên sàn → cảnh báo, không mở phiên", async ({ page }) => {
  await stationReady(page);

  await scan(page, "SPXTST0000009");

  await expect(page.getByText("ĐƠN ĐÃ HỦY")).toBeVisible();
  await expect(page.getByText("SPXTST0000009 đã bị hủy trên Shopee. Không đóng gói.")).toBeVisible();
});

test("TC-03.09: đơn đã đóng gói → cảnh báo kèm giờ và station", async ({ page }) => {
  await stationReady(page);

  await scan(page, "SPXTST0000010");

  await expect(page.getByText("ĐƠN ĐÃ ĐÓNG GÓI")).toBeVisible();
  await expect(
    page.getByText(/SPXTST0000010 đã đóng gói lúc \d{2}:\d{2} tại TST Station 02\./),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Yêu cầu đóng gói lại/ })).toBeVisible();
});

test("TC-03.10: đơn đã bàn giao → cảnh báo, không có nút đóng gói lại", async ({ page }) => {
  await stationReady(page);

  await scan(page, "SPXTST0000011");

  await expect(page.getByText("ĐƠN ĐÃ BÀN GIAO")).toBeVisible();
  await expect(page.getByRole("button", { name: /Yêu cầu đóng gói lại/ })).toHaveCount(0);
});

test("TC-03.14: mã sai định dạng → mã không hợp lệ", async ({ page }) => {
  await stationReady(page);

  await scan(page, "abc!!12345");

  await expect(page.getByText("MÃ KHÔNG HỢP LỆ")).toBeVisible();
  await expect(page.getByText("Mã vừa quét không phải mã vận đơn. Quét lại mã trên phiếu.")).toBeVisible();
});

test("TC-03.34: mã < 4 ký tự bị bỏ qua, không gọi API", async ({ page }) => {
  await stationReady(page);
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/v1/station/scan")) calls += 1;
  });

  await scan(page, "ABC");
  await page.waitForTimeout(500);

  expect(calls).toBe(0);
  await expect(page.getByText("SẴN SÀNG")).toBeVisible();
});

test("TC-03.18: hủy phiên lý do Hết hàng → về S1", async ({ page }) => {
  await stationReady(page);
  await scan(page, "SPXTST0000005");
  await page.getByRole("button", { name: "Hủy phiên" }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Hết hàng").check();
  await dialog.getByRole("button", { name: "Hủy phiên" }).click();

  await expect(page.getByText("SẴN SÀNG")).toBeVisible();
});

test("TC-03.19: hủy phiên lý do Khác bắt buộc ghi chú", async ({ page }) => {
  await stationReady(page);
  await scan(page, "SPXTST0000006");
  await page.getByRole("button", { name: "Hủy phiên" }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Khác").check();
  await dialog.getByRole("button", { name: "Hủy phiên" }).click();

  await expect(dialog.getByText("Nhập lý do khi chọn Khác")).toBeVisible();
});

test("TC-03.15: kiện đang mở ở station khác → cảnh báo", async ({ page, browser }) => {
  await stationReady(page);
  await scan(page, "SPXTST0000013");
  await expect(page.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  await loginStation(other, "tst_station02");
  await expect(other.getByText("SẴN SÀNG")).toBeVisible();
  await other.locator("body").click({ position: { x: 5, y: 5 } });
  await scan(other, "SPXTST0000013");

  await expect(other.getByText("ĐANG ĐÓNG GÓI Ở STATION KHÁC")).toBeVisible();
});

test("TC-P.10: Supervisor vào /admin/settings/stations → trang không có quyền", async ({ page }) => {
  await loginAdmin(page, "tst_sup");

  await page.goto("/admin/settings/stations");

  await expect(page).toHaveURL(/\/admin\/forbidden/);
  await expect(page.getByText("Tài khoản của bạn không có quyền xem trang này.")).toBeVisible();
});

test("TC-P.10: tài khoản dashboard mở /station → màn đăng nhập station (cookie tách theo client)", async ({
  page,
}) => {
  await loginAdmin(page, "tst_cskh");

  await page.goto("/station");

  await expect(page).toHaveURL(/\/station\/login/);
});
