import { http, HttpResponse } from "msw";

import type { Role } from "@/lib/api/session";
import type {
  AttentionItem,
  ClaimsReport,
  DailyReport,
  Phase3AttentionItem,
  ProductivityReport,
  ReportTab,
  ReturnAttentionItem,
  ReturnsReport,
  SeriesPoint,
} from "@/lib/api/reports";
import { isPlatform, type Platform } from "@/shared/labels";
import { daysBetween, vnDay } from "@/shared/format";

import { API, apiError, json } from "../http";
import { allSessions, mockPackages, STATIONS } from "../packagesDb";
import {
  claimDue,
  mockClaims,
  mockReconAlerts,
  mockReturnCases,
  sessionReview,
  toReturnItem,
} from "../returnsDb";
import { SHOP } from "../shopsDb";
import { backupStatus } from "./backup";
import { mockShops } from "./shops";
import { stationSim } from "../stationSim";
import { pendingApprovals } from "./approvals";
import { DASHBOARD_ROLES, requireRole } from "./session";
import { mockStations } from "./stations";

/** Mục "Cần xử lý" không suy ra được từ dữ liệu mock (ổ đĩa, đồng bộ) — test đổi được. */
export const mockAttentionExtra: AttentionItem[] = [];
/** item 03: `timeout` → API-150..153 trả 503 REPORT_TIMEOUT. */
export const mockReportsState = { timeout: false };
export function resetMockReports() {
  mockAttentionExtra.splice(0, mockAttentionExtra.length, { kind: "DISK_USAGE", percent: 83 });
  mockReportsState.timeout = false;
}
resetMockReports();

/** API-32 theo định nghĩa đếm trong 02 §6.2 (phiên theo ngày Việt Nam). */
export function dailyReport(date: string, role: Role = "ADMIN"): DailyReport {
  // Số Phase 1 chỉ đếm phiên đóng gói (phiên RETURN của item 02 có số riêng — 02 §6.2 API-32 mở rộng).
  const sessions = allSessions().filter((s) => (s.type ?? "PACK") === "PACK");
  const endedOn = (status: string) =>
    sessions.filter((s) => s.status === status && s.ended_at && vnDay(s.ended_at) === date).length;
  const pkgCount = (status: string) => mockPackages.filter((p) => p.warehouse_status === status).length;

  const stations = Object.entries(STATIONS).map(([id, name]) => {
    const st = mockStations.find((s) => s.id === id);
    const last = sessions
      .filter((s) => s.station_id === id)
      .map((s) => s.ended_at ?? s.started_at)
      .sort()
      .at(-1);
    // TST Station 01 lấy từ station giả: trạng thái (INSPECTING khi phiên RETURN mở — BE `reports._stations`),
    // mã kiện của phiên đang mở, chế độ + người kiểm (02 §6.2 API-32 `stations[]` thêm).
    const sim = id === "st-1" ? stationSim.state() : null;
    const state = (
      sim && ["PACKING", "MISMATCH", "WAITING_APPROVAL", "INSPECTING"].includes(sim.state)
        ? sim.state
        : "READY"
    ) as DailyReport["stations"][number]["state"];
    return {
      id,
      name: st?.name ?? name,
      state,
      tracking_number: sim?.session?.package.tracking_number ?? null,
      work_mode: sim ? sim.station.work_mode : ("PACK" as const),
      operator_name: sim ? sim.station.operator_name : null,
      cameras: (st?.cameras ?? []).map((c) => ({ role: c.role, status: c.status })),
      last_scan_at: last ?? null,
    };
  });

  const attention: (AttentionItem | ReturnAttentionItem | Phase3AttentionItem)[] = [];
  const cap = pkgCount("CANCELLED_AFTER_PACK");
  if (cap > 0) attention.push({ kind: "CANCELLED_AFTER_PACK", count: cap });
  for (const st of mockStations)
    for (const c of st.cameras) {
      if (c.status === "OFFLINE")
        attention.push({ kind: "CAMERA_OFFLINE", camera_id: c.id, station_name: st.name, role: c.role });
      if (c.clock_offset_ms !== null && Math.abs(c.clock_offset_ms) > 1000)
        attention.push({ kind: "CLOCK_DRIFT", camera_id: c.id, offset_ms: c.clock_offset_ms });
    }
  const approvals = pendingApprovals().length;
  if (approvals > 0) attention.push({ kind: "APPROVAL_PENDING", count: approvals });
  // item 03: `SYNC_ERROR` chỉ ADMIN (server lọc sau cache).
  attention.push(...mockAttentionExtra.filter((a) => role === "ADMIN" || a.kind !== "SYNC_ERROR"));
  // item 02: mục mới (02 §6.2 API-32, §6.3 #13, §6.5 #1).
  const missing = mockReturnCases.filter((c) => c.status === "MISSING").length;
  const reconHigh = mockReconAlerts.filter((a) => a.status === "OPEN" && a.severity === "HIGH").length;
  const dueSoon = mockClaims.filter((c) => claimDue(c).due_soon).length;
  const unidentified = mockReturnCases.filter(
    (c) => c.kind === "UNIDENTIFIED" && !c.order && c.status !== "CANCELLED",
  ).length;
  if (missing) attention.push({ kind: "RETURN_MISSING", count: missing });
  if (reconHigh) attention.push({ kind: "RECON_HIGH", count: reconHigh });
  if (dueSoon) attention.push({ kind: "CLAIM_DUE_SOON", count: dueSoon });
  if (unidentified) attention.push({ kind: "RETURN_UNIDENTIFIED", count: unidentified });
  // item 03 (02 §6.2 "API-32 mở rộng").
  const p3 = phase3Counts();
  if (p3.counts.refund_only_pending)
    attention.push({
      kind: "REFUND_ONLY_PENDING",
      count: p3.counts.refund_only_pending,
      nearest_due_at: p3.nearestDue,
    });
  if (p3.counts.claims_overdue_unsent)
    attention.push({ kind: "CLAIM_OVERDUE", count: p3.counts.claims_overdue_unsent });
  if (p3.counts.returns_dropped_7d)
    attention.push({ kind: "RETURN_SESSION_DROPPED", count: p3.counts.returns_dropped_7d });
  if (role === "ADMIN") {
    for (const shop of mockShops)
      if (shop.auth_status === "EXPIRED" || shop.last_error)
        attention.push({
          kind: "SYNC_ERROR",
          shop_id: shop.id,
          at: shop.last_error?.at ?? new Date().toISOString(),
          shop_name: shop.name,
          platform: shop.platform,
          code: shop.auth_status === "EXPIRED" ? "AUTH_EXPIRED" : (shop.last_error?.code ?? null),
        });
    const b = backupStatus();
    if (b.state === "ON") {
      if (b.db.consecutive_failures >= 2) attention.push({ kind: "BACKUP_STALE", reason: "DB_FAILED_TWICE" });
      else if (b.db.late)
        attention.push({
          kind: "BACKUP_STALE",
          reason: "DB_LATE",
          hours: Math.round(b.db.hours_since_success ?? 0),
        });
      if (b.evidence.hash_mismatch)
        attention.push({ kind: "BACKUP_STALE", reason: "HASH_MISMATCH", count: b.evidence.hash_mismatch });
      if (b.evidence.source_missing)
        attention.push({ kind: "BACKUP_STALE", reason: "SOURCE_MISSING", count: b.evidence.source_missing });
    }
  }

  const returnSessions = allSessions().filter(
    (s) => s.type === "RETURN" && s.status === "COMPLETED" && s.ended_at && vnDay(s.ended_at) === date,
  );
  const received = returnSessions.filter(
    (s) => !mockPackages.find((p) => p.id === s.package_id)?.is_placeholder,
  );
  const packEnded = sessions.filter(
    (s) => s.status === "COMPLETED" && s.ended_at && vnDay(s.ended_at) === date,
  );
  const open = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const a of mockReconAlerts) if (a.status === "OPEN") open[a.severity] += 1;

  return {
    date,
    counts: {
      packed: endedOn("COMPLETED"),
      had_mismatch: sessions.filter((s) => s.flags.includes("HAD_MISMATCH") && vnDay(s.started_at) === date)
        .length,
      abandoned: endedOn("ABANDONED"),
      cancelled: endedOn("CANCELLED"),
      packed_not_handed_over: pkgCount("PACKED"),
      cancelled_after_pack: cap,
      returns_received: received.length,
      returns_received_issue: received.filter(
        (s) => s.inspection?.conclusion && s.inspection.conclusion !== "OK",
      ).length,
      returns_unidentified: returnSessions.length - received.length,
      returns_expected: mockReturnCases.filter((c) => ["EXPECTED", "PARTIALLY_RECEIVED"].includes(c.status))
        .length,
      returns_missing: missing,
      recon_open: open,
      claims_open: mockClaims.filter((c) => c.status !== "CLOSED").length,
      claims_due_soon: dueSoon,
      label_on_tray: packEnded.filter((s) => s.flags.includes("LABEL_ON_TRAY")).length,
      cam2_unverified: packEnded.filter((s) => s.flags.includes("CAM2_UNVERIFIED")).length,
      ...p3.counts,
    },
    stations,
    attention,
  };
}

/** item 03: số hiện tại của D2 (BR-39 v0.4, BR-40, BR-42). */
function phase3Counts() {
  const now = Date.now();
  const dropped = allSessions().filter(
    (s) =>
      s.type === "RETURN" &&
      (s.status === "CANCELLED" || s.status === "ABANDONED") &&
      s.ended_at &&
      now - Date.parse(s.ended_at) <= 7 * 86_400_000 &&
      !sessionReview(s).evidence_exclusion,
  ).length;
  const refund = mockReturnCases
    .filter((c) => c.kind === "REFUND_ONLY")
    .map((c) => toReturnItem(c))
    .filter(
      (r) => !r.claim && (r.platform_status_group === "REQUESTED" || r.platform_status_group === "ACCEPTED"),
    );
  const nearestDue =
    refund
      .map((r) => r.response_due_at)
      .filter((x): x is string => Boolean(x))
      .sort()[0] ?? null;
  return {
    counts: {
      returns_dropped_7d: dropped,
      refund_only_pending: refund.length,
      claims_overdue_unsent: mockClaims.filter(
        (c) => c.status === "NEW" && c.deadline_at && Date.parse(c.deadline_at) < now,
      ).length,
    },
    nearestDue,
  };
}

// ───────────────────────── item 03: API-150..153 (02b-admin §12: bộ số ví dụ BR-41) ─────────────────────────

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ràng buộc kỳ (02 §6 quy ước "Kỳ báo cáo") — chữ lỗi theo API-150. */
export function validatePeriod(from: string | null, to: string | null): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!from || !DATE.test(from)) fields.from = "Chọn ngày từ.";
  if (!to || !DATE.test(to)) fields.to = "Chọn ngày đến.";
  if (Object.keys(fields).length) return fields;
  if (to! < from!) fields.to = "Ngày đến phải sau ngày từ.";
  else if (to! > vnDay()) fields.to = "Không chọn ngày trong tương lai.";
  else if (daysBetween(from!, to!) + 1 > 366) fields.from = "Chọn tối đa 366 ngày.";
  return fields;
}

function series(
  from: string,
  to: string,
): { series: SeriesPoint[]; series_granularity: "day" | "week" | "month" } {
  const days = daysBetween(from, to) + 1;
  const granularity = days <= 31 ? "day" : days <= 180 ? "week" : "month";
  const step = granularity === "day" ? 1 : granularity === "week" ? 7 : 30;
  const out: SeriesPoint[] = [];
  for (let i = 0; i < days; i += step) {
    const bucket = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    out.push({
      bucket,
      packed: 32 * step + (i % 5),
      return_cases: (i % 3) * step,
      claims: i % 7 === 0 ? 1 : 0,
    });
  }
  return { series: out, series_granularity: granularity };
}

const shopRows = (platform: Platform | null, shopId: string | null) =>
  [SHOP.A, SHOP.B, SHOP.TT_A].filter(
    (s) => (!platform || s.platform === platform) && (!shopId || s.id === shopId),
  );

function returnsReport(
  from: string,
  to: string,
  platform: Platform | null,
  shopId: string | null,
): ReturnsReport {
  const shops = shopRows(platform, shopId);
  const scale = shops.length / 3;
  const n = (v: number) => Math.round(v * scale);
  const handed = n(1000);
  const returned = n(40);
  return {
    period: { from, to },
    filters: { platform, shop_id: shopId },
    generated_at: new Date().toISOString(),
    cards: {
      return_rate: { numerator: returned, denominator: handed, value: handed ? returned / handed : null },
      issue_rate: { numerator: n(6), denominator: n(30), value: n(30) ? n(6) / n(30) : null },
      refund_only: { count: n(6), rate_of_handed_over: handed ? n(6) / handed : null },
      expected_now: n(41),
    },
    by_kind: [
      { kind: "BUYER_RETURN", count: n(25), share: returned ? n(25) / returned : null },
      { kind: "FAILED_DELIVERY", count: n(15), share: returned ? n(15) / returned : null },
      { kind: "UNANNOUNCED", count: n(2), share: null },
    ],
    reason_by_conclusion: {
      conclusions: ["OK", "DAMAGED", "MISSING_ITEM", "WRONG_ITEM", "EMPTY_BOX", "OTHER"],
      rows: [
        {
          reason: "ITEM_DAMAGED",
          reason_label: "Hàng bị hư",
          counts: { OK: n(4), DAMAGED: n(3), MISSING_ITEM: 0, WRONG_ITEM: 0, EMPTY_BOX: 0, OTHER: 0 },
          total: n(7),
        },
        {
          reason: "CHANGE_OF_MIND",
          reason_label: "Đổi ý",
          counts: { OK: n(10), DAMAGED: 0, MISSING_ITEM: 0, WRONG_ITEM: 0, EMPTY_BOX: n(1), OTHER: 0 },
          total: n(11),
        },
      ],
    },
    top_products: [
      {
        sku: "AT-DEN-L",
        product_name: "Áo thun basic",
        variation: "Đen / L",
        shipped: n(320),
        return_requests: n(14),
        rate: n(320) ? n(14) / n(320) : null,
        issue: n(3),
      },
      {
        sku: null,
        product_name: "Tất cổ ngắn",
        variation: "Trắng",
        shipped: n(180),
        return_requests: n(5),
        rate: n(180) ? n(5) / n(180) : null,
        issue: 0,
      },
    ],
    by_shop: shops.map((s, i) => ({
      platform: s.platform,
      shop_id: s.id,
      shop_name: s.name,
      handed_over: [700, 120, 180][i]!,
      return_cases: [26, 4, 10][i]!,
      rate: [26 / 700, 4 / 120, 10 / 180][i]!,
    })),
    ...series(from, to),
  };
}

function claimsReport(
  from: string,
  to: string,
  platform: Platform | null,
  shopId: string | null,
): ClaimsReport {
  const shops = shopRows(platform, shopId);
  const scale = shops.length / 3;
  const n = (v: number) => Math.round(v * scale);
  return {
    period: { from, to },
    filters: { platform, shop_id: shopId },
    generated_at: new Date().toISOString(),
    cards: {
      created: n(21),
      win_rate: { numerator: n(12), denominator: n(16), value: n(16) ? n(12) / n(16) : null },
      recovered_amount: n(2_350_000),
      submitted_before_deadline: {
        numerator: n(14),
        denominator: n(16),
        value: n(16) ? n(14) / n(16) : null,
      },
      overdue_unsent_now: n(2),
    },
    by_status: [
      { status: "NEW", count: n(3) },
      { status: "SUBMITTED", count: n(4) },
      { status: "WAITING", count: n(2) },
      { status: "WON", count: n(8) },
      { status: "LOST", count: n(3) },
      { status: "CLOSED", count: n(1) },
    ],
    by_type_result: [
      { type: "EMPTY_BOX", won: n(3), lost: n(1), pending: n(2) },
      { type: "DAMAGED", won: n(5), lost: n(2), pending: n(1) },
    ],
    by_counterparty: [
      { counterparty: "PLATFORM", count: n(15), won: n(10), lost: n(3), recovered_amount: n(2_000_000) },
      { counterparty: "CARRIER", count: n(6), won: n(2), lost: 0, recovered_amount: n(350_000) },
    ],
    by_shop: shops.map((s, i) => ({
      platform: s.platform,
      shop_id: s.id,
      shop_name: s.name,
      count: [15, 2, 4][i]!,
      won: [9, 1, 2][i]!,
      lost: [3, 0, 0][i]!,
      recovered_amount: [1_900_000, 150_000, 300_000][i]!,
    })),
    ...series(from, to),
  };
}

function productivityReport(
  from: string,
  to: string,
  platform: Platform | null,
  shopId: string | null,
  stationId: string | null,
): ProductivityReport {
  const stations = Object.entries(STATIONS).filter(([id]) => !stationId || id === stationId);
  return {
    period: { from, to },
    filters: { platform, shop_id: shopId, station_id: stationId },
    generated_at: new Date().toISOString(),
    cards: { packed: 1234, pack_avg_seconds: 90, returns_inspected: 45, return_avg_seconds: 210 },
    by_station: stations.map(([id, name], i) => ({
      station_id: id,
      station_name: name,
      packed: [640, 594][i]!,
      avg_seconds: [88, 92][i]!,
      mismatch: [12, 9][i]!,
      abandoned: [1, 0][i]!,
      cancelled: [3, 2][i]!,
      repacked: [2, 1][i]!,
    })),
    by_operator: [
      {
        operator_name: "Minh",
        packed: 400,
        avg_seconds: 85,
        mismatch: 5,
        abandoned: 0,
        cancelled: 1,
        repacked: 1,
      },
      {
        operator_name: "Hùng",
        packed: 594,
        avg_seconds: 92,
        mismatch: 9,
        abandoned: 0,
        cancelled: 2,
        repacked: 1,
      },
      {
        operator_name: null,
        packed: 240,
        avg_seconds: 95,
        mismatch: 7,
        abandoned: 1,
        cancelled: 2,
        repacked: 1,
      },
    ],
    return_by_operator: [
      {
        operator_name: "Lan",
        inspected: 30,
        avg_seconds: 200,
        issue_rate: { numerator: 6, denominator: 30, value: 0.2 },
      },
      {
        operator_name: null,
        inspected: 15,
        avg_seconds: 230,
        issue_rate: { numerator: 0, denominator: 15, value: 0 },
      },
    ],
  };
}

const REPORT_ROLES: Record<ReportTab, Role[]> = {
  returns: ["ADMIN", "SUPERVISOR", "CSKH"],
  claims: ["ADMIN", "SUPERVISOR", "CSKH"],
  productivity: ["ADMIN", "SUPERVISOR"],
};
const CSV_NAME: Record<ReportTab, string> = {
  returns: "bao-cao-hang-hoan",
  claims: "bao-cao-khieu-nai",
  productivity: "bao-cao-nang-suat",
};
const pct = (v: number | null) =>
  v === null
    ? ""
    : `${new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v * 100)}%`;

function buildReport(tab: ReportTab, p: URLSearchParams) {
  const from = p.get("from")!;
  const to = p.get("to")!;
  const platformRaw = p.get("platform");
  const platform = isPlatform(platformRaw) ? platformRaw : null;
  const shopId = p.get("shop_id");
  if (tab === "returns") return returnsReport(from, to, platform, shopId);
  if (tab === "claims") return claimsReport(from, to, platform, shopId);
  return productivityReport(from, to, platform, shopId, p.get("station_id"));
}

/** CSV mẫu (02 §6.2 API-153): mỗi bảng một dòng tiêu đề tiếng Việt, cách nhau một dòng trống, tỷ lệ `4,0%`. */
function toCsv(tab: ReportTab, report: ReturnType<typeof buildReport>): string {
  const lines: string[] = [];
  if (tab === "returns") {
    const r = report as ReturnsReport;
    lines.push("Tỷ lệ theo shop", "Sàn,Shop,Kiện bàn giao,Hồ sơ hàng hoàn,Tỷ lệ");
    for (const s of r.by_shop)
      lines.push(`${s.platform},${s.shop_name},${s.handed_over},${s.return_cases},${pct(s.rate)}`);
    lines.push("", "Sản phẩm bị trả nhiều", "SKU,Sản phẩm,Đã gửi,Yêu cầu trả,Tỷ lệ");
    for (const t of r.top_products)
      lines.push(`${t.sku ?? ""},${t.product_name},${t.shipped},${t.return_requests},${pct(t.rate)}`);
  } else if (tab === "claims") {
    const r = report as ClaimsReport;
    lines.push("Theo shop", "Sàn,Shop,Hồ sơ,Thắng,Thua,Tiền thu hồi");
    for (const s of r.by_shop)
      lines.push(`${s.platform},${s.shop_name},${s.count},${s.won},${s.lost},${s.recovered_amount}`);
    lines.push("", "Theo trạng thái", "Trạng thái,Số hồ sơ");
    for (const s of r.by_status) lines.push(`${s.status},${s.count}`);
  } else {
    const r = report as ProductivityReport;
    lines.push("Theo station", "Station,Kiện,TB giây,Lệch mã,Bỏ dở,Hủy,Đóng lại");
    for (const o of r.by_station)
      lines.push(
        `${o.station_name},${o.packed},${o.avg_seconds ?? ""},${o.mismatch},${o.abandoned},${o.cancelled},${o.repacked}`,
      );
    lines.push("");
    lines.push("Theo người đóng gói", "Người đóng gói,Kiện,TB giây,Lệch mã,Bỏ dở,Hủy,Đóng lại");
    for (const o of r.by_operator)
      lines.push(
        `${o.operator_name ?? "(Không ghi tên)"},${o.packed},${o.avg_seconds ?? ""},${o.mismatch},${o.abandoned},${o.cancelled},${o.repacked}`,
      );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const isTab = (v: unknown): v is ReportTab => v === "returns" || v === "claims" || v === "productivity";

export const reportsHandlers = [
  http.get(`${API}/reports/:tab/export`, ({ request, params }) => {
    const tab = params.tab;
    if (!isTab(tab)) return apiError(404, "NOT_FOUND", "Không tìm thấy báo cáo.");
    const [, denied] = requireRole(request, REPORT_ROLES[tab]);
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const fields = validatePeriod(p.get("from"), p.get("to"));
    if (Object.keys(fields).length)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });
    if (mockReportsState.timeout) return apiError(503, "REPORT_TIMEOUT", "Không tải được báo cáo.");
    return new HttpResponse(toCsv(tab, buildReport(tab, p)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${CSV_NAME[tab]}-${p.get("from")}_${p.get("to")}.csv"`,
      },
    });
  }),

  http.get(`${API}/reports/:tab`, ({ request, params }) => {
    const tab = params.tab;
    if (!isTab(tab)) return undefined;
    const [, denied] = requireRole(request, REPORT_ROLES[tab]);
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const fields = validatePeriod(p.get("from"), p.get("to"));
    if (Object.keys(fields).length)
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields });
    if (mockReportsState.timeout) return apiError(503, "REPORT_TIMEOUT", "Không tải được báo cáo.");
    return json(buildReport(tab, p));
  }),

  http.get(`${API}/reports/daily`, ({ request }) => {
    const [user, denied] = requireRole(request, DASHBOARD_ROLES);
    if (denied) return denied;
    const date = new URL(request.url).searchParams.get("date") ?? vnDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { date: "Sai định dạng" },
      });
    return HttpResponse.json(dailyReport(date, user.role));
  }),
];
