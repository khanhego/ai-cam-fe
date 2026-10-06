/**
 * M10 (T-162) — UC-02 đủ nhánh trên BE thật với dữ liệu `seed-demo` hàng hoàn (T-116, DEC-333): `…47` trả trọn đơn
 * "Đang về" (`SPXRTTST000047`), `…48` trả một phần, `…49` quá hạn (RETURN_MISSING), `…010` Phase 1 `PACKED`.
 * Không cần Shopee: hồ sơ seed tạo qua service thật. Bổ sung cho `m7-return-uc02.spec.ts` (R5 / R2 / F2 / BR-22):
 * - TC-04.53: kiện hoàn quét ở bàn đóng gói → S4 "ĐƠN ĐÃ BÀN GIAO" + "Đây là kiện hàng hoàn…".
 * - TC-04.04 (seed 47) mở bằng mã chiều về → R2 header; TC-04.19 đóng bằng mã gốc cùng hồ sơ.
 * - TC-04.11: quét lại kiện đã nhận → R4 "KIỆN HOÀN ĐÃ NHẬN" → "Đây là kiện khác — vẫn ghi hình" (API-105 `force_new`).
 * - TC-04.10: kiện `PACKED` → R4 "KIỆN CHƯA GỬI ĐI".
 * - TC-04.08 / 04.45 / 04.09: R4 mã lạ → R3 tìm thủ công (tiền tố mã đơn) → Mở phiên; mở phiên chưa xác định.
 * Chạy: `E2E_M10_BE=1 pnpm e2e:real e2e/real/m10-station-returns.spec.ts` (stack dev, `qa-reset.sh` có seed hàng hoàn).
 */
import { expect, test } from "@playwright/test";

import {
  bearer,
  heading,
  hidScan,
  resetData,
  setStation01Kind,
  stationReady,
  startReturnShift,
} from "./helpers";

test.skip(!process.env.E2E_M10_BE, "BE M10 (T-116 seed hàng hoàn) — đặt E2E_M10_BE=1 khi chạy e2e:real");
test.use({ viewport: { width: 1366, height: 768 } });

type ReturnRow = {
  code: string;
  kind: string;
  status: string;
  conclusion: string | null;
  packages: { tracking_number: string; warehouse_status: string }[];
};

test.beforeEach(async ({ request }) => {
  resetData();
  await setStation01Kind(request, "BOTH");
});

test("UC-02 seed: TC-04.53 kiện hoàn ở bàn đóng gói → R2 mã chiều về 47 → đóng bằng mã gốc → R4 đã nhận → kiện khác (force_new) → R4 chưa gửi đi", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await stationReady(page);

  // TC-04.53 (EX-R16): kiện `…49` đang hoàn (RETURN_MISSING) quét ở chế độ đóng gói — không 500, không mở phiên.
  await hidScan(page, "SPXTST0000049");
  await expect(heading(page, "ĐƠN ĐÃ BÀN GIAO")).toBeVisible();
  await expect(page.getByText(/kiện hàng hoàn — nhận ở bàn nhận hoàn\./)).toBeVisible();
  await expect(heading(page, "SẴN SÀNG")).toBeVisible({ timeout: 10_000 });

  await startReturnShift(page);

  // TC-04.04 (seed 47): mã chiều về → R2 có chip loại, đơn, mã gốc, lý do của khách, dòng sản phẩm.
  await hidScan(page, "SPXRTTST000047");
  await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText("Khách trả hàng", { exact: true })).toBeVisible();
  await expect(page.getByText("Đơn 2410TST00047")).toBeVisible();
  await expect(page.getByText("Mã gốc SPXTST0000047-1")).toBeVisible();
  await expect(page.getByText("Lý do của khách: Hàng bị hư · Áo bị rách ở tay")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Giảm số nhận Áo thun basic/ })).toBeVisible();

  // TC-04.19: kết luận Nguyên vẹn → quét mã gốc (khác loại, cùng hồ sơ) → R1.
  await page.getByRole("radio", { name: /Nguyên vẹn/ }).click();
  await expect(page.getByText("Đã lưu")).toBeVisible();
  await hidScan(page, "SPXTST0000047-1");
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText(/^Đã nhận SPX(RTTST000047|TST0000047-1) — Nguyên vẹn\.$/)).toBeVisible();

  // TC-04.11 (EX-R11, DEC-265): quét lại kiện đã nhận → R4 → "Đây là kiện khác — vẫn ghi hình" → ghi chú → R2 chưa xác định.
  await hidScan(page, "SPXTST0000047-1");
  await expect(heading(page, "KIỆN HOÀN ĐÃ NHẬN")).toBeVisible();
  await expect(page.getByText(/đã nhận lúc .+ tại TST Station 01 — Nguyên vẹn\./)).toBeVisible();
  await page.getByRole("button", { name: "Đây là kiện khác — vẫn ghi hình" }).click();
  const other = page.getByRole("dialog", { name: "Ghi chú kiện khác" });
  await other.getByRole("button", { name: "Mở phiên" }).click();
  await expect(other.getByText("Nhập ghi chú 5–200 ký tự.")).toBeVisible();
  await other.getByLabel("Ghi chú (bắt buộc)").fill("Kiện thứ hai cùng mã");
  await other.getByRole("button", { name: "Mở phiên" }).click();
  await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText("Chưa xác định", { exact: true })).toBeVisible();
  await expect(page.getByText("Chưa có danh sách sản phẩm. Chọn kết luận chung.")).toBeVisible();
  await page.getByRole("radio", { name: /Nguyên vẹn/ }).click();
  await expect(page.getByText("Đã lưu")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await hidScan(page, "SPXTST0000047-1");
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText("Hôm nay: 2 kiện hoàn · 0 có vấn đề")).toBeVisible();

  // Phía server: hồ sơ 47 nhận 1/2 kiện; hồ sơ mới UNIDENTIFIED kiện tạm TAM-, không đụng mã thật.
  const admin = await bearer(request, "tst_admin");
  const all = (await (
    await request.get("/api/v1/returns?tab=ALL&page_size=100", { headers: admin })
  ).json()) as {
    items: ReturnRow[];
  };
  const p47 = all.items
    .find((r) => r.packages.some((p) => p.tracking_number === "SPXTST0000047-1"))!
    .packages.find((p) => p.tracking_number === "SPXTST0000047-1")!;
  expect(p47.warehouse_status).toBe("RETURN_RECEIVED_OK");
  const forced = all.items.filter(
    (r) => r.kind === "UNIDENTIFIED" && r.packages.some((p) => /^TAM-\d{6}$/.test(p.tracking_number)),
  );
  expect(forced.length).toBe(2); // TAM- của seed + kiện khác vừa tạo
  expect(forced.some((r) => r.conclusion === "OK")).toBe(true);

  // TC-04.10 (EX-R6): kiện Phase 1 `…010` PACKED → R4 "KIỆN CHƯA GỬI ĐI", không mở phiên.
  await hidScan(page, "SPXTST0000010");
  await expect(heading(page, "KIỆN CHƯA GỬI ĐI")).toBeVisible();
  await expect(
    page.getByText(/SPXTST0000010 đang ở trạng thái Đã đóng gói trong kho\. Đây không phải hàng hoàn\./),
  ).toBeVisible();
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible({ timeout: 15_000 });
});

test("R4 → R3: mã lạ → Tìm thủ công theo tiền tố mã đơn → Mở phiên 48 (trả một phần) → Hủy; mở phiên chưa xác định → đóng", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await stationReady(page);
  await startReturnShift(page);

  // TC-04.08: mã lạ → R4 ≤ 3 giây, 2 lối thoát.
  await hidScan(page, "SPXVN0000000000");
  await expect(heading(page, "KHÔNG TÌM THẤY ĐƠN")).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole("button", { name: /Mở phiên chưa xác định/ })).toBeVisible();

  // TC-04.45: R3 — tiền tố mã đơn `2410TST0004` → dòng kiện 48-1 → Mở phiên → R2 trả một phần.
  await page.getByRole("button", { name: /Tìm thủ công/ }).click();
  const r3 = page.getByRole("dialog", { name: "Tìm kiện hoàn" });
  await expect(r3.getByText("Không tìm thấy. Kiểm tra lại mã hoặc Mở phiên chưa xác định.")).toBeVisible();
  await r3.getByLabel("Mã vận đơn hoặc mã đơn").fill("2410TST0004");
  await r3.getByRole("button", { name: "Tìm" }).click();
  const row = r3.getByRole("listitem").filter({ hasText: "SPXTST0000048-1" });
  await expect(row).toBeVisible();
  await expect(r3.getByRole("listitem").filter({ hasText: "SPXTST0000047-1" })).toBeVisible();
  await row.getByRole("button", { name: "Mở phiên" }).click();
  await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText("Đơn 2410TST00048")).toBeVisible();
  await expect(page.getByText("Mã gốc SPXTST0000048-1")).toBeVisible();

  // Hủy phiên hoàn (Quét nhầm) → R1, kiện về lại "Đang về".
  await page.getByRole("button", { name: "Hủy phiên" }).click();
  const cancel = page.getByRole("dialog", { name: "Hủy phiên" });
  await cancel.getByLabel("Quét nhầm").check();
  await cancel.getByRole("button", { name: "Hủy phiên" }).click();
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible();

  // TC-04.09: mã lạ → Mở phiên chưa xác định → R2 không có dòng → kết luận Hộp rỗng → quét lại mã đóng.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await hidScan(page, "SPXVN0000000000");
  await expect(heading(page, "KHÔNG TÌM THẤY ĐƠN")).toBeVisible({ timeout: 3000 });
  await page.getByRole("button", { name: /Mở phiên chưa xác định/ }).click();
  await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText("Chưa có danh sách sản phẩm. Chọn kết luận chung.")).toBeVisible();
  await page.getByRole("radio", { name: /Hộp rỗng/ }).click();
  await expect(page.getByText("Đã lưu")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await hidScan(page, "SPXVN0000000000");
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText(/^Đã nhận (SPXVN0000000000|TAM-\d{6}) — Hộp rỗng\./)).toBeVisible();

  const admin = await bearer(request, "tst_admin");
  const un = (await (
    await request.get("/api/v1/returns?tab=UNIDENTIFIED&page_size=100", { headers: admin })
  ).json()) as { items: ReturnRow[] };
  const mine = un.items.find((r) => r.conclusion === "EMPTY_BOX");
  expect(mine, "hồ sơ chưa xác định vừa nhận").toBeTruthy();
  expect(mine!.packages[0]!.tracking_number).toMatch(/^TAM-\d{6}$/);
  const p48 = (await (
    await request.get("/api/v1/returns?tab=EXPECTED&page_size=100", { headers: admin })
  ).json()) as {
    items: ReturnRow[];
  };
  expect(p48.items.some((r) => r.packages.some((p) => p.tracking_number === "SPXTST0000048-1"))).toBe(true);
});
