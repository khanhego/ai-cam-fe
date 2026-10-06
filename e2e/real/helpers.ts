import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, type Page } from "@playwright/test";

export const PASSWORD = "matkhau123";

/** Migrate lại + seed TST + dọn Redis (ai-cam-be/scripts/qa-reset.sh). */
export function resetData() {
  // --mute-cam2: Cam 2 đọc góc khay trống → BR-06 không chặn ngẫu nhiên theo vòng phát của camera giả (QA G4).
  execFileSync(resolve(process.cwd(), "../ai-cam-be/scripts/qa-reset.sh"), ["--mute-cam2"], {
    stdio: "ignore",
  });
}

/** Máy quét HID: gõ liền (≤ 5 ms/phím) rồi Enter. */
/**
 * Máy quét trong E2E: dùng `hidScan` (mốc thời gian cách đều 5 ms như máy quét thật). `keyboard.type` ghi mốc lúc
 * Playwright giao phím → máy dev thiếu RAM có khoảng > 50 ms giữa hai phím, bộ đệm reset giữa chừng và mã bị cụt
 * (vd "XTST0000002" — thấy ở E2E M7).
 */
export async function scan(page: Page, code: string) {
  await hidScan(page, code);
}

/**
 * Máy quét HID có mốc thời gian phần cứng: mỗi phím mang `timestamp` cách nhau 5 ms (như sự kiện OS của máy quét
 * thật), không phụ thuộc lúc Playwright giao phím. `keyboard.type` lấy mốc = lúc giao, nên khi luồng chính của
 * trang khựng ~80 ms (thấy ở /station/login có ô mật khẩu) một khoảng cách bị đo > 50 ms dù máy quét thật vẫn nhận.
 */
export async function hidScan(page: Page, code: string) {
  const cdp = await page.context().newCDPSession(page);
  const base = Date.now() / 1000;
  for (const [i, key] of [...code, "Enter"].entries()) {
    const enter = key === "Enter";
    const vk = enter ? 13 : key.toUpperCase().charCodeAt(0);
    const timestamp = base + i * 0.005;
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: enter ? "Enter" : undefined,
      text: enter ? "\r" : key,
      windowsVirtualKeyCode: vk,
      timestamp,
    });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: vk, timestamp });
  }
  await cdp.detach();
}

export async function loginStation(page: Page, username = "tst_station01") {
  await page.goto("/station/login");
  await page.getByLabel("Tài khoản station").fill(username);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

export async function stationReady(page: Page) {
  await loginStation(page);
  await expect(page.getByText("SẴN SÀNG")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // bỏ focus ô nhập để máy quét gõ vào trang
}

/** Đăng nhập dashboard rồi chờ vào app (cookie rt_dashboard đã có → `goto` sau đó khôi phục phiên được). */
export async function loginAdmin(page: Page, username = "tst_admin") {
  await page.goto("/admin/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
}
