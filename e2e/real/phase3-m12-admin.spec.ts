/**
 * Item 03 M12 (T-262) — dashboard hardening L11 / L13 / L14 / L15 trên BE thật (02b-admin §13 "E2E BE thật"; 04 §1 dữ
 * liệu `seed-demo` + `seed_phase3.py`):
 * - TC-09.20 / FR-09.01 (D2, ADMIN): thẻ "Phiên hoàn hủy / bỏ dở (7 ngày)" → D3 `session_type=RETURN&return_dropped=true`,
 *   số trên thẻ = số kiện D3 trả (cùng luật loại quét nhầm — BR-39).
 * - FR-08.08 / L13 (D14): tab Chỉ hoàn tiền — cột Hạn phản hồi + Hồ sơ khiếu nại, chip "Chỉ chưa xử lý" ghi
 *   `pending_only=true` và gửi API-110.
 * - FR-04.14 / L11 (D13): station mở phiên hoàn → Gọi quản lý → Supervisor "Hủy phiên" phải chọn lý do + ghi chú →
 *   API-21 `reason_code` → station về R1.
 * - FR-08.09 / L15 (D17): bỏ bằng chứng cần lý do (5–500) → "Bằng chứng đã bỏ (1)" → Thêm lại (API-134) trên KN-000001.
 * Cần BE T-213..T-215, T-279, T-281 (M12) + seed hàng hoàn Phase 2 (kiện 47..53, KN-000001).
 * Chạy: `E2E_M12_BE=1 pnpm e2e:real e2e/real/phase3-m12-admin.spec.ts`.
 * Trạng thái: CHƯA CHẠY — điều phối chạy sau khi dựng lại stack (T-262, 2026-10-07).
 */
import { expect, test } from "@playwright/test";

import {
  bearer,
  heading,
  hidScan,
  loginAdmin,
  resetData,
  setStation01Kind,
  stationReady,
  startReturnShift,
} from "./helpers";

test.skip(
  !process.env.E2E_M12_BE,
  "BE M12 (hardening L11 / L13 / L14 / L15) — đặt E2E_M12_BE=1 khi chạy e2e:real",
);

test.beforeEach(() => resetData());

test("TC-09.20 (BE thật): D2 thẻ Phiên hoàn hủy / bỏ dở (7 ngày) → D3 lọc sẵn, số khớp", async ({
  page,
  request,
}) => {
  const admin = await bearer(request, "tst_admin");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
  const daily = (await (
    await request.get(`/api/v1/reports/daily?date=${today}`, { headers: admin })
  ).json()) as {
    counts: { returns_dropped_7d: number };
  };
  const n = daily.counts.returns_dropped_7d;

  await loginAdmin(page, "tst_admin");
  const card = page.getByRole("link", { name: new RegExp(`^Phiên hoàn hủy / bỏ dở \\(7 ngày\\): ${n}\\.`) });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/admin\/packages\?.*session_type=RETURN/);
  await expect(page).toHaveURL(/return_dropped=true/);
  await expect(page.getByText("Phiên hoàn hủy / bỏ dở (trừ quét nhầm)")).toBeVisible();
  // Thẻ đếm phiên, D3 liệt kê kiện (một kiện có thể có nhiều phiên) → có phiên thì có ≥ 1 dòng, không có thì không bảng.
  if (n === 0) await expect(page.getByRole("table")).toHaveCount(0);
  else await expect(page.getByRole("table").getByRole("row").nth(1)).toBeVisible();
});

test("FR-08.08 (BE thật): D14 tab Chỉ hoàn tiền — Hạn phản hồi, Hồ sơ khiếu nại, chip Chỉ chưa xử lý → pending_only", async ({
  page,
}) => {
  await loginAdmin(page, "tst_cskh");
  await page.goto("/admin/returns?tab=NO_PARCEL");
  const table = page.getByRole("table", { name: "Danh sách hồ sơ hàng hoàn" });
  await expect(table.getByRole("columnheader", { name: "Hạn phản hồi" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Hồ sơ khiếu nại" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Sàn · Shop" })).toBeVisible();
  // Seed Phase 2: 2410TST00053 (Chỉ hoàn tiền, Thiếu hàng) — chưa có hồ sơ → nút tạo.
  const refund = table.getByRole("row").filter({ hasText: "2410TST00053" });
  await expect(refund.getByRole("button", { name: "Tạo hồ sơ khiếu nại" })).toBeVisible();

  const toggle = page.getByRole("button", { name: "Chỉ chưa xử lý" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const req = page.waitForRequest(
    (r) => r.url().includes("/api/v1/returns") && r.url().includes("pending_only=true"),
  );
  await toggle.click();
  await req;
  await expect(page).toHaveURL(/pending_only=true/);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // Kiện chưa có hồ sơ vẫn trong danh sách "chưa xử lý".
  await expect(refund).toBeVisible();
});

test("FR-04.14 / L11 (BE thật): D13 Hủy phiên mở hoàn — chọn lý do + ghi chú → API-21 reason_code → station R1", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  await setStation01Kind(request, "BOTH");
  const station = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await stationReady(station);
  await startReturnShift(station);
  // R3 thủ công: tiền tố mã đơn `2410TST0004` → kiện 48-1 → R2 (giống m10-station-returns).
  await hidScan(station, "SPXVN0000000000");
  await expect(heading(station, "KHÔNG TÌM THẤY ĐƠN")).toBeVisible({ timeout: 3000 });
  await station.getByRole("button", { name: /Tìm thủ công/ }).click();
  const r3 = station.getByRole("dialog", { name: "Tìm kiện hoàn" });
  await r3.getByLabel("Mã vận đơn hoặc mã đơn").fill("2410TST0004");
  await r3.getByRole("button", { name: "Tìm" }).click();
  await r3
    .getByRole("listitem")
    .filter({ hasText: "SPXTST0000048-1" })
    .getByRole("button", { name: "Mở phiên" })
    .click();
  await expect(heading(station, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
  await station.getByRole("button", { name: "Gọi quản lý" }).click();
  await expect(station.getByText("ĐANG CHỜ QUẢN LÝ DUYỆT")).toBeVisible();

  const sup = await (await browser.newContext()).newPage();
  await loginAdmin(sup, "tst_sup");
  await sup.goto("/admin/approvals");
  const card = sup.locator("article", { has: sup.getByRole("heading", { name: "TST Station 01" }) });
  await expect(card.getByText("Mở hoàn", { exact: true })).toBeVisible({ timeout: 5_000 });
  await card.getByRole("button", { name: "Hủy phiên" }).click();
  const dialog = sup.getByRole("dialog", { name: "Hủy phiên mở hoàn?" });
  const confirm = dialog.getByRole("button", { name: "Hủy phiên" });
  for (const r of ["Quét nhầm kiện khác", "Không phải kiện hàng hoàn", "Lý do khác (kiện hoàn thật)"])
    await expect(dialog.getByRole("radio", { name: r })).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("radio", { name: "Quét nhầm kiện khác" }).check();
  await expect(
    dialog.getByText("Video phiên này vẫn được giữ nhưng không tự vào hồ sơ khiếu nại của kiện."),
  ).toBeVisible();
  await dialog.getByLabel(/^Ghi chú/).fill("E2E: quét nhầm kiện bên cạnh");
  const decision = sup.waitForRequest((r) => r.url().includes("/decision") && r.method() === "POST");
  await confirm.click();
  expect((await decision).postDataJSON()).toMatchObject({
    action: "CANCEL_SESSION",
    reason_code: "WRONG_SCAN",
    note: "E2E: quét nhầm kiện bên cạnh",
  });
  await expect(sup.getByText("Đã hủy phiên.")).toBeVisible();
  await expect(heading(station, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible({ timeout: 5_000 });
});

test("FR-08.09 / L15 (BE thật): D17 KN-000001 bỏ bằng chứng cần lý do → Bằng chứng đã bỏ → Thêm lại", async ({
  page,
}) => {
  await loginAdmin(page, "tst_cskh");
  await page.goto("/admin/claims?status=ALL&q=KN-000001");
  await page.getByRole("table").getByRole("link", { name: "KN-000001" }).click();
  await expect(page.getByRole("heading", { name: /KN-000001/ })).toBeVisible();

  const remove = page.getByRole("button", { name: /^Bỏ Phiên đóng gói / }).first();
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Bỏ bằng chứng?" });
  await expect(dialog.getByText(/^Clip và ảnh của phiên này được giữ tới \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await dialog.getByRole("button", { name: "Bỏ bằng chứng" }).click();
  await expect(dialog.getByText("Nhập lý do bỏ bằng chứng (5–500 ký tự).")).toBeVisible();
  await dialog.getByLabel(/^Lý do/).fill("E2E: không liên quan khiếu nại thất lạc");
  await dialog.getByRole("button", { name: "Bỏ bằng chứng" }).click();
  await expect(page.getByText("Bằng chứng đã bỏ (1)")).toBeVisible();
  await page.getByText("Bằng chứng đã bỏ (1)").click();
  // Lý do hiện ở dòng "Bỏ bởi …" và ở ghi chú hệ thống "Cập nhật bằng chứng: bỏ 1. Lý do: …" (T-229, DEC-826).
  await expect(
    page.getByText(/^Bỏ bởi Lan lúc .*Lý do: E2E: không liên quan khiếu nại thất lạc/),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Thêm lại Phiên đóng gói/ }).click();
  await expect(page.getByText(/^Bằng chứng đã bỏ/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Bỏ Phiên đóng gói / }).first()).toBeVisible();
});
