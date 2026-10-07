/**
 * Item 03 M15 (T-262) — D23 Sao lưu cloud trên BE thật với MinIO (02b-admin §13; UC-20, FR-02.15, 02.17, EX-K2; 04 §1
 * stack dev: `minio` + `minio-init`, `S3_*`, `BACKUP_ENCRYPTION_KEY` khóa dev, `worker-backup`):
 * - Sau `qa-reset` khóa chưa được xác nhận → banner vàng, "Sao lưu DB ngay" khóa; Kiểm tra kết nối (API-183) → Toast
 *   ghi / đọc / xóa thử thành công trên MinIO.
 * - Xác nhận khóa (API-182): Dialog hiện đúng dấu vân tay API-180, nút khóa tới khi tick → "Đang bật".
 * - Sao lưu DB ngay (API-184 → J-20 pg_dump + mã hóa + tải MinIO) → Toast → lịch sử 14 ngày có lượt "Thành công"
 *   (≤ 3 phút) và thẻ Cơ sở dữ liệu có lần thành công.
 * - D8 dòng "Sao lưu cloud" (API-81 `backup`) → link D23; Supervisor không có D23.
 * Cần BE T-218..T-223, T-272..T-274. Chạy: `E2E_M15_BE=1 pnpm e2e:real e2e/real/phase3-m15-backup.spec.ts`.
 * Trạng thái: CHƯA CHẠY — điều phối chạy sau khi dựng lại stack (T-262, 2026-10-07).
 */
import { expect, test } from "@playwright/test";

import { bearer, loginAdmin, resetData } from "./helpers";

test.skip(!process.env.E2E_M15_BE, "BE M15 (sao lưu cloud + MinIO) — đặt E2E_M15_BE=1 khi chạy e2e:real");

test.beforeEach(() => resetData());

type Backup = { configured: boolean; state: string; key: { fingerprint: string } };

test("UC-20 (BE thật): khóa chưa xác nhận → Kiểm tra kết nối MinIO → xác nhận khóa → Sao lưu DB ngay → lịch sử Thành công", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const admin = await bearer(request, "tst_admin");
  const backup = (await (await request.get("/api/v1/backup", { headers: admin })).json()) as Backup;
  expect(backup.configured, "stack dev phải có S3_* + BACKUP_ENCRYPTION_KEY").toBe(true);

  await loginAdmin(page, "tst_admin");
  await page.getByRole("link", { name: "Sao lưu" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sao lưu cloud" })).toBeVisible();
  await expect(page.getByText(`Khóa giải mã: dấu vân tay ${backup.key.fingerprint}`)).toBeVisible();

  await page.getByRole("button", { name: "Kiểm tra kết nối" }).click();
  await expect(page.getByText("Kết nối kho lưu tốt (ghi, đọc, xóa thử thành công).")).toBeVisible({
    timeout: 20_000,
  });

  if (backup.state === "KEY_UNCONFIRMED") {
    await expect(page.getByText("Sao lưu chưa bật: xác nhận đã cất khóa giải mã.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sao lưu DB ngay" })).toBeDisabled();
    await page.getByRole("button", { name: "Xác nhận" }).click();
    const dialog = page.getByRole("dialog", { name: "Đã cất khóa giải mã?" });
    await expect(dialog).toContainText(`Dấu vân tay: ${backup.key.fingerprint}.`);
    await expect(dialog.getByRole("button", { name: "Bật sao lưu" })).toBeDisabled();
    await dialog.getByLabel("Tôi đã cất bản sao khóa ở nơi an toàn ngoài máy chủ").check();
    await dialog.getByRole("button", { name: "Bật sao lưu" }).click();
    await expect(page.getByText("Đã bật sao lưu cloud.")).toBeVisible();
  }
  await expect(page.getByText("Đang bật", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sao lưu DB ngay" }).click();
  await expect(page.getByText("Đã bắt đầu sao lưu DB.")).toBeVisible();
  const history = page.getByRole("table", { name: "Lịch sử 14 ngày" });
  // WS `backup.updated` + poll 15 giây khi `db.running` → lượt mới chuyển "Thành công" không cần tải lại.
  await expect(history.getByRole("row").filter({ hasText: "Thành công" }).first()).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByRole("region", { name: "Cơ sở dữ liệu" })).not.toContainText(
    "Chưa có lần sao lưu thành công",
  );

  // D8: dòng "Sao lưu cloud" → link D23.
  await page.goto("/admin/settings/storage");
  await page.getByRole("link", { name: /Mở Sao lưu/ }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/backup$/);
});

test("Quyền (BE thật): Supervisor không có mục Sao lưu; URL D23 → D12; API-180 403", async ({
  page,
  request,
}) => {
  const sup = await bearer(request, "tst_sup");
  expect((await request.get("/api/v1/backup", { headers: sup })).status()).toBe(403);
  await loginAdmin(page, "tst_sup");
  await expect(
    page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Sao lưu" }),
  ).toHaveCount(0);
  await page.goto("/admin/settings/backup");
  await expect(page).toHaveURL(/\/admin\/forbidden/);
});
