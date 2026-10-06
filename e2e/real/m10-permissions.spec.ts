/**
 * M10 (T-162) — phân quyền Phase 2 trên BE thật (04 §3 TC-P2.xx P1, 02b-admin §7): ma trận API theo token từng vai
 * (Admin / Supervisor / CSKH / Station) + UI ẩn hành động theo quyền (CSKH không thấy Xử lý / Chạy đối soát / Gắn đơn /
 * Điều chỉnh trạng thái; Supervisor không vào D8 Lưu trữ video). Gọi API ghi bằng id ngẫu nhiên cho vai được phép
 * (mong đợi ≠ 403 — thường 404), để không đổi dữ liệu seed.
 * Chạy: `E2E_M10_BE=1 pnpm e2e:real e2e/real/m10-permissions.spec.ts`.
 */
import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { bearer, loginAdmin, packageId, resetData, setStation01Kind } from "./helpers";

test.skip(!process.env.E2E_M10_BE, "BE M10 (T-116 seed hàng hoàn) — đặt E2E_M10_BE=1 khi chạy e2e:real");
test.use({ viewport: { width: 1366, height: 768 } });

type Role = "ADMIN" | "SUPERVISOR" | "CSKH" | "STATION";
type Call = { method: "GET" | "POST" | "PUT" | "PATCH"; path: string; data?: unknown };

test.beforeEach(() => resetData());

async function tokens(request: APIRequestContext): Promise<Record<Role, Record<string, string>>> {
  return {
    ADMIN: await bearer(request, "tst_admin"),
    SUPERVISOR: await bearer(request, "tst_sup"),
    CSKH: await bearer(request, "tst_cskh"),
    STATION: await bearer(request, "tst_station01", "STATION"),
  };
}

/** `allowed` → status ≠ 401/403; còn lại → 403 (TC-P2.10 404 là P2, không kiểm ở đây). */
async function expectMatrix(
  request: APIRequestContext,
  headers: Record<Role, Record<string, string>>,
  id: string,
  call: Call,
  allowed: Role[],
  skip: Role[] = [],
) {
  for (const role of (["ADMIN", "SUPERVISOR", "CSKH", "STATION"] as Role[]).filter(
    (r) => !skip.includes(r),
  )) {
    const res = await request.fetch(`/api/v1${call.path}`, {
      method: call.method,
      headers: headers[role],
      ...(call.data !== undefined ? { data: call.data } : {}),
    });
    const where = `${id} ${role} ${call.method} ${call.path} → ${res.status()}`;
    if (allowed.includes(role)) expect([401, 403], where).not.toContain(res.status());
    else expect(res.status(), where).toBe(403);
  }
}

test("TC-P2.01..P2.12 (API, P1): ma trận quyền Phase 2 theo vai", async ({ request }) => {
  await setStation01Kind(request, "BOTH");
  const h = await tokens(request);
  const admin = h.ADMIN;
  const stations = (await (await request.get("/api/v1/stations", { headers: admin })).json()) as {
    items: { id: string; name: string; kind: string }[];
  };
  const st1 = stations.items.find((s) => s.name === "TST Station 01")!;
  const rnd = randomUUID();
  const settings = (await (await request.get("/api/v1/settings", { headers: admin })).json()) as Record<
    string,
    unknown
  >;
  const retention = {
    retention_raw_days: settings.retention_raw_days,
    retention_clip_days: settings.retention_clip_days,
    session_warn_minutes: settings.session_warn_minutes,
    session_abandon_minutes: settings.session_abandon_minutes,
  };
  const dash: Role[] = ["ADMIN", "SUPERVISOR", "CSKH"];
  const sup: Role[] = ["ADMIN", "SUPERVISOR"];

  // TC-P2.01: đặt loại station — chỉ Admin (gửi lại đúng loại hiện tại → không đổi dữ liệu).
  await expectMatrix(
    request,
    h,
    "P2.01",
    { method: "PATCH", path: `/stations/${st1.id}`, data: { kind: "BOTH" } },
    ["ADMIN"],
  );
  // TC-P2.02: đổi chế độ / người kiểm — chỉ station (của mình).
  await expectMatrix(
    request,
    h,
    "P2.02",
    { method: "PUT", path: "/station/work-mode", data: { work_mode: "RETURN" } },
    ["STATION"],
  );
  await expectMatrix(
    request,
    h,
    "P2.02",
    { method: "PUT", path: "/station/operator", data: { name: "Lan QA" } },
    ["STATION"],
  );
  // TC-P2.03: tra / mở phiên hoàn, ảnh — chỉ station.
  await expectMatrix(request, h, "P2.03", { method: "GET", path: "/station/return-lookup?q=2410TST0004" }, [
    "STATION",
  ]);
  await expectMatrix(request, h, "P2.03", { method: "POST", path: `/station/sessions/${rnd}/snapshots` }, [
    "STATION",
  ]);
  // TC-P2.05: D14 / API-110, 111.
  await expectMatrix(request, h, "P2.05", { method: "GET", path: "/returns?tab=ALL" }, dash);
  await expectMatrix(request, h, "P2.05", { method: "GET", path: `/returns/${rnd}` }, dash);
  // TC-P2.06: gắn đơn API-112, sửa kết luận API-113 — Admin / Supervisor.
  await expectMatrix(
    request,
    h,
    "P2.06",
    { method: "POST", path: `/returns/${rnd}/link-order`, data: { package_id: rnd } },
    sup,
  );
  await expectMatrix(
    request,
    h,
    "P2.06",
    {
      method: "PUT",
      path: `/sessions/${rnd}/inspection`,
      data: { conclusion: "OK", note: "", lines: [], reason: "Kiểm quyền E2E" },
    },
    sup,
  );
  // TC-P2.07 (P2, kèm): xem cảnh báo.
  await expectMatrix(request, h, "P2.07", { method: "GET", path: "/recon-alerts?status=OPEN" }, dash);
  // TC-P2.08: xử lý cảnh báo API-121, 122 — Admin / Supervisor (API-123 chạy job thật → chỉ kiểm vai bị chặn ở UI).
  await expectMatrix(
    request,
    h,
    "P2.08",
    { method: "POST", path: `/recon-alerts/${rnd}/resolve`, data: { note: "Kiểm quyền" } },
    sup,
  );
  await expectMatrix(
    request,
    h,
    "P2.08",
    {
      method: "POST",
      path: `/packages/${rnd}/warehouse-status`,
      data: { to_status: "HANDED_OVER", reason: "Kiểm quyền" },
    },
    sup,
  );
  // TC-P2.09: hồ sơ khiếu nại API-130..136 — Admin / Supervisor / CSKH.
  await expectMatrix(request, h, "P2.09", { method: "GET", path: "/claims?status=ALL" }, dash);
  await expectMatrix(request, h, "P2.09", { method: "GET", path: `/claims/${rnd}` }, dash);
  await expectMatrix(
    request,
    h,
    "P2.09",
    { method: "POST", path: `/claims/${rnd}/notes`, data: { text: "x" } },
    dash,
  );
  await expectMatrix(request, h, "P2.09", { method: "POST", path: `/claims/${rnd}/evidence-packs` }, dash);
  // TC-P2.11: giữ clip API-42 — chỉ Admin.
  await expectMatrix(
    request,
    h,
    "P2.11",
    { method: "PUT", path: `/clips/${rnd}/hold`, data: { held: true } },
    ["ADMIN"],
  );
  // TC-P2.12: cài đặt PUT API-80 + API-82 — chỉ Admin; GET API-80 Supervisor được.
  await expectMatrix(request, h, "P2.12", { method: "PUT", path: "/settings", data: retention }, ["ADMIN"]);
  await expectMatrix(
    request,
    h,
    "P2.12",
    { method: "GET", path: "/settings/retention-impact?clip_days=70" },
    ["ADMIN"],
  );
  // GET API-80: ma trận chỉ ghi Supervisor ✅ — CSKH không ghi → không kiểm.
  await expectMatrix(
    request,
    h,
    "P2.12",
    { method: "GET", path: "/settings" },
    ["ADMIN", "SUPERVISOR"],
    ["CSKH"],
  );
});

test("Quyền UI Phase 2: CSKH chỉ xem D15 / D14 / D4 (không Xử lý, Chạy đối soát, Gắn đơn, Điều chỉnh); Supervisor có; Supervisor không vào D8", async ({
  page,
  request,
}) => {
  const id49 = await packageId(request, await bearer(request, "tst_cskh"), "SPXTST0000049");

  await loginAdmin(page, "tst_cskh");
  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
  await expect(nav.getByRole("link", { name: /Hàng hoàn/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Lệch trạng thái/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Hồ sơ khiếu nại/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Lưu trữ video/ })).toHaveCount(0);

  await nav.getByRole("link", { name: /Lệch trạng thái/ }).click();
  const recon = page.getByRole("table", { name: "Danh sách cảnh báo lệch trạng thái" });
  await expect(recon.getByRole("row").filter({ hasText: "SPXTST0000049" })).toBeVisible();
  await expect(recon.getByRole("button", { name: /Xử lý/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chạy đối soát ngay" })).toHaveCount(0);

  await page.goto("/admin/returns?tab=UNIDENTIFIED");
  const returns = page.getByRole("table", { name: "Danh sách hồ sơ hàng hoàn" });
  await expect(returns.getByRole("row").filter({ hasText: /TAM-\d{6}/ })).toBeVisible();
  await expect(returns.getByRole("button", { name: "Gắn đơn" })).toHaveCount(0);

  await page.goto(`/admin/packages/${id49}`);
  await expect(page.getByRole("region", { name: "Hàng hoàn" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo hồ sơ khiếu nại" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Điều chỉnh trạng thái" })).toHaveCount(0);

  // Supervisor: có Xử lý / Chạy đối soát / Gắn đơn / Điều chỉnh; D8 (Admin) → không có quyền.
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await loginAdmin(page, "tst_sup");
  await page.goto("/admin/recon");
  await expect(recon.getByRole("button", { name: /Xử lý/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Chạy đối soát ngay" })).toBeVisible();
  await page.goto("/admin/returns?tab=UNIDENTIFIED");
  await expect(returns.getByRole("button", { name: "Gắn đơn" })).toBeVisible();
  await page.goto(`/admin/packages/${id49}`);
  await expect(page.getByRole("button", { name: "Điều chỉnh trạng thái" })).toBeVisible();
  await page.goto("/admin/settings/storage");
  await expect(page).toHaveURL(/\/admin\/forbidden/);
  await expect(page.getByText("Tài khoản của bạn không có quyền xem trang này.")).toBeVisible();
});
