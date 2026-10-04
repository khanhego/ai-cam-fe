import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, type Page } from "@playwright/test";

export const PASSWORD = "matkhau123";

/** Migrate lại + seed TST + dọn Redis (ai-cam-be/scripts/qa-reset.sh). */
export function resetData() {
  execFileSync(resolve(process.cwd(), "../ai-cam-be/scripts/qa-reset.sh"), { stdio: "ignore" });
}

/** Máy quét HID: gõ liền (≤ 5 ms/phím) rồi Enter. */
export async function scan(page: Page, code: string) {
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press("Enter");
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
