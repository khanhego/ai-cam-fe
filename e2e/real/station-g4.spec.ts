/**
 * QA G4 — station với BE thật, các case phụ thuộc trình duyệt thật (DEC-70): nhịp phím máy quét, mất kết nối.
 * TC-03.30, TC-03.31, TC-03.32 (04-test-cases M03). Không dừng container dùng chung: mất mạng giả lập trong
 * trình duyệt (chặn `/api/**` + đóng / từ chối WebSocket `/ws/station`).
 */
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

import { hidScan, resetData, scan, stationReady } from "./helpers";

test.beforeEach(() => resetData());

/** Đếm request API-11 (kể cả request bị chặn khi mất mạng). */
function countScans(page: Page) {
  const counter = { n: 0 };
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/station/scan")) counter.n += 1;
  });
  return counter;
}

test("TC-03.30: station chưa đăng nhập quét → nhắc đăng nhập, không gọi API-11, ô tài khoản không bị điền mã", async ({
  page,
}) => {
  const scans = countScans(page);
  await page.goto("/station/login");
  const username = page.getByLabel("Tài khoản station");
  await expect(username).toBeFocused();

  // Máy quét HID 5 ms/phím (mốc thời gian phần cứng — xem `hidScan`).
  await hidScan(page, "SPXTST0000001");

  await expect(page.getByText("Station chưa đăng nhập. Đăng nhập rồi quét lại.")).toBeVisible();
  await expect(username).toHaveValue("");
  await expect(page.getByLabel("Mật khẩu")).toHaveValue("");
  await expect(page).toHaveURL(/\/station\/login/);
  await page.waitForTimeout(500);
  expect(scans.n).toBe(0);
});

test("TC-03.31: gõ tay 200 ms/phím + Enter → không coi là quét, giữ SẴN SÀNG", async ({ page }) => {
  await stationReady(page);
  const scans = countScans(page);

  await page.keyboard.type("SPXTST0000001", { delay: 200 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);

  expect(scans.n).toBe(0);
  await expect(page.getByText("SẴN SÀNG")).toBeVisible();
  await expect(page.getByText("ĐANG ĐÓNG GÓI")).toHaveCount(0);
});

test("TC-03.32: mất kết nối máy chủ > 5 giây → S6, không nhận quét; có lại → về ĐANG ĐÓNG GÓI rồi đóng được", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // WebSocket station đi qua route để cắt được: khi "mất mạng" kết nối đang mở bị đóng, lần nối lại bị từ chối
  // ngay (không mở). Vite HMR không bị đụng tới (không reload trang).
  let offline = false;
  const live: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/ws\/station/, (ws) => {
    if (offline) {
      void ws.close();
      return;
    }
    ws.connectToServer();
    live.push(ws);
  });
  await stationReady(page);
  await scan(page, "SPXTST0000001");
  await expect(page.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();
  await expect(page.getByText("SPXTST0000001").first()).toBeVisible();
  const scans = countScans(page);

  // Bước 2: cắt mạng tới API (HTTP + WS).
  offline = true;
  await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
  const cutAt = Date.now();
  for (const ws of live.splice(0)) await ws.close();

  // Chưa quá 5 giây: chưa hiện S6.
  await page.waitForTimeout(3000);
  await expect(page.getByText("MẤT KẾT NỐI MÁY CHỦ")).toHaveCount(0);
  await expect(page.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();

  // Bước 3: quá 5 giây → S6, bộ đếm tăng dần.
  await expect(page.getByText("MẤT KẾT NỐI MÁY CHỦ")).toBeVisible({ timeout: 6_000 });
  expect(Date.now() - cutAt).toBeGreaterThanOrEqual(5000);
  await expect(
    page.getByText("Không quét được lúc này. Kiểm tra dây mạng của máy trạm. Hệ thống tự kết nối lại."),
  ).toBeVisible();
  const seconds = async () =>
    Number((await page.getByText(/^Mất kết nối \d+ giây$/).textContent())!.match(/\d+/)![0]);
  const first = await seconds();
  await page.waitForTimeout(2100);
  expect(await seconds()).toBeGreaterThan(first);

  // Bước 4: quét khi mất kết nối → không có request API-11, màn không đổi.
  await scan(page, "SPXTST0000001");
  await page.waitForTimeout(1000);
  expect(scans.n).toBe(0);
  await expect(page.getByText("MẤT KẾT NỐI MÁY CHỦ")).toBeVisible();

  // Bước 5: có mạng lại → ≤ 10 giây về ĐANG ĐÓNG GÓI SPXTST0000001 (đọc lại API-10).
  offline = false;
  await page.unroute("**/api/**");
  await expect(page.getByText("ĐANG ĐÓNG GÓI")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("MẤT KẾT NỐI MÁY CHỦ")).toHaveCount(0);
  await expect(page.getByText("SPXTST0000001").first()).toBeVisible();

  // Bước 6: quét đóng → SESSION_COMPLETED, về SẴN SÀNG.
  const done = page.waitForResponse((r) => r.url().includes("/api/v1/station/scan"));
  await scan(page, "SPXTST0000001");
  expect((await (await done).json()).outcome).toBe("SESSION_COMPLETED");
  await expect(page.getByText("SẴN SÀNG")).toBeVisible();
});
