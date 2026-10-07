/**
 * Item 03 (T-251): API client admin + MSW handler đúng contract 02 §6 (02b-admin §12). Mock thay BE tới khi T-207,
 * T-215, T-216, T-222, T-224..T-227 xong — các case bám TC tương ứng trong 04-test-cases.
 */
import { approvalsApi } from "@/lib/api/approvals";
import { fetchMe, login } from "@/lib/api/auth";
import { backupApi } from "@/lib/api/backup";
import { claimsApi } from "@/lib/api/claims";
import { isApiError, type ApiError } from "@/lib/api/errors";
import { notifyApi } from "@/lib/api/notify";
import { packagesApi } from "@/lib/api/packages";
import { reconApi } from "@/lib/api/recon";
import { reportsApi } from "@/lib/api/reports";
import { returnsApi } from "@/lib/api/returns";
import { settingsApi } from "@/lib/api/settings";
import { sharesApi } from "@/lib/api/shares";
import { shopsApi } from "@/lib/api/shops";
import { vnDay } from "@/shared/format";

import { issue, mockBackup } from "./handlers/backup";
import { FAIL_TARGET } from "./handlers/notify";
import { mockReportsState } from "./handlers/reports";
import { mockApprovals } from "./handlers/approvals";
import { mockClaims } from "./returnsDb";
import { SHARE_TICKS } from "./sharesDb";
import { stationSim } from "./stationSim";

const as = (u = "tst_admin") => login(u, "matkhau123", "DASHBOARD");
const fail = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return e;
    throw e;
  }
  throw new Error("expected ApiError");
};
const today = vnDay();
const daysAgo = (n: number) => vnDay(new Date(Date.now() - n * 86_400_000));

test("API-04: quyền mới theo vai (FR-10.02)", async () => {
  await as("tst_cskh");
  const cskh = await fetchMe();
  expect(cskh.permissions).toEqual(
    expect.arrayContaining(["reports.returns", "shares.create", "shares.read"]),
  );
  expect(cskh.permissions).not.toContain("reports.productivity");
  await as("tst_sup");
  expect((await fetchMe()).permissions).toEqual(
    expect.arrayContaining(["reports.productivity", "shares.revoke_any", "backup.read"]),
  );
});

describe("shops (API-70..73, 154, 156)", () => {
  test("API-70: platforms[] + shop nhiều sàn, sắp theo sàn; cả shop đã ngắt", async () => {
    await as();
    const r = await shopsApi.list();
    expect(r.platforms.map((p) => [p.platform, p.configured])).toEqual([
      ["SHOPEE", true],
      ["TIKTOK", true],
    ]);
    expect(r.items.map((s) => s.platform)).toEqual(["SHOPEE", "SHOPEE", "SHOPEE", "TIKTOK", "TIKTOK"]);
    expect(r.items.find((s) => s.name === "TST B")!.sync_warnings[0]).toMatchObject({
      code: "TRACKING_OWNED_BY_OTHER_SHOP",
      tracking_number: "SPXTST0000010",
    });
    expect(r.items.filter((s) => s.auth_status === "DISCONNECTED")).toHaveLength(1);
  });

  test("TC-05.50: kết nối TikTok → URL callback count=2, 2 shop CONNECTED; shop khác không bị ngắt", async () => {
    await as();
    const { url } = await shopsApi.authUrl("TIKTOK");
    expect(url).toBe("/admin/settings/platforms?platform=tiktok&result=connected&count=2");
    const r = await shopsApi.list();
    expect(r.items.filter((s) => s.platform === "TIKTOK").every((s) => s.auth_status === "CONNECTED")).toBe(
      true,
    );
    expect(r.items.find((s) => s.name === "TST Shop A")!.auth_status).toBe("CONNECTED");
    expect((await shopsApi.authUrl("SHOPEE")).url).toBe(
      "/admin/settings/platforms?platform=shopee&result=connected&count=1",
    );
  });

  test("TC-05.55: ngắt shop idempotent; API-156 cho CSKH gồm shop đã ngắt; API-70 CSKH 403", async () => {
    await as();
    const first = await shopsApi.disconnect("shop-tt-b");
    expect(first).toMatchObject({ auth_status: "DISCONNECTED" });
    expect(first.disconnected_at).toBeTruthy();
    expect((await shopsApi.disconnect("shop-tt-b")).disconnected_at).toBe(first.disconnected_at);
    await as("tst_cskh");
    const brief = await shopsApi.brief();
    expect(brief.items).toHaveLength(5);
    expect(brief.items[0]).toEqual({
      id: expect.any(String),
      platform: "SHOPEE",
      name: expect.any(String),
      auth_status: expect.any(String),
    });
    expect((await fail(shopsApi.list())).status).toBe(403);
  });
});

describe("reports (API-150..153)", () => {
  const q = { from: daysAgo(29), to: today };

  test("API-150: thẻ BR-41 (4,0 %, 20,0 %), lọc sàn thu hẹp by_shop", async () => {
    await as("tst_cskh");
    const r = await reportsApi.returns(q);
    expect(r.cards.return_rate).toEqual({ numerator: 40, denominator: 1000, value: 0.04 });
    expect(r.cards.issue_rate.value).toBe(0.2);
    expect(r.by_kind.find((k) => k.kind === "UNANNOUNCED")!.share).toBeNull();
    expect(r.series_granularity).toBe("day");
    const tt = await reportsApi.returns({ ...q, platform: "TIKTOK" });
    expect(tt.by_shop.map((s) => s.platform)).toEqual(["TIKTOK"]);
  });

  test("API-151 / 152: khiếu nại 75 %, 2.350.000 đ; năng suất '(Không ghi tên)' = null; CSKH năng suất 403", async () => {
    await as("tst_sup");
    const c = await reportsApi.claims(q);
    expect(c.cards).toMatchObject({ recovered_amount: 2_350_000, win_rate: { value: 0.75 } });
    const p = await reportsApi.productivity(q);
    expect(p.cards.pack_avg_seconds).toBe(90);
    expect(p.by_operator.some((o) => o.operator_name === null)).toBe(true);
    await as("tst_cskh");
    expect((await fail(reportsApi.productivity(q))).status).toBe(403);
  });

  test("422 kỳ sai: to < from, tương lai, > 366 ngày; 503 REPORT_TIMEOUT", async () => {
    await as();
    expect((await fail(reportsApi.returns({ from: today, to: daysAgo(1) }))).fieldErrors.to).toBe(
      "Ngày đến phải sau ngày từ.",
    );
    const future = vnDay(new Date(Date.now() + 2 * 86_400_000));
    expect((await fail(reportsApi.returns({ from: today, to: future }))).fieldErrors.to).toBe(
      "Không chọn ngày trong tương lai.",
    );
    expect((await fail(reportsApi.returns({ from: daysAgo(400), to: today }))).fieldErrors.from).toBe(
      "Chọn tối đa 366 ngày.",
    );
    mockReportsState.timeout = true;
    expect((await fail(reportsApi.claims(q))).code).toBe("REPORT_TIMEOUT");
  });

  test("API-153: CSV có BOM, tỷ lệ '4,0%'", async () => {
    await as();
    const blob = await reportsApi.exportCsv("returns", q);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer());
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain("Tỷ lệ theo shop");
  });
});

describe("shares (API-160..164)", () => {
  const claimWithSession = () =>
    mockClaims.find((c) => c.status !== "CLOSED" && c.evidence.some((e) => e.kind === "SESSION"))!;

  test("API-164: phiên chọn được, chọn sẵn ≤ 4, giới hạn; nguồn có sàn / shop", async () => {
    await as("tst_cskh");
    const o = await sharesApi.options({ claim_id: claimWithSession().id });
    expect(o).toMatchObject({
      storage_configured: true,
      review_pending_count: 0,
      limits: { max_sessions: 4, max_total_seconds: 1800, max_snapshots: 20 },
      default_expires_days: 7,
      source: { type: "CLAIM", platform: "SHOPEE", shop_name: "TST Shop A" },
    });
    expect(o.sessions.filter((s) => s.primary)).toHaveLength(1);
    expect(o.sessions.filter((s) => s.default_selected).length).toBeLessThanOrEqual(4);
    // M16 (02 §6.2 API-164 — BE DEC-667; T-262): mỗi phiên có `excluded` + `snapshot_count`; phiên bị loại không chọn sẵn.
    for (const s of o.sessions) {
      expect(typeof s.excluded).toBe("boolean");
      expect(typeof s.snapshot_count).toBe("number");
      if (s.excluded) expect(s.default_selected).toBe(false);
    }
  });

  test("TC (FR-07.05): tạo link → 202 CREATING → ACTIVE sau 3 lần đọc, có url; thu hồi → REVOKED + revoke_pending", async () => {
    await as("tst_cskh");
    const claim = claimWithSession();
    const o = await sharesApi.options({ claim_id: claim.id });
    const ids = o.sessions.filter((s) => s.default_selected).map((s) => s.id);
    const created = await sharesApi.create({
      source_type: "CLAIM",
      claim_id: claim.id,
      session_id: null,
      session_ids: ids,
      layout: "SIDE_BY_SIDE",
      include_snapshots: true,
      recipient: "CSKH Shopee – phiếu 1",
      expires_days: 3,
    });
    expect(created.status).toBe("CREATING");
    let s = await sharesApi.get(created.id);
    for (let i = 1; i < SHARE_TICKS; i++) {
      expect(s).toMatchObject({ status: "CREATING", url: null });
      s = await sharesApi.get(created.id);
    }
    expect(s.status).toBe("ACTIVE");
    expect(s.url).toMatch(/^https:\/\//);
    expect(s.items).toHaveLength(ids.length);
    expect(s.can_revoke).toBe(true);
    const revoked = await sharesApi.revoke(created.id);
    expect(revoked).toMatchObject({ status: "REVOKED", revoke_pending: true, url: null, can_revoke: false });
    expect((await fail(sharesApi.revoke(created.id))).code).toBe("SHARE_NOT_ACTIVE");
  });

  test("API-160 422: 0 phiên, người nhận 2 ký tự, hạn 5 ngày", async () => {
    await as();
    const e = await fail(
      sharesApi.create({
        source_type: "CLAIM",
        claim_id: claimWithSession().id,
        session_id: null,
        session_ids: [],
        layout: "CAM1",
        include_snapshots: false,
        recipient: "ab",
        expires_days: 5 as 7,
      }),
    );
    expect(e.fieldErrors).toMatchObject({
      session_ids: "Chọn ít nhất 1 phiên.",
      recipient: "Ghi rõ gửi cho ai (3–100 ký tự).",
    });
    expect(e.fieldErrors.expires_days).toBeTruthy();
  });

  test("API-161: counts theo trạng thái; CSKH không thu hồi được link người khác", async () => {
    await as("tst_cskh");
    const r = await sharesApi.list({ status: "ALL" });
    // T-266: + 2 link của KN-000141 (affected_shares).
    expect(r.counts).toMatchObject({ ACTIVE: 4, REVOKED: 1, EXPIRED: 1, ALL: 6 });
    expect(r.items.every((s) => !("items" in s) || s.items === undefined)).toBe(true);
    await as("tst_sup");
    // T-257: `share-4` do Supervisor tạo (CSKH không thu hồi được).
    expect((await sharesApi.list({ mine: true })).total).toBe(2);
    await as("tst_cskh");
    const other = (await sharesApi.list({})).items.find((s) => s.id === "share-4")!;
    expect(other.can_revoke).toBe(false);
    expect((await fail(sharesApi.revoke("share-4"))).status).toBe(403);
  });

  test("API-189 (T-266): MARK_WRONG_SCAN → affected_shares (can_revoke theo người xem); action khác → []", async () => {
    await as("tst_cskh");
    const c = await claimsApi.get("cl-000141");
    const res = await claimsApi.reviewReturnSession("cl-000141", "ses-p3-a", {
      version: c.version,
      action: "MARK_WRONG_SCAN",
      reason_code: "WRONG_SCAN",
      note: "Kiện khác",
    });
    expect(res.affected_shares.map((s) => [s.id, s.can_revoke])).toEqual([
      ["share-p3-1", true],
      ["share-p3-2", false],
    ]);
    // Không tự thu hồi (DEC-531).
    expect((await sharesApi.get("share-p3-1")).status).toBe("ACTIVE");
    const un = await claimsApi.reviewReturnSession("cl-000141", "ses-p3-a", {
      version: res.version,
      action: "UNMARK_WRONG_SCAN",
      note: "Nhầm thao tác",
    });
    expect(un.affected_shares).toEqual([]);
  });

  test("API-31 / API-132: shares[] + shares_active_count", async () => {
    await as();
    const claim = claimWithSession();
    const detail = await claimsApi.get(claim.id);
    expect(detail.shares_active_count).toBe(2);
    expect(detail.shares[0]).toMatchObject({ id: "share-1", status: "ACTIVE", revoke_pending: false });
    // M16 (02 §6.2 API-31 — BE DEC-666; T-262): item có `created_at`, mới nhất trước.
    expect(detail.shares[0]!.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const pkg = await packagesApi.get(claim.package_id);
    expect(pkg.shares_active_count).toBeGreaterThanOrEqual(1);
  });
});

describe("notify (API-170..176)", () => {
  test("API-170: nhà cung cấp, giờ yên lặng, 10 sự kiện có nhãn server", async () => {
    await as();
    const r = await notifyApi.channels();
    expect(r.providers).toEqual({ TELEGRAM: { configured: true }, ZALO_OA: { configured: false } });
    expect(r.quiet_hours).toEqual({ enabled: true, start: "22:00", end: "07:00" });
    expect(r.events).toHaveLength(10);
    expect(r.events.every((e) => e.label.length > 0)).toBe(true);
    // 02 §6.2 v0.5 (FE DEC-763 / BE DEC-730; T-262): `last_error` là object hoặc null, không bao giờ là chuỗi.
    const cskh = r.items.find((c) => c.name === "CSKH")!;
    expect(cskh.last_error).toEqual({
      code: "NOTIFY_SEND_FAILED",
      message: "Telegram không nhận Chat ID này. Kiểm tra bot đã vào nhóm.",
      at: expect.any(String),
      provider_code: "400",
    });
    expect(r.items.filter((c) => c.name !== "CSKH").every((c) => c.last_error === null)).toBe(true);
    await as("tst_sup");
    expect((await fail(notifyApi.channels())).status).toBe(403);
  });

  test("API-171: 422 chat ID, 409 trùng tên, 409 Zalo chưa cấu hình; tạo được 201", async () => {
    await as();
    const base = {
      name: "Quản lý",
      type: "TELEGRAM" as const,
      target: "-100555",
      events: ["N06" as const],
      enabled: true,
    };
    expect((await fail(notifyApi.create({ ...base, target: "abc" }))).fieldErrors.target).toBe(
      "Chat ID là một số (nhóm thường bắt đầu bằng -100).",
    );
    expect((await fail(notifyApi.create({ ...base, events: [] }))).fieldErrors.events).toBe(
      "Chọn ít nhất 1 sự kiện.",
    );
    expect((await fail(notifyApi.create({ ...base, name: "kho" }))).code).toBe("CHANNEL_NAME_EXISTS");
    expect((await fail(notifyApi.create({ ...base, type: "ZALO_OA", target: "123" }))).code).toBe(
      "PROVIDER_NOT_CONFIGURED",
    );
    const ch = await notifyApi.create(base);
    expect(ch).toMatchObject({ name: "Quản lý", last_status: "NEVER" });
  });

  test("API-174: gửi thử lỗi 502 với target mock; OK với kênh Kho; API-176 422 giờ trùng", async () => {
    await as();
    const { items } = await notifyApi.channels();
    const bad = items.find((c) => c.target === FAIL_TARGET)!;
    const e = await fail(notifyApi.test(bad.id));
    expect(e).toMatchObject({ status: 502, code: "NOTIFY_SEND_FAILED" });
    expect((await notifyApi.test(items[0]!.id)).ok).toBe(true);
    expect(
      (await fail(notifyApi.quietHours({ enabled: true, start: "22:00", end: "22:00" }))).fieldErrors.end,
    ).toBeTruthy();
    expect((await notifyApi.messages({ status: "RETRYING" })).items[0]).toMatchObject({ attempts: 2 });
  });
});

describe("backup (API-180..188)", () => {
  test("API-180: trạng thái ON, dấu vân tay, 14 ngày lịch sử, 2 tệp lệch mã băm", async () => {
    await as();
    const b = await backupApi.get();
    expect(b).toMatchObject({ state: "ON", key: { fingerprint: "7F3A-91C2-0B5E-44D1", old_keys: [] } });
    expect(b.history).toHaveLength(14);
    expect(b.evidence.hash_mismatch).toBe(2);
    await as("tst_sup");
    expect((await fail(backupApi.get())).status).toBe(403);
  });

  test("KEY_CHANGED → run-db 409 KEY_UNCONFIRMED; confirm-key sai → BACKUP_KEY_MISMATCH; đúng → ON", async () => {
    await as();
    mockBackup.confirmedFingerprint = "21C4-0D9A-77E1-5B30";
    expect((await backupApi.get()).state).toBe("KEY_CHANGED");
    expect((await fail(backupApi.runDb())).code).toBe("BACKUP_KEY_UNCONFIRMED");
    expect((await fail(backupApi.confirmKey("21C4-0D9A-77E1-5B30"))).code).toBe("BACKUP_KEY_MISMATCH");
    expect((await backupApi.confirmKey("7F3A-91C2-0B5E-44D1")).state).toBe("ON");
  });

  test("DISABLED → run-db / reupload 409 BACKUP_DISABLED; RESTORE_PENDING bật → 409", async () => {
    await as();
    await backupApi.updateSettings({ enabled: false });
    expect((await fail(backupApi.runDb())).code).toBe("BACKUP_DISABLED");
    expect((await fail(backupApi.reuploadOldKey())).code).toBe("BACKUP_DISABLED");
    mockBackup.restorePending = true;
    expect((await fail(backupApi.updateSettings({ enabled: true }))).code).toBe("BACKUP_RESTORE_UNVERIFIED");
    expect((await fail(backupApi.updateSettings({ upload_mbps: 0 }))).fieldErrors.upload_mbps).toBeTruthy();
  });

  test("API-188: lý do < 5 → 422; RETRY cho lệch mã băm → 409; UPLOAD_ANYWAY → đã xử lý, lần 2 → 409", async () => {
    await as();
    const [first] = (await backupApi.issues({ kind: "HASH_MISMATCH" })).items;
    expect((await fail(backupApi.resolveIssue(first!.object_id, "IGNORE", "abc"))).fieldErrors.note).toBe(
      "Nhập lý do (5–500 ký tự).",
    );
    expect((await fail(backupApi.resolveIssue(first!.object_id, "RETRY", "Đã chép lại"))).code).toBe(
      "BACKUP_ISSUE_ACTION_INVALID",
    );
    const done = await backupApi.resolveIssue(first!.object_id, "UPLOAD_ANYWAY", "Đã kiểm tay video");
    expect(done.resolution).toMatchObject({ action: "UPLOAD_ANYWAY" });
    expect((await fail(backupApi.resolveIssue(first!.object_id, "IGNORE", "Bỏ qua tệp"))).code).toBe(
      "BACKUP_ISSUE_RESOLVED",
    );
    expect((await backupApi.issues()).total).toBe(1);
  });

  test("API-187: khóa cũ → xếp 790, gọi lại 0 (idempotent), old_keys còn với reuploadable 0; khóa chưa xác nhận → 409", async () => {
    await as();
    mockBackup.oldKeys = true;
    expect(await backupApi.reuploadOldKey()).toEqual({ queued: 790, bytes: 146_028_888_064 });
    expect(await backupApi.reuploadOldKey()).toEqual({ queued: 0, bytes: 0 });
    const b = await backupApi.get();
    expect(b.key.old_keys).toEqual([expect.objectContaining({ evidence_objects: 812, reuploadable: 0 })]);
    expect(b.evidence.pending).toBe(793);
    mockBackup.confirmedFingerprint = null;
    expect((await fail(backupApi.reuploadOldKey())).code).toBe("BACKUP_KEY_UNCONFIRMED");
  });

  test("API-188 SOURCE_MISSING: RETRY được, UPLOAD_ANYWAY → 409; IGNORE khi tệp đã có lại → 409 ACTION_INVALID", async () => {
    await as();
    mockBackup.issues.push(issue(3, "SOURCE_MISSING", "SPXTST0000006"), {
      ...issue(4, "SOURCE_MISSING", "SPXTST0000007"),
      sourceBack: true,
    });
    const page = await backupApi.issues({ kind: "SOURCE_MISSING" });
    expect(page.total).toBe(2);
    expect(page.items[0]).not.toHaveProperty("sourceBack");
    expect((await fail(backupApi.resolveIssue("bo-3", "UPLOAD_ANYWAY", "Vẫn tải"))).code).toBe(
      "BACKUP_ISSUE_ACTION_INVALID",
    );
    expect((await backupApi.resolveIssue("bo-3", "RETRY", "IT đã chép lại")).resolution?.action).toBe(
      "RETRY",
    );
    const back = await fail(backupApi.resolveIssue("bo-4", "IGNORE", "Ổ hỏng"));
    expect([back.code, back.message]).toEqual([
      "BACKUP_ISSUE_ACTION_INVALID",
      "Tệp đã có lại tại kho — bấm Thử lại ngay.",
    ]);
  });

  test("API-81: sức khỏe có backup + sync có sàn / tên shop (bỏ shop đã ngắt)", async () => {
    await as("tst_sup");
    const h = await settingsApi.health();
    expect(h.backup).toMatchObject({ state: "ON", late: true });
    expect(h.sync.every((s) => s.platform && s.shop_name)).toBe(true);
    expect(h.sync).toHaveLength(4);
  });
});

describe("mở rộng danh sách + cài đặt + duyệt", () => {
  test("TC-07.40: API-30 lọc TikTok + shop; item có platform / shop; shop khác sàn → rỗng", async () => {
    await as("tst_cskh");
    const tt = await packagesApi.search({ platform: "TIKTOK" });
    expect(tt.total).toBe(4);
    expect(tt.items.every((i) => i.platform === "TIKTOK" && i.shop?.name === "TST TikTok A (mock)")).toBe(
      true,
    );
    expect((await packagesApi.search({ platform: "TIKTOK", shop_id: "shop-2" })).total).toBe(0);
    const dup = await packagesApi.search({ q: "2410DUP00001" });
    expect(dup.items.map((i) => i.shop?.name).sort()).toEqual(["TST B", "TST TikTok A (mock)"]);
  });

  test("API-31: order.shop / platform_status_group / merged_orders, items[].platform_order_sn", async () => {
    await as();
    const d = await packagesApi.get("pkg-TTTST0000000077");
    expect(d.order).toMatchObject({
      platform: "TIKTOK",
      shop: { name: "TST TikTok A (mock)", platform: "TIKTOK" },
      platform_status_group: "AWAITING_SHIPMENT",
      merged_orders: [{ platform_order_sn: "5761TT0000000772" }],
    });
    expect(d.order!.items.map((i) => i.platform_order_sn)).toEqual(["5761TT0000000771", "5761TT0000000772"]);
  });

  test("API-110: pending_only + hạn phản hồi; sort due_asc mặc định ở tab Chỉ hoàn tiền", async () => {
    await as("tst_cskh");
    const r = await returnsApi.list({ tab: "NO_PARCEL", pending_only: true });
    expect(r.items.map((i) => i.code)).toEqual(["HH-000061"]);
    expect(r.items[0]).toMatchObject({
      platform: "TIKTOK",
      platform_status_group: "REQUESTED",
      response_due_source: "PLATFORM",
      claim: null,
    });
    const all = await returnsApi.list({ tab: "NO_PARCEL" });
    expect(all.items.map((i) => i.code)).toEqual(["HH-000044", "HH-000061"]);
  });

  test("API-120 / API-130: item có platform + shop, lọc sàn", async () => {
    await as();
    const recon = await reconApi.list({});
    expect(recon.items[0]).toHaveProperty("platform");
    expect(recon.items[0]).toHaveProperty("shop");
    expect((await reconApi.list({ platform: "TIKTOK" })).total).toBe(0);
    const claims = await claimsApi.list({});
    expect(claims.items[0]).toMatchObject({ platform: "SHOPEE", shop: { name: "TST Shop A" } });
  });

  test("API-132: bằng chứng có primary / removal_keep_until / trường BR-39", async () => {
    await as();
    const c = await claimsApi.get(mockClaims.find((x) => x.evidence.length)!.id);
    expect(c.evidence.filter((e) => e.primary).length).toBeLessThanOrEqual(1);
    const session = c.evidence.find((e) => e.kind === "SESSION");
    if (session?.kind === "SESSION") {
      expect(session.removal_keep_until).toBeTruthy();
      expect(session.session).toMatchObject({
        review_needed: false,
        wrong_scan: null,
        return_confirmed: null,
      });
    }
    expect(c).toMatchObject({ removed_evidence: [], review_sessions: [], prior_return_sessions: [] });
  });

  test("API-80: packer_name_required → station operator_required; refund_only_default_hours 1–168", async () => {
    await as();
    const s = await settingsApi.get();
    expect(s).toMatchObject({ packer_name_required: false, refund_only_default_hours: 48 });
    const base = {
      retention_raw_days: s.retention_raw_days,
      retention_clip_days: s.retention_clip_days,
      session_warn_minutes: s.session_warn_minutes,
      session_abandon_minutes: s.session_abandon_minutes,
    };
    expect(
      (await fail(settingsApi.put({ ...base, refund_only_default_hours: 200 }))).fieldErrors,
    ).toHaveProperty("refund_only_default_hours");
    const next = await settingsApi.put({
      ...base,
      packer_name_required: true,
      refund_only_default_hours: 24,
    });
    expect(next).toMatchObject({ packer_name_required: true, refund_only_default_hours: 24 });
    expect(stationSim.operatorRequired).toBe(true);
  });

  test("API-21: hủy phiên RETURN thiếu reason_code / ghi chú ngắn → 422", async () => {
    mockApprovals.push({
      id: "apr-rt",
      type: "ASSIST",
      status: "PENDING",
      station: { id: "st-3", name: "Station 03" },
      session_id: "ses-x",
      tracking_number: "SPXTST0000041",
      context: null,
      created_at: new Date().toISOString(),
      session_type: "RETURN",
      operator_name: "Lan",
      decision: null,
      decided_by: null,
      decided_at: null,
      note: null,
    });
    await as("tst_sup");
    const e = await fail(approvalsApi.decide("apr-rt", "CANCEL_SESSION", "abc"));
    expect(e.fieldErrors).toEqual({ reason_code: "Chọn lý do hủy.", note: "Nhập ghi chú (5–500 ký tự)." });
    const ok = await approvalsApi.decide("apr-rt", "CANCEL_SESSION", "Quét nhầm kiện bên cạnh", "WRONG_SCAN");
    expect(ok.approval_request.decision).toBe("CANCEL_SESSION");
  });

  test("API-32: số mới + mục mới; SYNC_ERROR / BACKUP_STALE chỉ ADMIN", async () => {
    await as();
    const admin = await reportsApi.daily(today);
    expect(admin.counts).toMatchObject({ refund_only_pending: 1 });
    expect(admin.attention.map((a) => a.kind)).toEqual(
      expect.arrayContaining(["REFUND_ONLY_PENDING", "SYNC_ERROR", "BACKUP_STALE"]),
    );
    expect(
      admin.attention.find((a) => a.kind === "SYNC_ERROR" && "platform" in a && a.platform === "TIKTOK"),
    ).toMatchObject({
      shop_name: "TST TikTok B (mock)",
      code: "AUTH_EXPIRED",
    });
    await as("tst_cskh");
    const cskh = await reportsApi.daily(today);
    expect(cskh.attention.some((a) => a.kind === "SYNC_ERROR" || a.kind === "BACKUP_STALE")).toBe(false);
  });
});
