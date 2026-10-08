/**
 * Item 03 M13 (T-235) — station Phase 3 trên BE thật (02b-station §13 "E2E BE thật"; 04 §1 dữ liệu `seed_phase3.py`):
 * - TC-03.83 / 03.81: S2 chip sàn · shop với mock TikTok, kiện gộp `TTTST0000000077`; mã lạ → "Chưa rõ sàn".
 * - TC-03.85: `TTTST0000000050` (yêu cầu hủy `PENDING`) → S4 vàng "ĐƠN ĐANG YÊU CẦU HỦY", không mở phiên.
 * - TC-04.74 / 04.75: bàn hoàn `2410DUP00001` → R4 "MÃ CÓ Ở NHIỀU ĐƠN" → R3 2 dòng chip → Mở phiên dòng TikTok → R2.
 * - AC-62 / BR-37: R2 mở Dialog Hủy phiên trong 60 giây, xác nhận sau giây 60 → server 409 `CANCEL_REQUIRES_SUPERVISOR`
 *   → Toast; khu nút chỉ còn "Gọi quản lý" (đợi đồng hồ thật 61 giây — không cần đồng hồ giả của BE).
 * Cần BE T-205..T-212, T-271, T-288 + `seed_phase3.py` (T-211) trong `qa-reset.sh` (T-229). Mã fixture theo 04 §1 —
 * đổi nếu T-211 đổi. Chạy: `E2E_M13_BE=1 pnpm e2e:real e2e/real/station-phase3.spec.ts`.
 * Trạng thái: CHƯA CHẠY — chờ build lại stack BE M13 (T-235, 2026-10-07).
 */
import { expect, test } from "@playwright/test";

import {
  heading,
  hidScan,
  psql,
  resetData,
  setStation01Kind,
  stationReady,
  startReturnShift,
} from "./helpers";

test.skip(
  !process.env.E2E_M13_BE,
  "BE M13 (TikTok mock + seed Phase 3) — đặt E2E_M13_BE=1 khi chạy e2e:real",
);
test.use({ viewport: { width: 1920, height: 1080 } });

test.beforeEach(async ({ request }) => {
  resetData();
  await setStation01Kind(request, "BOTH");
});

test("TC-03.83 / 03.81 (BE thật): S2 kiện gộp TikTok — chip, banner, đơn từng dòng; kiện lạ → Chưa rõ sàn", async ({
  page,
}) => {
  await stationReady(page);
  await hidScan(page, "TTTST0000000077");
  await expect(heading(page, "ĐANG ĐÓNG GÓI")).toBeVisible();
  await expect(page.getByRole("img", { name: "Sàn: TikTok Shop, shop TST TikTok A (mock)" })).toHaveText(
    "TikTok · TST TikTok A (mock)",
  );
  await expect(page.getByRole("alert").filter({ hasText: "Kiện gộp 2 đơn" })).toHaveText(
    /Kiện gộp 2 đơn: …0771, …0772 — kiểm đủ hàng của cả hai/,
  );
  await expect(page.getByText("(đơn …0771)")).toBeVisible();
  await expect(page.getByText("(đơn …0772)")).toBeVisible();
  await hidScan(page, "TTTST0000000077");
  await expect(heading(page, "SẴN SÀNG")).toBeVisible();

  await hidScan(page, "SPXVN0000000000");
  await expect(heading(page, "ĐANG ĐÓNG GÓI")).toBeVisible();
  await expect(page.getByRole("img", { name: "Chưa rõ sàn" })).toHaveText("Chưa rõ sàn");
});

test("TC-03.85 (BE thật): đơn TikTok đang yêu cầu hủy → S4 vàng, không mở phiên, tự về S1", async ({
  page,
}) => {
  await stationReady(page);
  await hidScan(page, "TTTST0000000050");
  await expect(heading(page, "ĐƠN ĐANG YÊU CẦU HỦY")).toBeVisible();
  // Thân S4 = `message` server "TTTST0000000050: người mua đang xin hủy đơn này. Chờ xử lý trên sàn, chưa đóng gói."
  // (BE sửa theo 01 §10.4 — T-229, DEC-825).
  await expect(
    page.getByText("Người mua đang xin hủy đơn này. Chờ xử lý trên sàn, chưa đóng gói."),
  ).toBeVisible();
  await expect(heading(page, "SẴN SÀNG")).toBeVisible({ timeout: 15_000 });
  await expect(heading(page, "ĐANG ĐÓNG GÓI")).toHaveCount(0);
});

test("TC-04.74 / 04.75 (BE thật): mã đơn trùng 2 shop → R3 chip từng dòng → Mở phiên TikTok → R2 chip TikTok", async ({
  page,
}) => {
  // TC-04.75 tiền điều kiện "đơn TikTok có yêu cầu trả": seed để kiện `TTTST0000000021` `NEW` (chưa gửi) → R3 hiện
  // "KIỆN CHƯA GỬI ĐI", không có "Mở phiên" → đưa kiện TikTok sang "Đã bàn giao" trước (T-229, DEC-826).
  psql("UPDATE package SET warehouse_status = 'HANDED_OVER' WHERE tracking_number = 'TTTST0000000021'");
  await stationReady(page);
  await startReturnShift(page);
  await hidScan(page, "2410DUP00001");

  await expect(heading(page, "MÃ CÓ Ở NHIỀU ĐƠN")).toBeVisible();
  await expect(
    page.getByText("Mã 2410DUP00001 có ở 2 đơn của các shop khác nhau. Chọn đúng đơn."),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Tìm kiện hoàn" });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByLabel("Mã vận đơn hoặc mã đơn")).toHaveValue("2410DUP00001");
  const tiktok = dialog.getByRole("listitem").filter({ hasText: "TTTST0000000021" });
  await expect(
    dialog
      .getByRole("listitem")
      .filter({ hasText: "SPXTSTB000000021" })
      .getByRole("img", { name: "Sàn: Shopee, shop TST B" }),
  ).toBeVisible();
  await expect(tiktok.getByRole("img", { name: "Sàn: TikTok Shop, shop TST TikTok A (mock)" })).toBeVisible();

  await tiktok.getByRole("button", { name: "Mở phiên" }).click();
  await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
  await expect(page.getByRole("img", { name: "Sàn: TikTok Shop, shop TST TikTok A (mock)" })).toBeVisible();
});

test("AC-62 / BR-37 (BE thật): xác nhận Hủy phiên sau giây 60 → 409 → Toast; khu nút chỉ còn Gọi quản lý", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await stationReady(page);
  await startReturnShift(page);
  await hidScan(page, "SPXRTTST000041");
  await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();

  await page.getByRole("button", { name: "Hủy phiên" }).click();
  const dialog = page.getByRole("dialog", { name: "Hủy phiên" });
  await dialog.getByRole("radio", { name: "Quét nhầm" }).check();
  // Đợi qua hạn `self_cancel_until` (giờ server) rồi mới xác nhận — server quyết (DEC-601: Dialog không tự đóng).
  await page.waitForTimeout(62_000);
  await dialog.getByRole("button", { name: "Hủy phiên" }).click();

  // Toast = `message` server (02 §6.2: "Phiên đã quá 60 giây. Bấm Gọi quản lý để hủy.").
  await expect(page.getByText("Phiên đã quá 60 giây. Bấm Gọi quản lý để hủy.")).toBeVisible();
  await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText("Muốn hủy phiên? Bấm Gọi quản lý.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hủy phiên" })).toHaveCount(0);
});
