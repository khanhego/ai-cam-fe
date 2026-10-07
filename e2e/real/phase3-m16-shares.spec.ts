/**
 * Item 03 M16 (T-262) — link chia sẻ bằng chứng trên BE thật với MinIO (02b-admin §13 "E2E BE thật": tạo link → mở W1
 * từ MinIO → thu hồi → link chết; UC-16 / 17, FR-07.05, 07.08, AC-52, AC-55; 04 §1 stack dev: `S3_PUBLIC_ENDPOINT`
 * `http://localhost:59000`, bucket `aicam-dev-share`, `worker-export`):
 * - Station đóng gói SPXTST0000001 → clip READY → D4 "Tạo link chia sẻ" (nguồn phiên, API-164) → gửi cho → Tạo link
 *   (API-160) → tiến độ (WS + poll API-162) → "Link đã sẵn sàng" ≤ 3 phút → Sao chép.
 * - W1 (trang tĩnh BE sinh — DEC-428) mở được từ MinIO bằng trình duyệt ngoài dashboard (không cookie) → 200.
 * - D21: dòng mới ở tab Đang hoạt động → Thu hồi (API-163) → tab Đã thu hồi; link W1 chết (≥ 400) ≤ 60 giây (FR-07.08).
 * - D4 khối "Link chia sẻ (n đang hoạt động)" có link vừa tạo (API-31 `shares[]` có `created_at`, `revoke_pending`).
 * Cần BE T-224, T-225, T-286, T-291, T-292 + camera giả. Chạy: `E2E_M16_BE=1 pnpm e2e:real e2e/real/phase3-m16-shares.spec.ts`.
 * Trạng thái: CHƯA CHẠY — điều phối chạy sau khi dựng lại stack (T-262, 2026-10-07).
 */
import { expect, request as pwRequest, test } from "@playwright/test";

import { bearer, loginAdmin, packageId, resetData, scan, stationReady } from "./helpers";

test.skip(!process.env.E2E_M16_BE, "BE M16 (link chia sẻ + MinIO) — đặt E2E_M16_BE=1 khi chạy e2e:real");

test.beforeEach(() => resetData());

const RECIPIENT = "ĐVVC SPX – phiếu E2E 98765";

test("UC-16 / AC-52 / AC-55 (BE thật): D4 tạo link → W1 mở từ MinIO → D21 thu hồi → link chết ≤ 60 giây", async ({
  browser,
  request,
}) => {
  test.setTimeout(480_000);
  // Phiên đóng gói thật để có clip READY (camera giả, ≤ 90 giây sau khi đóng phiên — như admin-g4).
  const station = await (await browser.newContext()).newPage();
  await stationReady(station);
  await scan(station, "SPXTST0000001");
  await expect(station.getByText("ĐANG ĐÓNG GÓI")).toBeVisible();
  await station.waitForTimeout(8000);
  await scan(station, "SPXTST0000001");
  await expect(station.getByText("SẴN SÀNG")).toBeVisible();

  const cskh = await bearer(request, "tst_cskh");
  const id = await packageId(request, cskh, "SPXTST0000001");
  const ctx = await browser.newContext();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  await loginAdmin(page, "tst_cskh");
  await page.goto(`/admin/packages/${id}`);
  await expect(page.getByRole("region", { name: "Clip" }).locator('video[aria-label="Cam 1"]')).toBeVisible({
    timeout: 120_000,
  });

  await page.getByRole("button", { name: "Tạo link chia sẻ" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Tạo link chia sẻ bằng chứng" });
  await expect(dialog.getByText("Kiện SPXTST0000001")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /^Đóng gói/ }).first()).toBeChecked();
  await expect(dialog.getByText("Chưa cấu hình kho lưu cloud. Admin: Cài đặt → Sao lưu.")).toHaveCount(0);
  await dialog.getByLabel(/^Gửi cho/).fill(RECIPIENT);
  await dialog.getByRole("radio", { name: "1 ngày" }).check();
  await dialog.getByRole("button", { name: "Tạo link" }).click();
  await expect(dialog.getByText("Link đã sẵn sàng")).toBeVisible({ timeout: 180_000 });
  await expect(dialog.getByText(`Gửi cho: ${RECIPIENT}`)).toBeVisible();
  await dialog.getByRole("button", { name: "Sao chép link" }).click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/^https?:\/\//);
  await dialog.getByRole("button", { name: "Đóng" }).click();

  // W1: trình duyệt / client ngoài dashboard (không cookie, không Bearer) mở được trang tĩnh trên MinIO.
  const outside = await pwRequest.newContext();
  const w1 = await outside.get(url);
  expect(w1.status(), url).toBe(200);
  expect(w1.headers()["content-type"] ?? "").toContain("text/html");

  // D4 khối Link chia sẻ có link vừa tạo.
  await page.reload();
  const block = page.getByRole("region", { name: /^Link chia sẻ \(\d+ đang hoạt động\)$/ });
  await expect(block.getByText(RECIPIENT)).toBeVisible();

  // D21 → Thu hồi → tab Đã thu hồi.
  await page.getByRole("link", { name: "Link chia sẻ" }).click();
  const table = page.getByRole("table", { name: "Danh sách link chia sẻ" });
  const row = table.getByRole("row").filter({ hasText: RECIPIENT });
  await expect(row).toContainText("SPXTST0000001");
  await row.getByRole("button", { name: /^Thu hồi/ }).click();
  await page
    .getByRole("dialog", { name: "Thu hồi link?" })
    .getByRole("button", { name: "Thu hồi link" })
    .click();
  await expect(page.getByText("Đã thu hồi link.")).toBeVisible();
  await page.getByRole("tab", { name: /^Đã thu hồi/ }).click();
  await expect(table.getByRole("row").filter({ hasText: RECIPIENT })).toContainText(
    /Đã thu hồi — |Đang thu hồi — chờ Internet/,
  );

  // FR-07.08: link chết trong 60 giây (J-25 xóa đối tượng trên MinIO).
  await expect
    .poll(async () => (await outside.get(url)).status(), { timeout: 70_000, intervals: [2_000] })
    .toBeGreaterThanOrEqual(400);
  await expect(table.getByRole("row").filter({ hasText: RECIPIENT })).not.toContainText(
    "Đang thu hồi — chờ Internet",
    { timeout: 30_000 },
  );
  await outside.dispose();
});
