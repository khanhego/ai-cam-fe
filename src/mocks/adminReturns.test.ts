/**
 * API client dashboard item 02 + MSW handler đúng contract 02 §6.2 v0.4 (T-151). Mock đã đối chiếu BE thật M6–M9
 * (ai-cam-be T-102..T-115, openapi): chỉ dùng cho dev / test FE; E2E BE thật ở `e2e/real/`.
 */
import { fetchMe, hasPermission, login } from "@/lib/api/auth";
import { claimsApi } from "@/lib/api/claims";
import { clipsApi } from "@/lib/api/clips";
import { isApiError, type ApiError } from "@/lib/api/errors";
import { packagesApi } from "@/lib/api/packages";
import { reconApi } from "@/lib/api/recon";
import { reportsApi } from "@/lib/api/reports";
import { returnsApi } from "@/lib/api/returns";
import { settingsApi } from "@/lib/api/settings";
import { stationsApi } from "@/lib/api/stations";
import { vnDay } from "@/shared/format";

import { mockSettings } from "./handlers/settings";
import { findPackage, mockClaims } from "./returnsDb";
import { stationSim } from "./stationSim";

const fail = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return e;
    throw e;
  }
  throw new Error("expected ApiError");
};
const as = (u: "tst_admin" | "tst_sup" | "tst_cskh" | "tst_station01") =>
  login(u, "matkhau123", u === "tst_station01" ? "STATION" : "DASHBOARD");

test("API-04: permissions mới theo vai (FR-10.02); CSKH không có recon.resolve / returns.link", async () => {
  await as("tst_sup");
  const sup = await fetchMe();
  expect(
    ["returns.link", "recon.resolve", "warehouse_status.adjust", "claims.manage"].every((p) =>
      hasPermission(sup, p),
    ),
  ).toBe(true);
  await as("tst_cskh");
  const cskh = await fetchMe();
  expect(hasPermission(cskh, "claims.manage")).toBe(true);
  expect(hasPermission(cskh, "recon.resolve")).toBe(false);
  expect(hasPermission(cskh, "returns.link")).toBe(false);
  // C-01: giữ clip chỉ Admin (BE không cấp clips.hold cho SUPERVISOR / CSKH).
  expect(hasPermission(cskh, "clips.hold")).toBe(false);
  expect(hasPermission(sup, "clips.hold")).toBe(false);
});

test("TC-P2.05: D14 API-110 — tab mặc định Đang về, tab_counts; STATION 403", async () => {
  await as("tst_cskh");
  const r = await returnsApi.list({});
  expect(r.items.every((i) => ["EXPECTED", "INSPECTING", "PARTIALLY_RECEIVED"].includes(i.status))).toBe(
    true,
  );
  // NO_PARCEL: HH-000044 + HH-000061 (TikTok Chỉ hoàn tiền — item 03).
  expect(r.tab_counts).toMatchObject({ MISSING: 1, NO_PARCEL: 2, UNIDENTIFIED: 1 });
  expect(r.total).toBe(r.tab_counts.EXPECTED);
  const hh41 = r.items.find((i) => i.code === "HH-000041")!;
  expect(hh41).toMatchObject({
    kind: "BUYER_RETURN",
    return_tracking_number: "SPXRTTST000041",
    reason_label: "Hàng bị hư",
  });
  expect((await returnsApi.list({ tab: "RECEIVED" })).items.map((i) => i.code)).toContain("HH-000053");
  expect((await returnsApi.list({ tab: "ALL", q: "spxrttst000041" })).items).toHaveLength(1);
  expect((await returnsApi.list({ tab: "ALL", kind: "REFUND_ONLY" })).items.map((i) => i.code)).toEqual([
    "HH-000061",
    "HH-000044",
  ]);
  const detail = await returnsApi.get(hh41.id);
  expect(detail).toMatchObject({
    platform_return_sn: "2410RTTST041",
    needs_parcel: true,
    source: "PLATFORM",
  });
  expect(detail.requested_items[0]).toMatchObject({ product_name: "Áo thun basic", quantity: 2 });
  await as("tst_station01");
  expect((await fail(returnsApi.list({}))).status).toBe(403);
});

test("TC-P2.06 / UC-13: API-112 gắn đơn — CSKH 403; kiện chưa rời kho NOT_ELIGIBLE; gắn được → kiện tạm biến mất", async () => {
  await as("tst_cskh");
  const un = (await returnsApi.list({ tab: "UNIDENTIFIED" })).items[0]!;
  expect((await fail(returnsApi.linkOrder(un.id, "pkg-0000046"))).status).toBe(403);
  await as("tst_sup");
  expect((await fail(returnsApi.linkOrder(un.id, "pkg-0000012"))).code).toBe("NOT_ELIGIBLE");
  expect((await fail(returnsApi.linkOrder("rc-000041", "pkg-0000046"))).code).toBe("NOT_UNIDENTIFIED");
  const r = await returnsApi.linkOrder(un.id, "pkg-0000046");
  expect(r).toMatchObject({
    kind: "UNANNOUNCED",
    order: { platform_order_sn: "2410TST00046" },
    merged_into: null,
  });
  expect(findPackage("pkg-0000046")!.warehouse_status).toBe("RETURN_RECEIVED_ISSUE");
  expect(findPackage("pkg-TAM-000001")).toBeUndefined();
  expect(mockClaims.find((c) => c.code === "KN-000123")!.package_id).toBe("pkg-0000046");
});

test("API-112: đơn đã có hồ sơ mở → gộp vào hồ sơ đó (merged_into)", async () => {
  await as("tst_admin");
  const un = (await returnsApi.list({ tab: "UNIDENTIFIED" })).items[0]!;
  const r = await returnsApi.linkOrder(un.id, "pkg-0000045");
  expect(r.code).toBe("HH-000045");
  expect(r.merged_into).toMatchObject({ code: "HH-000045" });
});

test("TC-04.xx (FR-04.11): API-113 sửa kết luận — lý do bắt buộc, BR-22, chuyển OK ⇄ ISSUE + đóng hồ sơ tự động NEW", async () => {
  await as("tst_sup");
  const pkg = await packagesApi.get("pkg-0000053");
  const s = pkg.sessions.find((x) => x.type === "RETURN")!;
  expect(s.can_correct).toBe(true);
  expect(s.inspection?.conclusion).toBe("EMPTY_BOX");
  const lines = s.inspection!.lines.map((l) => ({
    order_item_id: l.order_item_id,
    quantity_received: l.quantity_requested,
    condition: "OK" as const,
    note: null,
  }));
  expect(
    (await fail(returnsApi.correctInspection(s.id, { conclusion: "OK", note: "", lines, reason: "x" })))
      .fieldErrors,
  ).toHaveProperty("reason");
  const short = lines.map((l) => ({ ...l, quantity_received: 0 }));
  expect(
    (
      await fail(
        returnsApi.correctInspection(s.id, { conclusion: "OK", note: "", lines: short, reason: "Chọn nhầm" }),
      )
    ).code,
  ).toBe("CONCLUSION_INCONSISTENT");
  const fixed = await returnsApi.correctInspection(s.id, {
    conclusion: "OK",
    note: "",
    lines,
    reason: "Người kiểm chọn nhầm",
  });
  expect(fixed.flags).toContain("INSPECTION_CORRECTED");
  expect(fixed.inspection?.corrections?.[0]).toMatchObject({
    reason: "Người kiểm chọn nhầm",
    before: { conclusion: "EMPTY_BOX" },
  });
  expect(findPackage("pkg-0000053")!.warehouse_status).toBe("RETURN_RECEIVED_OK");
  expect(mockClaims.find((c) => c.code === "KN-000124")).toMatchObject({
    status: "CLOSED",
    close_reason: "Kết luận đã sửa thành Nguyên vẹn",
  });
  await as("tst_cskh");
  expect(
    (await fail(returnsApi.correctInspection(s.id, { conclusion: "OK", note: "", lines, reason: "abcde" })))
      .status,
  ).toBe(403);
});

test("API-31 mở rộng: khối hàng hoàn, cảnh báo, hồ sơ, bảo vệ clip; allowed_status_targets theo trạng thái kho (như BE, mọi vai)", async () => {
  await as("tst_admin");
  const d = await packagesApi.get("pkg-0000049");
  expect(d.return_cases[0]).toMatchObject({ code: "HH-000049", status: "MISSING" });
  expect(d.recon_alerts[0]).toMatchObject({ rule: "RETURN_OVERDUE", severity: "HIGH", status: "OPEN" });
  expect(d.claims.map((c) => c.code)).toContain("KN-000121");
  expect(d.allowed_status_targets).toEqual(["RETURN_EXPECTED", "DELIVERED"]);
  const pack = d.sessions.find((s) => s.type === "PACK")!;
  expect(pack.pack_snapshot?.url).toMatch(/media\/snapshots/);
  expect(pack.clips[0]!.protection?.reasons).toEqual(expect.arrayContaining(["CLAIM", "RETURN_CASE"]));
  // BE `orders/packages.detail`: không lọc theo vai — FE ẩn nút theo quyền `warehouse_status.adjust`.
  await as("tst_cskh");
  expect((await packagesApi.get("pkg-0000049")).allowed_status_targets).toEqual([
    "RETURN_EXPECTED",
    "DELIVERED",
  ]);
});

test("API-30 mở rộng: q mã chiều về / HH-, lọc loại phiên, return_case + is_placeholder", async () => {
  await as("tst_cskh");
  const byReturn = await packagesApi.search({ q: "SPXRTTST000041" });
  expect(byReturn.items.map((i) => i.tracking_number)).toEqual(["SPXTST0000041"]);
  expect(byReturn.items[0]!.return_case).toMatchObject({ code: "HH-000041", kind: "BUYER_RETURN" });
  expect((await packagesApi.search({ q: "HH-000043" })).total).toBe(2);
  const ret = await packagesApi.search({ session_type: "RETURN" });
  expect(ret.items.some((i) => i.is_placeholder)).toBe(true);
});

test("TC-P2.08 / FR-06.05: API-122 điều chỉnh tay — lý do 5–500, chuyển không hợp lệ (details.allowed), kèm cảnh báo → RESOLVED", async () => {
  await as("tst_cskh");
  expect(
    (await fail(packagesApi.adjustStatus("pkg-0000049", { to_status: "DELIVERED", reason: "Đã giao lại" })))
      .status,
  ).toBe(403);
  await as("tst_sup");
  expect(
    (await fail(packagesApi.adjustStatus("pkg-0000049", { to_status: "DELIVERED", reason: "x" }))).status,
  ).toBe(422);
  const bad = await fail(
    packagesApi.adjustStatus("pkg-0000049", { to_status: "PACKED", reason: "Thử chuyển sai" }),
  );
  expect(bad).toMatchObject({
    code: "TRANSITION_NOT_ALLOWED",
    details: { from: "RETURN_MISSING", allowed: ["RETURN_EXPECTED", "DELIVERED"] },
  });
  const ok = await packagesApi.adjustStatus("pkg-0000049", {
    to_status: "RETURN_EXPECTED",
    reason: "ĐVVC báo đang trả về",
    recon_alert_id: "ra-03",
  });
  expect(ok.package.warehouse_status).toBe("RETURN_EXPECTED");
  expect(ok.recon_alert).toMatchObject({
    status: "RESOLVED",
    resolution: { action: "ADJUST_STATUS", to_status: "RETURN_EXPECTED" },
  });
});

test("TC-P2.07 / TC-P2.08: D15 API-120 sắp xếp mức + summary; API-121 xử lý + ALREADY_RESOLVED; API-123 RECON_IN_PROGRESS", async () => {
  await as("tst_cskh");
  const open = await reconApi.list({ status: "OPEN" });
  expect(open.total).toBe(7);
  expect(open.summary.open).toEqual({ HIGH: 3, MEDIUM: 2, LOW: 2 });
  expect(open.items.map((i) => i.severity)).toEqual([
    "HIGH",
    "HIGH",
    "HIGH",
    "MEDIUM",
    "MEDIUM",
    "LOW",
    "LOW",
  ]);
  expect((await reconApi.list({ status: "ALL" })).total).toBe(9);
  expect((await fail(reconApi.resolve("ra-02", "Đã tháo kiện"))).status).toBe(403);
  await as("tst_sup");
  expect((await fail(reconApi.resolve("ra-02", ""))).status).toBe(422);
  expect((await reconApi.resolve("ra-02", "Đã tháo kiện")).resolution).toMatchObject({
    action: "RESOLVE",
    by: { display_name: "Nguyễn B" },
  });
  const again = await fail(reconApi.resolve("ra-02", "lần 2"));
  expect(again).toMatchObject({
    code: "ALREADY_RESOLVED",
    details: { status: "RESOLVED", resolved_by: { display_name: "Nguyễn B" } },
  });
  expect((await fail(reconApi.resolve("ra-09", "x"))).details).toMatchObject({
    status: "AUTO_RESOLVED",
    resolved_by: null,
  });
  await reconApi.run();
  expect((await fail(reconApi.run())).code).toBe("RECON_IN_PROGRESS");
});

test("TC-P2.09 / D16: API-130 lọc + status_counts; STATION 403", async () => {
  await as("tst_cskh");
  const all = await claimsApi.list({});
  expect(all.status_counts).toMatchObject({ NEW: 4, SUBMITTED: 1, WAITING: 1, WON: 1, LOST: 1, CLOSED: 1 });
  expect((await claimsApi.list({ status: "NEW" })).items.map((c) => c.status)).toEqual([
    "NEW",
    "NEW",
    "NEW",
    "NEW",
  ]);
  expect((await claimsApi.list({ due: "soon" })).items.map((c) => c.code)).toContain("KN-000124");
  expect((await claimsApi.list({ due: "overdue" })).items.map((c) => c.code)).toEqual(["KN-000121"]);
  expect((await claimsApi.list({ owner: "me" })).items.every((c) => c.owner?.display_name === "Lan")).toBe(
    true,
  );
  expect((await claimsApi.list({ q: "kn-000124" })).total).toBe(1);
  await as("tst_station01");
  expect((await fail(claimsApi.list({}))).status).toBe(403);
});

test("FR-08.01 / BR-27: API-131 tạo tay, trùng loại → CLAIM_EXISTS; từ cảnh báo → RECON + cảnh báo RESOLVED", async () => {
  await as("tst_cskh");
  const c = await claimsApi.create({
    package_id: "pkg-0000041",
    type: "BUYER_CLAIM",
    counterparty: "PLATFORM",
    note: "Khách báo thiếu 1 tất",
  });
  expect(c).toMatchObject({
    status: "NEW",
    source: "MANUAL",
    version: 1,
    allowed_transitions: ["SUBMITTED", "CLOSED"],
  });
  expect(c.evidence.some((e) => e.kind === "SESSION" && e.auto)).toBe(true);
  expect(c.notes[0]).toMatchObject({ kind: "NOTE", text: "Khách báo thiếu 1 tất" });
  const dup = await fail(
    claimsApi.create({ package_id: "pkg-0000041", type: "BUYER_CLAIM", counterparty: "PLATFORM" }),
  );
  expect(dup).toMatchObject({ code: "CLAIM_EXISTS", details: { claim_id: c.id, code: c.code } });
  const r = await claimsApi.create({
    package_id: "pkg-0000051",
    type: "LOST_IN_TRANSIT",
    counterparty: "CARRIER",
    recon_alert_id: "ra-06",
  });
  expect(r.source).toBe("RECON");
  expect(
    (await reconApi.list({ status: "RESOLVED" })).items.find((a) => a.id === "ra-06")?.resolution?.action,
  ).toBe("OPEN_CLAIM");
});

test("FR-08.02 / 08.03: API-133 đổi trạng thái theo version — bắt buộc trường theo đích, VERSION_CONFLICT, INVALID_TRANSITION, CLAIM_CLOSED", async () => {
  await as("tst_cskh");
  const c = await claimsApi.get("cl-000124");
  expect(c.missing).toEqual([]);
  expect(
    (await fail(claimsApi.patch(c.id, { version: c.version, status: "SUBMITTED" }))).fieldErrors,
  ).toHaveProperty("platform_claim_ref");
  expect((await fail(claimsApi.patch(c.id, { version: c.version, status: "WON" }))).code).toBe(
    "INVALID_TRANSITION",
  );
  const sub = await claimsApi.patch(c.id, {
    version: c.version,
    status: "SUBMITTED",
    platform_claim_ref: "SPE-1",
  });
  expect(sub).toMatchObject({ status: "SUBMITTED", version: c.version + 1, platform_claim_ref: "SPE-1" });
  expect(sub.notes.at(-1)).toMatchObject({ kind: "STATUS_CHANGE" });
  const conflict = await fail(claimsApi.patch(c.id, { version: c.version, status: "WAITING" }));
  expect(conflict).toMatchObject({
    code: "VERSION_CONFLICT",
    details: { current: { version: sub.version } },
  });
  expect(
    (await fail(claimsApi.patch(c.id, { version: sub.version, status: "CLOSED", reason: "x" }))).fieldErrors,
  ).toHaveProperty("reason");
  const closed = await claimsApi.patch(c.id, {
    version: sub.version,
    status: "CLOSED",
    reason: "Khách rút yêu cầu",
  });
  expect(closed.allowed_transitions).toEqual([]);
  expect((await fail(claimsApi.patch(c.id, { version: closed.version, owner_user_id: "u-cskh" }))).code).toBe(
    "CLAIM_CLOSED",
  );
  expect((await claimsApi.addNote(c.id, "Vẫn ghi chú được khi đóng")).kind).toBe("NOTE");
});

test("Mock khớp BE M8 (DEC-312): SUBMITTED → WON; không đổi gì → không tăng version; ghi chú không tăng version; chữ ghi chú đổi trạng thái", async () => {
  await as("tst_cskh");
  const c = await claimsApi.get("cl-000124");
  const same = await claimsApi.patch(c.id, { version: c.version });
  expect(same.version).toBe(c.version);
  const sub = await claimsApi.patch(c.id, {
    version: c.version,
    status: "SUBMITTED",
    platform_claim_ref: "SPE-9",
  });
  expect(sub.allowed_transitions).toEqual(["WAITING", "WON", "LOST", "CLOSED"]);
  expect(sub.notes.map((n) => n.text)).toEqual(
    expect.arrayContaining(["Mới → Đã gửi.", "Mã khiếu nại bên sàn: SPE-9."]),
  );
  await claimsApi.addNote(c.id, "Đã chat với Shopee");
  expect((await claimsApi.get(c.id)).version).toBe(sub.version);
  // WON cần số tiền (gửi kèm hoặc đã có).
  expect(
    (await fail(claimsApi.patch(c.id, { version: sub.version, status: "WON" }))).fieldErrors,
  ).toHaveProperty("recovered_amount");
  const won = await claimsApi.patch(c.id, { version: sub.version, status: "WON", recovered_amount: 150_000 });
  expect(won).toMatchObject({ status: "WON", recovered_amount: 150_000, version: sub.version + 1 });
  const conflict = await fail(claimsApi.patch(c.id, { version: sub.version, status: "CLOSED" }));
  expect(Object.keys(conflict.details)).toEqual(["current"]);
});

test("FR-08.06: API-134 bỏ bằng chứng tự chọn cần lý do; phiên không thuộc kiện → 422", async () => {
  await as("tst_cskh");
  const c = await claimsApi.get("cl-000124");
  const sessions = c.evidence
    .filter((e) => e.kind === "SESSION")
    .map((e) => (e.kind === "SESSION" ? e.session.id : ""));
  expect(
    (
      await fail(
        claimsApi.setEvidence(c.id, { version: c.version, session_ids: sessions.slice(1), snapshot_ids: [] }),
      )
    ).fieldErrors,
  ).toHaveProperty("note");
  expect(
    (
      await fail(
        claimsApi.setEvidence(c.id, { version: c.version, session_ids: ["ses-x"], snapshot_ids: [] }),
      )
    ).fieldErrors,
  ).toHaveProperty("session_ids");
  const r = await claimsApi.setEvidence(c.id, {
    version: c.version,
    session_ids: sessions.slice(1),
    snapshot_ids: [],
    note: "Phiên đóng gói không liên quan",
  });
  expect(r.evidence.filter((e) => e.kind === "SESSION")).toHaveLength(sessions.length - 1);
  expect(r.other_sessions.map((s) => s.id)).toContain(sessions[0]);
});

test("FR-08.05: API-136..138 gói bằng chứng — QUEUED → READY sau 4 giây, PACK_IN_PROGRESS, người khác 404, NO_EVIDENCE", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    await as("tst_cskh");
    const p = await claimsApi.createPack("cl-000124");
    expect(p).toMatchObject({ status: "QUEUED", progress: 0 });
    expect((await fail(claimsApi.createPack("cl-000124"))).details).toMatchObject({ pack_id: p.id });
    vi.setSystemTime(Date.now() + 2000);
    expect((await claimsApi.getPack(p.id)).status).toBe("RUNNING");
    vi.setSystemTime(Date.now() + 2500);
    const ready = await claimsApi.getPack(p.id);
    expect(ready).toMatchObject({ status: "READY", progress: 100 });
    expect(ready.files?.zip).toMatch(/\/media\/evidence-packs\/.+\/pack\.zip\?/);
    await as("tst_sup");
    expect((await fail(claimsApi.getPack(p.id))).status).toBe(404);
    const empty = await claimsApi.create({
      package_id: "pkg-0000050",
      type: "OTHER",
      counterparty: "PLATFORM",
    });
    expect(empty.missing).toContain("NO_PACK_CLIP");
    expect((await fail(claimsApi.createPack(empty.id))).code).toBe("NO_EVIDENCE");
  } finally {
    vi.useRealTimers();
  }
});

test("TC-P2.12 / FR-02.10: API-80 ngưỡng mới + sàn retention + xác nhận hạ (409 impact); API-82 chỉ ADMIN", async () => {
  await as("tst_admin");
  const s = await settingsApi.get();
  expect(s).toMatchObject({ return_missing_days: 7, claim_due_soon_hours: 48, retention_clip_min_days: 60 });
  const base = {
    retention_raw_days: 30,
    retention_clip_days: 90,
    session_warn_minutes: 15,
    session_abandon_minutes: 30,
  };
  expect(await fail(settingsApi.put({ ...base, retention_clip_days: 45 }))).toMatchObject({
    code: "RETENTION_BELOW_MINIMUM",
    details: { min: 60 },
  });
  const unconfirmed = await fail(settingsApi.put({ ...base, retention_clip_days: 70 }));
  expect(unconfirmed.code).toBe("RETENTION_REDUCTION_UNCONFIRMED");
  expect(unconfirmed.details.impact).toMatchObject({ protected_clips: 18 });
  expect(
    (await settingsApi.retentionImpact({ retention_raw_days: 30, retention_clip_days: 70 })).clips,
  ).toBeGreaterThan(0);
  await settingsApi.put({
    ...base,
    retention_clip_days: 70,
    confirm_reduction: true,
    return_missing_days: 10,
  });
  expect(mockSettings).toMatchObject({
    retention_clip_days: 70,
    return_missing_days: 10,
    claim_deadline_days: 7,
  });
  expect(
    (await fail(settingsApi.put({ ...base, return_warn_minutes: 50, return_abandon_minutes: 40 })))
      .fieldErrors,
  ).toHaveProperty("return_abandon_minutes");
  await as("tst_sup");
  expect(
    (await fail(settingsApi.retentionImpact({ retention_raw_days: 30, retention_clip_days: 70 }))).status,
  ).toBe(403);
});

test("TC-01.30 / TC-01.31: API-60 kind (mặc định station 01 = Cả hai) + STATION_BUSY khi có phiên", async () => {
  await as("tst_admin");
  const st = await stationsApi.get("st-1");
  expect(st).toMatchObject({ kind: "BOTH", work_mode: "PACK", operator_name: null });
  stationSim.scan("SPXTST0000001", "busy-1");
  expect((await fail(stationsApi.patch("st-1", { kind: "RETURN" }))).code).toBe("STATION_BUSY");
  stationSim.cancel(stationSim.session!.id);
  expect((await stationsApi.patch("st-1", { kind: "RETURN" })).work_mode).toBe("RETURN");
  expect(stationSim.workMode).toBe("RETURN");
});

test("TC-02.35 / TC-P2.11: API-42 giữ clip chỉ ADMIN", async () => {
  await as("tst_sup");
  expect((await fail(clipsApi.hold("clip-0000001-1-1", true))).status).toBe(403);
  await as("tst_admin");
  expect((await clipsApi.hold("clip-0000001-1-1", true)).held).toBe(true);
});

test("FR-09.01: API-32 counts + attention mới (D2 hiển thị từ T-160)", async () => {
  await as("tst_cskh");
  const d = await reportsApi.daily(vnDay());
  expect(d.counts).toMatchObject({
    returns_missing: 1,
    recon_open: { HIGH: 3, MEDIUM: 2, LOW: 2 },
    claims_open: 8,
  });
  expect(d.counts.claims_due_soon).toBeGreaterThanOrEqual(1);
  expect(d.attention.map((a) => a.kind)).toEqual(
    expect.arrayContaining(["RETURN_MISSING", "RECON_HIGH", "CLAIM_DUE_SOON", "RETURN_UNIDENTIFIED"]),
  );
  expect(d.stations.find((s) => s.id === "st-1")).toMatchObject({ work_mode: "PACK", operator_name: null });
});
