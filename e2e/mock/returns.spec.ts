/**
 * UC-02 + UC-14 trên MSW (02b-station §13 E2E mock): S1 → đổi chế độ → R5 → R1 → quét mã chiều về → R2 → sửa dòng,
 * kết luận, F2 chụp ảnh, quét trong ô ghi chú → đóng → R1 thông báo + mã KN → chuyển về đóng gói.
 * TC-04.01, 04.04, 04.15, 04.18, 04.21, 04.40, 04.47 (UI, mock); R3 / R4 (TC-04.08, 04.09, 04.45).
 */
import { expect, test, type Page } from "@playwright/test";

import { hidScan } from "../real/helpers";

// Màn kiosk nhỏ nhất (02b-station §9): R2 phải thấy khối Kết luận mà không cần cuộn trang.
test.use({ viewport: { width: 1366, height: 768 } });

async function stationLogin(page: Page) {
  await page.goto("/station/login");
  await page.getByLabel("Tài khoản station").fill("tst_station01");
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "SẴN SÀNG", exact: true })).toBeVisible();
}

async function startReturnShift(page: Page) {
  await page.getByRole("button", { name: "Chuyển sang nhận hàng hoàn" }).click();
  const r5 = page.getByRole("dialog", { name: "Người kiểm" });
  await expect(r5).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(r5).toBeVisible(); // R5 bắt buộc: Esc không đóng
  // Chrome CloseWatcher: Esc lần 2 bỏ qua cancel và đóng <dialog> → phải mở lại (G3-F16).
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(r5).toBeVisible();
  await expect(r5).toHaveJSProperty("open", true);
  await r5.getByLabel("Tên người kiểm").fill("Lan QA");
  await r5.getByRole("button", { name: "Bắt đầu ca" }).click();
  await expect(page.getByRole("heading", { name: "SẴN SÀNG NHẬN HÀNG HOÀN" })).toBeVisible();
  await expect(page.getByText("Người kiểm: Lan QA")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
}

test("UC-02 + UC-14: nhận kiện hoàn Hộp rỗng có ảnh, đóng bằng quét lại khi đang gõ ghi chú", async ({
  page,
}) => {
  await stationLogin(page);
  await startReturnShift(page);

  await hidScan(page, "SPXRTTST000041");
  await expect(page.getByRole("heading", { name: "ĐANG KIỂM HÀNG HOÀN" })).toBeVisible();
  await expect(page.getByText("Khách trả hàng")).toBeVisible();
  await expect(page.getByText("Mã gốc SPXTST0000041")).toBeVisible();
  await expect(page.getByRole("region", { name: "Lúc đóng gói" }).getByRole("img")).toBeVisible();

  // TC-04.18: quét đóng khi chưa kết luận.
  await hidScan(page, "SPXRTTST000041");
  await expect(page.getByText("Chọn kết luận trước khi quét đóng.")).toBeVisible();

  // TC-04.15: giảm số nhận → Nguyên vẹn khóa.
  const minus = page.getByRole("button", { name: /Giảm số nhận Áo thun basic/ });
  await minus.click();
  await minus.click();
  await expect(page.getByRole("radio", { name: /Nguyên vẹn/ })).toBeDisabled();
  await page.getByRole("radio", { name: /Hộp rỗng/ }).click();
  await expect(page.getByText("Đã lưu")).toBeVisible();

  // TC-04.40: F2 chụp ảnh.
  await page.keyboard.press("F2");
  await page.keyboard.press("F2");
  await expect(page.getByRole("button", { name: "Ảnh 2" })).toBeVisible();

  // TC-04.47: quét khi focus ô ghi chú — mã không lọt vào ô, lần quét đóng phiên.
  const note = page.getByLabel("Ghi chú");
  await note.fill("Hộp còn nguyên băng keo");
  await note.focus();
  await hidScan(page, "SPXRTTST000041");

  await expect(page.getByRole("heading", { name: "SẴN SÀNG NHẬN HÀNG HOÀN" })).toBeVisible();
  await expect(
    page.getByText(/^Đã nhận SPXRTTST000041 — Hộp rỗng\. Đã tạo hồ sơ khiếu nại KN-\d{6}\.$/),
  ).toBeVisible();
  await expect(page.getByText("Hôm nay: 1 kiện hoàn · 1 có vấn đề")).toBeVisible();

  // UC-14: về đóng gói.
  await page.getByRole("button", { name: "Chuyển sang đóng gói" }).click();
  await expect(page.getByRole("heading", { name: "SẴN SÀNG", exact: true })).toBeVisible();
});

test("R4 → R3: mã lạ → Tìm thủ công; tìm theo mã đơn → Mở phiên; mở phiên chưa xác định", async ({
  page,
}) => {
  await stationLogin(page);
  await startReturnShift(page);

  await hidScan(page, "SPXVN0000000000");
  await expect(page.getByRole("heading", { name: "KHÔNG TÌM THẤY ĐƠN" })).toBeVisible();
  await page.getByRole("button", { name: /Tìm thủ công/ }).click();
  const r3 = page.getByRole("dialog", { name: "Tìm kiện hoàn" });
  await expect(r3.getByText("Không tìm thấy. Kiểm tra lại mã hoặc Mở phiên chưa xác định.")).toBeVisible();

  await r3.getByLabel("Mã vận đơn hoặc mã đơn").fill("2410TST0004");
  await r3.getByRole("button", { name: "Tìm" }).click();
  await r3
    .getByRole("listitem")
    .filter({ hasText: "SPXTST0000041" })
    .getByRole("button", { name: "Mở phiên" })
    .click();
  await expect(page.getByRole("heading", { name: "ĐANG KIỂM HÀNG HOÀN" })).toBeVisible();

  await page.getByRole("button", { name: "Hủy phiên" }).click();
  const cancel = page.getByRole("dialog", { name: "Hủy phiên" });
  await cancel.getByLabel("Quét nhầm").check();
  await cancel.getByRole("button", { name: "Hủy phiên" }).click();
  await expect(page.getByRole("heading", { name: "SẴN SÀNG NHẬN HÀNG HOÀN" })).toBeVisible();

  await hidScan(page, "SPXVN0000000000");
  await page.getByRole("button", { name: /Mở phiên chưa xác định/ }).click();
  await expect(page.getByText("Chưa có danh sách sản phẩm. Chọn kết luận chung.")).toBeVisible();
});
