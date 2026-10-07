/**
 * M10 (T-162) — D14 / D3 / D4 hàng hoàn trên BE thật với dữ liệu `seed-demo` (T-116, DEC-333):
 * - TC-07.37: D14 các tab có số (`tab_counts`) từ seed — Đang về 3 (47, 48 + hồ sơ TAM- trạng thái "Đang về"), Quá hạn
 *   (49), Chỉ hoàn tiền (53), Chưa xác định (TAM-).
 * - TC-07.30: D3 tra mã chiều về `SPXRTTST000049` → D4 kiện 49; TC-07.32: D4 khối "Hàng hoàn" (mã yêu cầu, mã chiều về,
 *   lý do, hồ sơ khiếu nại ĐVVC mẫu).
 * - TC-07.33 + gộp hồ sơ (API-112, DEC-248): kiện chưa xác định đã nhận ở station (API-105 → Hộp rỗng) → D14 "Gắn đơn"
 *   `SPXTST0000049` → "Sẽ gộp vào HH-…" → kiện 49 `RETURN_RECEIVED_ISSUE`, hồ sơ tạm gộp (`merged_into`); hồ sơ TAM- seed
 *   gắn kiện `SPXTST0000011` → `UNANNOUNCED`.
 * - FR-04.11 / API-113: D4 "Sửa kết luận" phiên hoàn đã đóng (Nguyên vẹn → Thiếu hàng) → "Đã sửa 1 lần" + hồ sơ khiếu nại tự tạo.
 * Chạy: `E2E_M10_BE=1 pnpm e2e:real e2e/real/m10-admin-returns.spec.ts`.
 */
import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { bearer, loginAdmin, packageId, resetData, setStation01Kind } from "./helpers";

test.skip(!process.env.E2E_M10_BE, "BE M10 (T-116 seed hàng hoàn) — đặt E2E_M10_BE=1 khi chạy e2e:real");
test.use({ viewport: { width: 1366, height: 768 } });

type ReturnRow = {
  id: string;
  code: string;
  kind: string;
  status: string;
  order: { platform_order_sn: string } | null;
  conclusion: string | null;
  packages: { tracking_number: string; warehouse_status: string }[];
  merged_into: { code: string } | null;
};
type ScanResult = {
  outcome: string;
  state: { session: { id: string; inspection: { lines: Line[] } } | null };
};
type Line = { order_item_id: string; quantity_received: number; condition: string };

/** Station 01 ở chế độ nhận hoàn qua API-100 / 101 (dữ liệu chuẩn bị cho D4 / D14 — UI station đã có spec riêng). */
async function returnStation(request: APIRequestContext) {
  await setStation01Kind(request, "BOTH");
  const st = await bearer(request, "tst_station01", "STATION");
  expect(
    (await request.put("/api/v1/station/work-mode", { headers: st, data: { work_mode: "RETURN" } })).ok(),
  ).toBe(true);
  expect(
    (await request.put("/api/v1/station/operator", { headers: st, data: { name: "Lan QA" } })).ok(),
  ).toBe(true);
  return st;
}

/** Kết luận phiên đang mở (API-102) rồi quét `close` để đóng (API-11). */
async function concludeAndClose(
  request: APIRequestContext,
  st: Record<string, string>,
  opened: ScanResult,
  conclusion: string,
  close: string,
) {
  expect(opened.outcome).toBe("SESSION_OPENED");
  const s = opened.state.session!;
  const lines = s.inspection.lines.map((l) => ({
    order_item_id: l.order_item_id,
    quantity_received: l.quantity_received,
    condition: l.condition,
    note: null,
  }));
  const put = await request.put(`/api/v1/station/sessions/${s.id}/inspection`, {
    headers: st,
    data: { conclusion, note: "", lines },
  });
  expect(put.ok(), await put.text()).toBe(true);
  const closed = (await (
    await request.post("/api/v1/station/scan", {
      headers: st,
      data: { code: close, client_scan_id: randomUUID() },
    })
  ).json()) as ScanResult;
  expect(closed.outcome).toBe("SESSION_COMPLETED");
}

async function returns(request: APIRequestContext, headers: Record<string, string>, tab: string) {
  return (
    (await (await request.get(`/api/v1/returns?tab=${tab}&page_size=100`, { headers })).json()) as {
      items: ReturnRow[];
    }
  ).items;
}

test.beforeEach(() => resetData());

test("TC-07.37 / 07.30 / 07.32 (seed): D14 tab có số → D3 tra mã chiều về → D4 khối Hàng hoàn kiện quá hạn", async ({
  page,
}) => {
  await loginAdmin(page, "tst_cskh");
  await page.getByRole("link", { name: /Hàng hoàn/ }).click();
  // item 03 (T-262): seed Phase 3 (`seed_phase3.py` — yêu cầu trả TikTok / Shopee B) cộng thêm hồ sơ → số tab theo dữ liệu, chỉ
  // kiểm có số; dòng seed Phase 2 vẫn phải có.
  await expect(page.getByRole("tab", { name: /^Đang về \d+$/ })).toHaveAttribute("aria-selected", "true");
  const table = page.getByRole("table", { name: "Danh sách hồ sơ hàng hoàn" });
  await expect(table.getByRole("row").filter({ hasText: "Chiều về SPXRTTST000047" })).toContainText(
    "(2 kiện)",
  );
  await expect(table.getByRole("row").filter({ hasText: "Chiều về SPXRTTST000048" })).toBeVisible();

  await page.getByRole("tab", { name: /^Quá hạn \d+$/ }).click();
  await expect(table.getByRole("row").filter({ hasText: "SPXTST0000049" })).toContainText("8 ngày");
  await page.getByRole("tab", { name: /^Chỉ hoàn tiền \d+$/ }).click();
  const refund = table.getByRole("row").filter({ hasText: "2410TST00053" });
  await expect(refund).toContainText("Thiếu hàng");
  // CSKH có claims.manage → nút tạo hồ sơ ở tab Chỉ hoàn tiền; không có returns.link → không "Gắn đơn".
  await expect(refund.getByRole("button", { name: "Tạo hồ sơ khiếu nại" })).toBeVisible();
  await page.getByRole("tab", { name: /^Chưa xác định \d+$/ }).click();
  const tam = table.getByRole("row").filter({ hasText: /TAM-\d{6}/ });
  await expect(tam).toBeVisible();
  await expect(tam.getByRole("button", { name: "Gắn đơn" })).toHaveCount(0);

  // TC-07.30: D3 quét / nhập mã chiều về → D4 kiện gốc.
  await page.getByRole("link", { name: /Tra cứu đơn/ }).click();
  await page.getByLabel("Mã vận đơn hoặc mã đơn").fill("SPXRTTST000049");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/packages\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: /SPXTST0000049/ })).toBeVisible();

  // TC-07.32: khối Hàng hoàn.
  const block = page.getByRole("region", { name: "Hàng hoàn" });
  await expect(block).toContainText("Yêu cầu 2410RTTST049");
  await expect(block).toContainText("SPXRTTST000049");
  await expect(block).toContainText("Hàng bị hư");
  await expect(block).toContainText("Chưa có kết quả kiểm.");
  await expect(page.getByText(/BR-12/).first()).toBeVisible();
});

test("TC-07.33 + gộp: kiện chưa xác định đã nhận → Gắn đơn SPXTST0000049 (gộp vào hồ sơ quá hạn); TAM- seed → SPXTST0000011", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const st = await returnStation(request);
  // Station: kiện không đọc được mã → API-105 mở phiên chưa xác định → Hộp rỗng → quét lại đóng.
  const opened = (await (
    await request.post("/api/v1/station/return-sessions", {
      headers: st,
      data: { unidentified_code: "SPXVN0000000077", client_scan_id: randomUUID() },
    })
  ).json()) as ScanResult;
  await concludeAndClose(request, st, opened, "EMPTY_BOX", "SPXVN0000000077");
  const sup = await bearer(request, "tst_sup");
  const unidentified = await returns(request, sup, "UNIDENTIFIED");
  expect(unidentified).toHaveLength(2);
  const received = unidentified.find((r) => r.conclusion === "EMPTY_BOX")!;
  const tamReceived = received.packages[0]!.tracking_number;
  const seedTam = unidentified.find((r) => r.id !== received.id)!.packages[0]!.tracking_number;
  const missingCase = (await returns(request, sup, "MISSING")).find((r) =>
    r.packages.some((p) => p.tracking_number === "SPXTST0000049"),
  )!;

  await loginAdmin(page, "tst_sup");
  await page.getByRole("link", { name: /Hàng hoàn/ }).click();
  await page.getByRole("tab", { name: "Chưa xác định 2" }).click();
  const table = page.getByRole("table", { name: "Danh sách hồ sơ hàng hoàn" });
  await table
    .getByRole("row")
    .filter({ hasText: tamReceived })
    .getByRole("button", { name: "Gắn đơn" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Gắn đơn" });
  await dialog.getByLabel("Mã đơn sàn hoặc mã vận đơn gốc").fill("SPXTST0000049");
  await dialog.getByRole("button", { name: "Tìm" }).click();
  const preview = dialog.getByRole("group", { name: "Đơn tìm được" });
  await expect(preview).toContainText("SPXTST0000049");
  await expect(preview).toContainText(`Sẽ gộp vào ${missingCase.code}`);
  await dialog.getByRole("button", { name: "Gắn đơn này" }).click();
  await expect(page.getByText("Đã gắn đơn 2410TST00049.")).toBeVisible();
  const pkg49 = await packageId(request, sup, "SPXTST0000049");
  await expect(page).toHaveURL(new RegExp(`/admin/packages/${pkg49}$`));

  // Phía server: hồ sơ tạm gộp vào hồ sơ quá hạn; kiện 49 đã nhận có vấn đề (BR-24); kiện tạm không còn.
  const all = await returns(request, sup, "ALL");
  const merged = all.find((r) => r.id === received.id)!;
  expect(merged.status).toBe("CANCELLED");
  expect(merged.merged_into?.code).toBe(missingCase.code);
  const target = all.find((r) => r.id === missingCase.id)!;
  expect(target.conclusion).toBe("EMPTY_BOX");
  expect(target.packages[0]!.warehouse_status).toBe("RETURN_RECEIVED_ISSUE");
  expect(all.some((r) => r.packages.some((p) => p.tracking_number === tamReceived))).toBe(false);

  // TAM- của seed (chưa có phiên) → gắn kiện Phase 1 `…011` (đã bàn giao, chưa có hồ sơ) → UNANNOUNCED.
  await page.getByRole("link", { name: /Hàng hoàn/ }).click();
  await page.getByRole("tab", { name: "Chưa xác định 1" }).click();
  await table.getByRole("row").filter({ hasText: seedTam }).getByRole("button", { name: "Gắn đơn" }).click();
  await dialog.getByLabel("Mã đơn sàn hoặc mã vận đơn gốc").fill("SPXTST0000011");
  await dialog.getByRole("button", { name: "Tìm" }).click();
  await expect(dialog.getByRole("group", { name: "Đơn tìm được" })).toContainText("SPXTST0000011");
  await dialog.getByRole("button", { name: "Gắn đơn này" }).click();
  await expect(page.getByText(/^Đã gắn đơn \S+\.$/)).toBeVisible();
  const pkg11 = await packageId(request, sup, "SPXTST0000011");
  await expect(page).toHaveURL(new RegExp(`/admin/packages/${pkg11}$`));
  await expect(page.getByRole("region", { name: "Hàng hoàn" })).toBeVisible();
  const linked = (await returns(request, sup, "ALL")).find((r) =>
    r.packages.some((p) => p.tracking_number === "SPXTST0000011"),
  )!;
  expect(linked.kind).toBe("UNANNOUNCED");
  await page.getByRole("link", { name: /Hàng hoàn/ }).click();
  await page.getByRole("tab", { name: /^Chưa xác định/ }).click();
  await expect(page.getByText("Không có kiện hoàn chưa xác định.")).toBeVisible();
});

test("FR-04.11 / API-113: D4 Sửa kết luận phiên hoàn đã đóng — Nguyên vẹn → Thiếu hàng → Đã sửa 1 lần + hồ sơ khiếu nại tự tạo", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const st = await returnStation(request);
  const opened = (await (
    await request.post("/api/v1/station/scan", {
      headers: st,
      data: { code: "SPXTST0000048-1", client_scan_id: randomUUID() },
    })
  ).json()) as ScanResult;
  await concludeAndClose(request, st, opened, "OK", "SPXTST0000048-1");
  const sup = await bearer(request, "tst_sup");
  const pkg = await packageId(request, sup, "SPXTST0000048-1");

  await loginAdmin(page, "tst_sup");
  await page.goto(`/admin/packages/${pkg}`);
  const block = page.getByRole("region", { name: "Hàng hoàn" });
  await expect(block).toContainText("Người kiểm Lan QA");
  await block.getByRole("button", { name: "Sửa kết luận" }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa kết luận" });
  await dialog.getByLabel("Số nhận Áo thun basic · Đen / L").fill("0");
  await dialog.getByLabel("Tình trạng Áo thun basic · Đen / L").selectOption("MISSING_ITEM");
  // BR-22: có dòng thiếu → Nguyên vẹn khóa.
  await expect(dialog.getByRole("radio", { name: "Nguyên vẹn" })).toBeDisabled();
  await dialog.getByRole("radio", { name: "Thiếu hàng" }).check();
  await dialog.getByRole("button", { name: "Lưu kết luận" }).click();
  await expect(dialog.getByText("Nhập lý do 5–500 ký tự.")).toBeVisible();
  await dialog.getByLabel("Lý do sửa").fill("Kiểm lại camera: hộp thiếu áo");
  await dialog.getByRole("button", { name: "Lưu kết luận" }).click();
  await expect(page.getByText("Đã sửa kết luận.")).toBeVisible();
  await expect(block.getByRole("button", { name: "Đã sửa 1 lần" })).toBeVisible();
  await expect(block).toContainText(/KN-\d{6}/);

  const detail = (await (await request.get(`/api/v1/packages/${pkg}`, { headers: sup })).json()) as {
    warehouse_status: string;
    claims: { type: string; source: string }[];
  };
  expect(detail.warehouse_status).toBe("RETURN_RECEIVED_ISSUE");
  expect(detail.claims.some((c) => c.type === "MISSING_ITEM")).toBe(true);
});

test("TC-03.74 (seed): D2 thẻ Cam 2 không xác minh = số phiên PACK có cờ hôm nay → bấm → D3 lọc cờ đúng các kiện", async ({
  page,
  request,
}) => {
  // Seed đóng gói 7 kiện hàng hoàn mẫu (47-1/-2, 48-1/-2, 49, 52, 53) hôm nay, cờ CAM2_UNVERIFIED (không có Cam 2 thật).
  const sup = await bearer(request, "tst_sup");
  const flagged = (await (
    await request.get("/api/v1/packages?session_flag=CAM2_UNVERIFIED&page_size=100", { headers: sup })
  ).json()) as { items: { tracking_number: string }[] };
  const codes = flagged.items.map((p) => p.tracking_number);
  expect(codes).toEqual(expect.arrayContaining(["SPXTST0000049", "SPXTST0000052", "SPXTST0000047-1"]));

  await loginAdmin(page, "tst_sup");
  await page.getByRole("link", { name: new RegExp(`^Cam 2 không xác minh: ${codes.length}\\.`) }).click();
  await expect(page).toHaveURL(/\/admin\/packages\?session_flag=CAM2_UNVERIFIED/);
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows).toHaveCount(codes.length + 1);
  await expect(rows.filter({ hasText: "SPXTST0000049" })).toBeVisible();
  await expect(rows.filter({ hasText: "SPXTST0000001" })).toHaveCount(0);
});
