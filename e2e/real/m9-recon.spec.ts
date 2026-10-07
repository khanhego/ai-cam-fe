/**
 * M9 — đồng bộ hoàn + đối soát + sàn retention trên BE thật (02b-admin §13 E2E BE thật; T-153, T-156, T-160, T-161):
 * kết nối shop mock (API-71 → callback) → J-13 mock (`tasks.sync_returns()` trong container api) tạo hồ sơ "Đang về"
 * cho yêu cầu trả `2410RTTST041` + "Chỉ hoàn tiền" `2410RTTST044` → D14 (tab có số, mã chiều về) → hạ
 * `return_missing_days` = 1 + đẩy lùi mốc kiện 41 hai ngày (như `ai-cam-be/tests/qa/test_m9_live.py`) → D15 "Chạy đối
 * soát ngay" (API-123, worker queue `default` chạy J-14) → cảnh báo "Hàng hoàn quá 1 ngày chưa về" mức Cao + D2 thẻ
 * "Quá hạn chưa về" → Xử lý "Đánh dấu đã xử lý" → tab Đã xử lý → D8 hạ clip 90 → 70 → Dialog "Giảm thời gian lưu?"
 * (API-82) → "Giảm và lưu".
 * Chạy: `E2E_M9_BE=1 pnpm e2e:real e2e/real/m9-recon.spec.ts` (stack dev `SHOPEE_ENABLED=true` adapter mock, worker,
 * beat). Shopee returns thật: chưa test — thiếu partner T-3.
 */
import { execFileSync } from "node:child_process";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { composeArgs, loginAdmin, PASSWORD, resetData } from "./helpers";

test.skip(!process.env.E2E_M9_BE, "BE M9 (T-105, T-113..T-115) — đặt E2E_M9_BE=1 khi chạy e2e:real");
test.use({ viewport: { width: 1366, height: 768 } });

const COMPOSE = composeArgs();

/** Task Celery chạy ngay trong container api (cùng code + env với worker) — như `_job` của QA M9. */
function job(expr: string): string {
  return execFileSync(
    "docker",
    [...COMPOSE, "exec", "-T", "api", "python", "-c", `from aicam.workers import tasks; print(${expr})`],
    { encoding: "utf8" },
  ).trim();
}

function psql(sql: string): string {
  return execFileSync(
    "docker",
    [...COMPOSE, "exec", "-T", "postgres", "psql", "-U", "aicam", "-d", "aicam", "-tA", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

async function token(request: APIRequestContext, username: string) {
  const res = await request.post("/api/v1/auth/login", {
    data: { username, password: PASSWORD, client: "DASHBOARD" },
  });
  expect(res.ok()).toBe(true);
  return { Authorization: `Bearer ${((await res.json()) as { access_token: string }).access_token}` };
}

/** API-71 (adapter mock): lấy URL + cookie `aicam_shopee_state` rồi gọi callback → shop "Đã kết nối". */
async function connectMockShop(request: APIRequestContext, admin: Record<string, string>) {
  const res = await request.post("/api/v1/shops/shopee/auth-url", { headers: admin });
  expect(res.status(), "cần stack dev SHOPEE_ENABLED=true (adapter mock)").toBe(200);
  const state = /aicam_shopee_state=([^;]+)/.exec(res.headers()["set-cookie"] ?? "")?.[1];
  expect(state).toBeTruthy();
  // Adapter mock trả URL tương đối (callback nội bộ); adapter thật trả URL Shopee tuyệt đối.
  const url = new URL(((await res.json()) as { url: string }).url, "http://localhost");
  const cb = await request.get(`${url.pathname}${url.search}`, {
    headers: { Cookie: `aicam_shopee_state=${state}` },
    maxRedirects: 0,
  });
  // item 03 (02 §6.2 API-72, T-207): callback về D7 mới; BE cũ (trước T-207) còn trả đường `/shopee`.
  expect(cb.headers().location).toMatch(
    // T-262: Shopee mock nhiều shop (`MOCK_SHOPEE_SHOP_IDS`) — một lần ủy quyền có thể trả > 1 shop.
    /^\/admin\/settings\/(platforms\?platform=shopee&result=connected&count=\d+|shopee\?result=connected)$/,
  );
}

test.skip(
  !process.env.E2E_SHOPEE_ENABLED,
  "Cần stack SHOPEE_ENABLED=true (adapter mock) — đặt E2E_SHOPEE_ENABLED=1",
);

test.beforeEach(() => resetData());

test("M9 (BE thật): J-13 mock → D14 Đang về / Chỉ hoàn tiền → API-123 → D15 cảnh báo Cao + D2 → xử lý → D8 hạ retention phải xác nhận", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const admin = await token(request, "tst_admin");
  await connectMockShop(request, admin);
  // Item 03 (T-205): `sync_returns()` không shop = phân phối mỗi shop một task → chạy J-13 đồng bộ cho shop Shopee
  // đầu `990001` (dữ liệu Phase 2) để có kết quả xác định (T-229, DEC-826).
  const shopA = psql("SELECT id FROM shop WHERE platform = 'SHOPEE' AND platform_shop_id = '990001'");
  expect(job(`tasks.sync_shop_returns('${shopA}')`)).toContain("'status': 'OK'");

  // D14 (CSKH): hồ sơ "Đang về" có mã chiều về; tab Chỉ hoàn tiền có yêu cầu 044 (TC-05.30, 05.31, 07.37).
  await loginAdmin(page, "tst_cskh");
  await page.getByRole("link", { name: /Hàng hoàn/ }).click();
  await expect(page.getByRole("tab", { name: /^Đang về \d+$/ })).toHaveAttribute("aria-selected", "true");
  const returns = page.getByRole("table", { name: "Danh sách hồ sơ hàng hoàn" });
  await expect(returns.getByRole("row").filter({ hasText: "Chiều về SPXRTTST000041" })).toContainText(
    "Khách trả hàng",
  );
  await page.getByRole("tab", { name: /^Chỉ hoàn tiền [1-9]/ }).click();
  await expect(returns.getByRole("row").filter({ hasText: "Chỉ hoàn tiền" }).first()).toBeVisible();

  // Tua giờ: ngưỡng chưa về 1 ngày + kiện 41 đang về từ 2 ngày trước (TC-06.01).
  const current = (await (await request.get("/api/v1/settings", { headers: admin })).json()) as Record<
    string,
    number
  >;
  const put = await request.put("/api/v1/settings", {
    headers: admin,
    data: {
      retention_raw_days: current.retention_raw_days,
      retention_clip_days: current.retention_clip_days,
      session_warn_minutes: current.session_warn_minutes,
      session_abandon_minutes: current.session_abandon_minutes,
      return_missing_days: 1,
    },
  });
  expect(put.ok()).toBe(true);
  expect(
    psql(
      "UPDATE package SET status_changed_at = now() - interval '2 days' WHERE tracking_number = 'SPXTST0000041'",
    ),
  ).toBe("UPDATE 1");
  // Đối soát chỉ xét kiện vào "Đang về" sau mốc go-live (`recon_start_at`, DEC G3-C2) — lùi mốc trước lần tua giờ.
  expect(psql("UPDATE setting SET recon_start_at = now() - interval '3 days'")).toBe("UPDATE 1");
  // Đồng hồ BR-12 tính theo mốc hồ sơ vào "Đang về" (`expected_since`, G3 C3), không theo trạng thái kiện.
  expect(
    psql(
      "UPDATE return_case SET expected_since = now() - interval '2 days', created_at = now() - interval '2 days' " +
        "WHERE id IN (SELECT return_case_id FROM return_case_package rcp JOIN package p ON p.id = rcp.package_id " +
        "WHERE p.tracking_number = 'SPXTST0000041')",
    ),
  ).toMatch(/^UPDATE [1-9]/);

  // D15 (Supervisor): Chạy đối soát ngay → cảnh báo mức Cao xuất hiện (WS recon.updated / poll) — TC-06.02, 06.18.
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await loginAdmin(page, "tst_sup");
  await page.getByRole("link", { name: /Lệch trạng thái/ }).click();
  await page.getByRole("button", { name: "Chạy đối soát ngay" }).click();
  await expect(page.getByText(/Đã yêu cầu chạy đối soát|Đối soát đang chạy\./)).toBeVisible();
  const recon = page.getByRole("table", { name: "Danh sách cảnh báo lệch trạng thái" });
  const row = recon.getByRole("row").filter({ hasText: "SPXTST0000041" });
  await expect(async () => {
    await page.reload();
    await expect(row).toContainText("Hàng hoàn quá 1 ngày chưa về", { timeout: 2_000 });
  }).toPass({ timeout: 90_000, intervals: [3_000] });
  await expect(row).toContainText("Cao");
  await expect(row).toContainText("Hoàn quá hạn");

  // D2: thẻ Quá hạn chưa về + Cần xử lý "lệch mức Cao" (TC-09.20 / 09.21 UI).
  await page.getByRole("link", { name: "Tổng quan" }).click();
  await expect(page.getByRole("link", { name: /^Quá hạn chưa về: [1-9]/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cần xử lý" }).getByText(/lệch mức Cao/)).toBeVisible();

  // Xử lý: Đánh dấu đã xử lý (TC-06.12).
  await page.getByRole("link", { name: /Lệch trạng thái/ }).click();
  await row.getByRole("button", { name: /Xử lý/ }).click();
  const dialog = page.getByRole("dialog", { name: "Xử lý cảnh báo" });
  await expect(dialog.getByText("BR-12 Hàng hoàn quá 1 ngày chưa về")).toBeVisible();
  await dialog.getByLabel("Ghi chú").fill("E2E M9 đã gọi ĐVVC");
  await dialog.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đã xử lý cảnh báo.")).toBeVisible();
  await page.getByRole("tab", { name: "Đã xử lý" }).click();
  await expect(recon.getByRole("row").filter({ hasText: "SPXTST0000041" })).toContainText(
    "E2E M9 đã gọi ĐVVC",
  );

  // D8 (Admin): sàn 60 + hạ 90 → 70 phải xác nhận (TC-02.37, 02.38 UI; API-82).
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await loginAdmin(page, "tst_admin");
  await page.goto("/admin/settings/storage");
  await expect(page.getByText(/Tối thiểu \d+ ngày \(cấu hình máy chủ\)\./)).toBeVisible();
  const clip = page.getByLabel("Số ngày giữ clip");
  await clip.fill("45");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText(/Số ngày giữ clip không được thấp hơn \d+\./)).toBeVisible();
  await clip.fill("70");
  await page.getByRole("button", { name: "Lưu" }).click();
  const reduce = page.getByRole("dialog", { name: "Giảm thời gian lưu?" });
  await expect(reduce.getByText(/^Lần dọn tự động lúc 02:00 sẽ xóa [\d.]+ clip/)).toBeVisible();
  await reduce.getByRole("button", { name: "Giảm và lưu" }).click();
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  expect(psql("SELECT count(*) FROM audit_log WHERE action = 'RETENTION_REDUCED'")).toBe("1");
});
