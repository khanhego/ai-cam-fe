import type { Platform } from "@/shared/labels";
import type { Conclusion, ReturnKind } from "@/shared/returns/types";

import { api } from "./client";
import type { ClaimStatus, ClaimType, Counterparty } from "./claims";

/** API-32 `GET /reports/daily?date=` (02 §6.2). */
export type DailyCounts = {
  packed: number;
  had_mismatch: number;
  abandoned: number;
  cancelled: number;
  packed_not_handed_over: number;
  cancelled_after_pack: number;
};

/**
 * item 02 (02 §6.2 API-32 `counts` thêm, §6.5 #9; BE T-115). Số Phase 1 ở `DailyCounts` chỉ đếm phiên PACK.
 * `returns_received` / `_issue`: phiên hoàn hoàn tất trong ngày (không tính kiện tạm); `returns_unidentified`: phiên hoàn
 * hoàn tất trong ngày trên kiện tạm; `returns_expected` / `_missing`, `recon_open`, `claims_*`: hiện tại.
 */
export type ReturnCounts = {
  returns_received: number;
  returns_received_issue: number;
  returns_unidentified: number;
  returns_expected: number;
  returns_missing: number;
  recon_open: { HIGH: number; MEDIUM: number; LOW: number };
  claims_open: number;
  claims_due_soon: number;
  label_on_tray: number;
  cam2_unverified: number;
};

/**
 * item 03 (02 §6.2 "API-32 mở rộng"): số hiện tại (không theo ngày). `returns_dropped_7d` = phiên RETURN hủy / bỏ dở có
 * `ended_at` trong 7 ngày trừ phiên bị loại theo BR-39 v0.4; `refund_only_pending` (BR-40); `claims_overdue_unsent` (BR-42).
 */
export type Phase3Counts = {
  returns_dropped_7d: number;
  refund_only_pending: number;
  claims_overdue_unsent: number;
};

export type DailyStation = {
  id: string;
  name: string;
  state: "READY" | "PACKING" | "MISMATCH" | "WAITING_APPROVAL" | "INSPECTING";
  cameras: { role: "CAM1" | "CAM2"; status: "ONLINE" | "OFFLINE" }[];
  last_scan_at: string | null;
  /** item 02: chế độ làm việc + người kiểm (chế độ nhận hoàn). */
  work_mode: "PACK" | "RETURN";
  operator_name: string | null;
  /** Kiện của phiên đang mở (null khi không có) — v0.3 (DEC-57). */
  tracking_number: string | null;
};

export type AttentionItem =
  | { kind: "CANCELLED_AFTER_PACK"; count: number }
  | { kind: "CAMERA_OFFLINE"; camera_id: string; station_name: string; role: "CAM1" | "CAM2" }
  | {
      kind: "CLOCK_DRIFT";
      camera_id: string;
      offset_ms: number;
      station_name?: string;
      role?: "CAM1" | "CAM2";
    }
  | { kind: "APPROVAL_PENDING"; count: number }
  /** Số clip FAILED tạo trong 7 ngày gần nhất — v0.3 (DEC-57). */
  | { kind: "CLIP_FAILED"; count: number }
  /** item 03: chỉ ADMIN; thêm `shop_name`, `platform`, `code` (vd `AUTH_EXPIRED`). */
  | {
      kind: "SYNC_ERROR";
      shop_id: string;
      at: string;
      shop_name?: string | null;
      platform?: Platform;
      code?: string | null;
    }
  | { kind: "DISK_USAGE"; percent: number };

/** Mục "Cần xử lý" mới của item 02 (02 §6.2 API-32, §6.3 #13, §6.5 #1) — D2 hiển thị từ T-160. */
export type ReturnAttentionItem =
  | { kind: "RETURN_MISSING"; count: number }
  | { kind: "RECON_HIGH"; count: number }
  | { kind: "CLAIM_DUE_SOON"; count: number }
  | { kind: "RETURN_UNIDENTIFIED"; count: number }
  | { kind: "RETURN_SESSION_ABANDONED"; count: number }
  | { kind: "RETURN_FORCE_NEW"; count: number };

/** `BACKUP_STALE.reason` (DEC-500, DEC-517). */
export type BackupStaleReason =
  "DB_LATE" | "DB_FAILED_TWICE" | "EVIDENCE_LATE" | "HASH_MISMATCH" | "SOURCE_MISSING" | "ERROR";

/** Mục "Cần xử lý" mới của item 03 (02 §6.2 API-32). `BACKUP_STALE` chỉ ADMIN (server lọc). */
export type Phase3AttentionItem =
  | { kind: "REFUND_ONLY_PENDING"; count: number; nearest_due_at: string | null }
  | { kind: "CLAIM_OVERDUE"; count: number }
  | { kind: "RETURN_SESSION_DROPPED"; count: number }
  | { kind: "BACKUP_STALE"; reason: BackupStaleReason; hours?: number | null; count?: number | null }
  /** G3 (02 §6.2 API-32 bổ sung): kiện hủy oan chờ chạy `aicam fix-cancel-requests` — chỉ ADMIN (server lọc). */
  | { kind: "CANCEL_REVERT_PENDING"; count: number };

/** Mục D2 đang hiển thị (item 03 T-261: gồm `Phase3AttentionItem`). */
export type AnyAttentionItem = AttentionItem | ReturnAttentionItem | Phase3AttentionItem;

export const PHASE3_ATTENTION_KINDS = [
  "REFUND_ONLY_PENDING",
  "CLAIM_OVERDUE",
  "RETURN_SESSION_DROPPED",
  "BACKUP_STALE",
  "CANCEL_REVERT_PENDING",
] as const satisfies readonly Phase3AttentionItem["kind"][];

export const ATTENTION_KINDS = [
  "CANCELLED_AFTER_PACK",
  "CAMERA_OFFLINE",
  "CLOCK_DRIFT",
  "APPROVAL_PENDING",
  "CLIP_FAILED",
  "SYNC_ERROR",
  "DISK_USAGE",
  "RETURN_MISSING",
  "RECON_HIGH",
  "CLAIM_DUE_SOON",
  "RETURN_UNIDENTIFIED",
  "RETURN_SESSION_ABANDONED",
  "RETURN_FORCE_NEW",
  ...PHASE3_ATTENTION_KINDS,
] as const satisfies readonly AnyAttentionItem["kind"][];

/** Contract: "client bỏ qua kind không biết" (02 §6.2 API-32) — server có thể thêm kind mới mà không đổi phiên bản. */
export const isKnownAttention = (item: { kind: string }): item is AnyAttentionItem =>
  (ATTENTION_KINDS as readonly string[]).includes(item.kind);

export type DailyReport = {
  date: string;
  counts: DailyCounts & ReturnCounts & Phase3Counts;
  stations: DailyStation[];
  /** Server có thể trả kind chưa biết — lọc bằng `isKnownAttention`. */
  attention: AnyAttentionItem[];
};

// ───────────────────────── item 03: báo cáo D20 (API-150..153) ─────────────────────────

export type ReportTab = "returns" | "claims" | "productivity";

/** Query chung: `from`, `to` = `YYYY-MM-DD` giờ VN gồm 2 đầu (≤ 366 ngày, `to ≤ hôm nay`); `station_id` chỉ năng suất. */
export type ReportQuery = {
  from: string;
  to: string;
  platform?: Platform | null;
  shop_id?: string | null;
  station_id?: string | null;
};

/** Tỷ lệ: mẫu số 0 → `value = null` (FE "—"). */
export type Rate = { numerator: number; denominator: number; value: number | null };
export type SeriesPoint = { bucket: string; packed: number; return_cases: number; claims: number };
export type SeriesGranularity = "day" | "week" | "month";

type ReportBase = {
  period: { from: string; to: string };
  filters: { platform: Platform | null; shop_id: string | null; station_id?: string | null };
  generated_at: string;
};

/** API-150 (BR-41). */
export type ReturnsReport = ReportBase & {
  cards: {
    return_rate: Rate;
    issue_rate: Rate;
    refund_only: { count: number; rate_of_handed_over: number | null };
    expected_now: number;
  };
  /** `share` null với loại không có tín hiệu sàn (`UNANNOUNCED`, `UNIDENTIFIED`). */
  by_kind: { kind: ReturnKind; count: number; share: number | null }[];
  reason_by_conclusion: {
    conclusions: Conclusion[];
    rows: {
      reason: string | null;
      reason_label: string | null;
      counts: Partial<Record<Conclusion, number>>;
      total: number;
    }[];
  };
  top_products: {
    sku: string | null;
    product_name: string;
    variation: string | null;
    shipped: number;
    return_requests: number;
    rate: number | null;
    issue: number;
  }[];
  /** `platform/shop_id/shop_name = null` = đơn nhập CSV không gắn shop (BE `ReturnShopRow` / `ClaimShopRow`). */
  by_shop: {
    platform: Platform | null;
    shop_id: string | null;
    shop_name: string | null;
    handed_over: number;
    return_cases: number;
    rate: number | null;
  }[];
  series: SeriesPoint[];
  series_granularity: SeriesGranularity;
};

/** API-151. */
export type ClaimsReport = ReportBase & {
  cards: {
    created: number;
    win_rate: Rate;
    recovered_amount: number;
    submitted_before_deadline: Rate;
    overdue_unsent_now: number;
  };
  by_status: { status: ClaimStatus; count: number }[];
  by_type_result: { type: ClaimType; won: number; lost: number; pending: number }[];
  by_counterparty: {
    counterparty: Counterparty;
    count: number;
    won: number;
    lost: number;
    recovered_amount: number;
  }[];
  /** `platform/shop_id/shop_name = null` = đơn nhập CSV không gắn shop (BE `ReturnShopRow` / `ClaimShopRow`). */
  by_shop: {
    platform: Platform | null;
    shop_id: string | null;
    shop_name: string | null;
    count: number;
    won: number;
    lost: number;
    recovered_amount: number;
  }[];
  series: SeriesPoint[];
  series_granularity: SeriesGranularity;
};

export type OperatorProductivity = {
  /** null = "(Không ghi tên)" — FE đặt cuối bảng. */
  operator_name: string | null;
  packed: number;
  avg_seconds: number | null;
  mismatch: number;
  abandoned: number;
  cancelled: number;
  repacked: number;
};

/** API-152 (ADMIN, SUPERVISOR; CSKH → 403). */
export type ProductivityReport = ReportBase & {
  cards: {
    packed: number;
    pack_avg_seconds: number | null;
    returns_inspected: number;
    return_avg_seconds: number | null;
  };
  by_station: (Omit<OperatorProductivity, "operator_name"> & { station_id: string; station_name: string })[];
  by_operator: OperatorProductivity[];
  return_by_operator: {
    operator_name: string | null;
    inspected: number;
    avg_seconds: number | null;
    issue_rate: Rate;
  }[];
};

export type ReportByTab = { returns: ReturnsReport; claims: ClaimsReport; productivity: ProductivityReport };

const reportQuery = (q: ReportQuery) => ({
  from: q.from,
  to: q.to,
  platform: q.platform,
  shop_id: q.shop_id,
  station_id: q.station_id,
});

export const reportsApi = {
  daily: (date: string) => api.get<DailyReport>("/reports/daily", { query: { date } }),
  /** API-150..152: 422 `fields.from` / `fields.to`; 503 REPORT_TIMEOUT; 403 (CSKH + năng suất). */
  report: <T extends ReportTab>(tab: T, q: ReportQuery) =>
    api.get<ReportByTab[T]>(`/reports/${tab}`, {
      query: { ...reportQuery(q), station_id: tab === "productivity" ? q.station_id : undefined },
    }),
  returns: (q: ReportQuery) => reportsApi.report("returns", q),
  claims: (q: ReportQuery) => reportsApi.report("claims", q),
  productivity: (q: ReportQuery) => reportsApi.report("productivity", q),
  /** API-153: CSV (BOM, `Content-Disposition` có tên file) — dùng `saveBlob`. */
  exportCsv: (tab: ReportTab, q: ReportQuery) =>
    api.blob(`/reports/${tab}/export`, {
      query: { ...reportQuery(q), station_id: tab === "productivity" ? q.station_id : undefined },
    }),
};
