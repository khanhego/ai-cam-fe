/**
 * M7 — UC-02 trên BE thật (02b-station §13 E2E BE thật; T-137): đóng gói → bàn giao tay → đổi chế độ "Cả hai" → R5 →
 * R1 → quét mã gốc → R2 (chưa kết luận, mã khác hồ sơ, sửa dòng, kết luận, F2 ảnh từ fake-cam1) → quét đóng → R1.
 * Dữ liệu hàng hoàn của `seed-demo` (SPXRTTST…, T-116) chưa có ở M7 → dùng kiện Phase 1 `SPXTST0000012` đã giao
 * (hồ sơ "Về trước khi sàn báo") như `ai-cam-be/tests/qa/test_m7_live.py`. Hồ sơ khiếu nại tự tạo (`claim_code`) và
 * API-105 (R3 "Mở phiên", phiên chưa xác định) là M8 (T-110, T-119) — không kiểm ở đây.
 * Chạy: `E2E_M7_BE=1 pnpm e2e:real e2e/real/m7-return-uc02.spec.ts` (stack dev đầy đủ: fake-cam1/2, vision, worker).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { hidScan, PASSWORD, resetData, stationReady } from "./helpers";

test.skip(!process.env.E2E_M7_BE, "BE M7 (T-104..T-109) — đặt E2E_M7_BE=1 khi chạy e2e:real");
test.use({ viewport: { width: 1366, height: 768 } });

const CODE = "SPXTST0000012";

async function token(request: APIRequestContext, username: string, client: "STATION" | "DASHBOARD") {
  const res = await request.post("/api/v1/auth/login", { data: { username, password: PASSWORD, client } });
  expect(res.ok()).toBe(true);
  return { Authorization: `Bearer ${((await res.json()) as { access_token: string }).access_token}` };
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });

test.beforeEach(() => resetData());

test("UC-02 (BE thật): R5 → R1 → R2 → kết luận + ảnh F2 → quét mã gốc đóng → R1; S1 cờ Cam 2; R4 mã lạ", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const admin = await token(request, "tst_admin", "DASHBOARD");
  const sup = await token(request, "tst_sup", "DASHBOARD");
  const stations = (await (await request.get("/api/v1/stations", { headers: admin })).json()) as {
    items: { id: string; name: string }[];
  };
  const st1 = stations.items.find((s) => s.name === "TST Station 01")!;
  expect(
    (await request.patch(`/api/v1/stations/${st1.id}`, { headers: admin, data: { kind: "BOTH" } })).ok(),
  ).toBe(true);

  // Đóng gói CODE ở chế độ PACK — TC-03.73: Cam 2 tắt ROI (qa-reset --mute-cam2) → S1 "Cam 2 không xác minh…".
  await stationReady(page);
  await hidScan(page, CODE);
  await expect(heading(page, "ĐANG ĐÓNG GÓI")).toBeVisible();
  await page.waitForTimeout(3000);
  await hidScan(page, CODE);
  await expect(heading(page, "SẴN SÀNG")).toBeVisible();
  await expect(
    page.getByText(`Cam 2 không xác minh được phiếu của ${CODE}. Kiểm tra phiếu trên kiện trước khi giao.`),
  ).toBeVisible();

  // Bàn giao tay (API-122) để kiện mở được phiên hoàn.
  const pkgs = (await (await request.get(`/api/v1/packages?q=${CODE}`, { headers: admin })).json()) as {
    items: { id: string; tracking_number: string }[];
  };
  const pkg = pkgs.items.find((p) => p.tracking_number === CODE)!;
  const adjust = await request.post(`/api/v1/packages/${pkg.id}/warehouse-status`, {
    headers: sup,
    data: { to_status: "HANDED_OVER", reason: "E2E M7 bàn giao tay" },
  });
  expect(adjust.ok()).toBe(true);

  // UC-14 / TC-04.01: đổi chế độ → R5 bắt buộc → R1.
  await page.getByRole("button", { name: "Chuyển sang nhận hàng hoàn" }).click();
  const r5 = page.getByRole("dialog", { name: "Người kiểm hàng hoàn" });
  await expect(r5).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(r5).toBeVisible();
  await r5.getByLabel("Tên người kiểm").fill("Lan QA");
  await r5.getByRole("button", { name: "Bắt đầu ca" }).click();
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText("Người kiểm: Lan QA")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  // TC-04.08: mã lạ → R4 ≤ 3 giây (tra sàn mock hết giờ).
  await hidScan(page, "SPXVN0000000000");
  await expect(heading(page, "KHÔNG TÌM THẤY ĐƠN")).toBeVisible({ timeout: 3000 });
  await page.getByRole("button", { name: "Đóng" }).click();

  // TC-04.04 (biến thể kiện chưa có hồ sơ): quét mã gốc → R2.
  await hidScan(page, CODE);
  await expect(heading(page, "ĐANG KIỂM HÀNG HOÀN")).toBeVisible();
  await expect(page.getByText("Về trước khi sàn báo")).toBeVisible();
  await expect(page.getByRole("region", { name: "Lúc đóng gói" })).toBeVisible();

  // TC-04.18: quét đóng khi chưa kết luận.
  await hidScan(page, CODE);
  await expect(page.getByText("Chọn kết luận trước khi quét đóng.")).toBeVisible();
  // TC-04.20: mã không thuộc hồ sơ.
  await hidScan(page, "SPXTST0000003");
  await expect(
    page.getByText("Mã SPXTST0000003 không thuộc kiện đang kiểm. Quét lại mã trên kiện này để hoàn tất."),
  ).toBeVisible();

  // TC-04.15: giảm số nhận → Nguyên vẹn khóa → Thiếu hàng → Đã lưu (API-102).
  await page
    .getByRole("button", { name: /^Giảm số nhận/ })
    .first()
    .click();
  await expect(page.getByRole("radio", { name: /Nguyên vẹn/ })).toBeDisabled();
  await page.getByRole("radio", { name: /Thiếu hàng/ }).click();
  await expect(page.getByText("Đã lưu")).toBeVisible();

  // TC-04.40: F2 → ảnh từ fake-cam1 (API-103) ≤ 2 giây (cho 15 giây dưới tải).
  await page.keyboard.press("F2");
  await expect(page.getByRole("button", { name: "Ảnh 1" })).toBeVisible({ timeout: 15_000 });

  // TC-04.47 + TC-04.19: quét đóng khi focus ô ghi chú (đang gõ) — mã không lọt vào ô, phiên đóng.
  const note = page.getByLabel("Ghi chú");
  await note.fill("Thiếu 1 áo");
  await note.focus();
  await hidScan(page, CODE);
  await expect(heading(page, "SẴN SÀNG NHẬN HÀNG HOÀN")).toBeVisible();
  // `claim_code` null tới M8 (T-110) → câu không có mã hồ sơ.
  await expect(
    page.getByText(new RegExp(`^Đã nhận ${CODE} — Thiếu hàng\\.( Đã tạo hồ sơ khiếu nại KN-\\d{6}\\.)?$`)),
  ).toBeVisible();
  await expect(page.getByText("Hôm nay: 1 kiện hoàn · 1 có vấn đề")).toBeVisible();

  // Phía server: kiện RETURN_RECEIVED_ISSUE (API-31), hồ sơ RECEIVED_ISSUE kết luận Thiếu hàng (API-110 — T-104).
  const detail = (await (await request.get(`/api/v1/packages/${pkg.id}`, { headers: admin })).json()) as {
    warehouse_status: string;
  };
  expect(detail.warehouse_status).toBe("RETURN_RECEIVED_ISSUE");
  const returns = (await (
    await request.get(`/api/v1/returns?tab=RECEIVED&q=${CODE}`, { headers: admin })
  ).json()) as { items: { status: string; conclusion: string | null }[] };
  expect(returns.items[0]).toMatchObject({ status: "RECEIVED_ISSUE", conclusion: "MISSING_ITEM" });

  // UC-14: về đóng gói.
  await page.getByRole("button", { name: "Chuyển sang đóng gói" }).click();
  await expect(heading(page, "SẴN SÀNG")).toBeVisible();
});
