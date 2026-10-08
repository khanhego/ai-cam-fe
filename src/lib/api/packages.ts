import type {
  CancelCause,
  EvidenceExclusion,
  Platform,
  PlatformStatusGroup,
  SessionStatus,
  WarehouseStatus,
  WrongScanCode,
} from "@/shared/labels";
import type {
  ClaimBrief,
  Inspection,
  InspectionCorrection,
  ReturnCaseStatus,
  ReturnKind,
  Snapshot,
} from "@/shared/returns/types";

import { api } from "./client";
import type { SessionFlag } from "./station";
import type { ReconAlert } from "./recon";
import type { ReturnListItem } from "./returns";
import type { ShareBrief } from "./shares";
import type { Page } from "./stations";

/** item 03: shop rút gọn trên item danh sách (null = kiện / đơn chưa gắn shop). */
export type ShopRef = { id: string; name: string };

/** API-30, API-31 (02 §6.2); item 02 mở rộng (02 §6.2 "API-30 / API-31 / API-32 mở rộng") + API-122. */
export type PackageListItem = {
  id: string;
  tracking_number: string;
  platform_order_sn: string | null;
  warehouse_status: WarehouseStatus;
  platform_status: string | null;
  /** null với kiện tạm / dữ liệu cũ (C-07). */
  source: "API" | "CSV" | null;
  last_session: { station_name: string; ended_at: string | null } | null;
  has_clip: boolean;
  /** item 02: hồ sơ hàng hoàn đại diện của kiện (hồ sơ mở trước, rồi mới nhất) — null nếu không có. */
  return_case: { id: string; code: string; kind: ReturnKind; status: ReturnCaseStatus } | null;
  /** item 02: kiện tạm của hàng hoàn chưa xác định (chip "Kiện tạm"). */
  is_placeholder: boolean;
  /** item 03 (02 §6.2 API-30 mở rộng): null = kiện / đơn chưa gắn shop. */
  platform: Platform | null;
  shop: ShopRef | null;
};

/** Tham số API-30; cũng là search params của D3 (02b-admin §3 `PackageFilters`). */
export type PackageFilters = {
  q?: string;
  date_from?: string;
  date_to?: string;
  station_id?: string;
  warehouse_status?: string;
  session_status?: string;
  session_flag?: string;
  /** item 02: `PACK` | `RETURN`. */
  session_type?: string;
  /** item 03: lọc sàn / shop (`shop_id` không thuộc `platform` → rỗng). */
  platform?: string;
  shop_id?: string;
  /** item 03: phiên RETURN `CANCELLED` / `ABANDONED` trừ phiên bị loại theo BR-39 (D2 → D3). */
  return_dropped?: boolean;
  source?: string;
  page?: number;
  page_size?: number;
};

/** item 03: `MISSING` = DB có clip nhưng máy chủ không có tệp (không phát / cắt lại / vào link). */
export type ClipStatus = "PENDING" | "READY" | "FAILED" | "DELETED" | "MISSING";

export type Clip = {
  id: string;
  camera_role: "CAM1" | "CAM2";
  status: ClipStatus;
  sha256: string | null;
  duration_s: number | null;
  held: boolean;
  /** READY không giữ → ngày sẽ xóa; giữ → null; DELETED → ngày đã xóa (02 v0.3 DEC-57). */
  retention_until: string | null;
  /** Lúc xóa theo lưu trữ (clip DELETED), v0.3. */
  deleted_at: string | null;
  /** Cờ của clip (vd. `VIDEO_INCOMPLETE`), v0.3. */
  flags: string[];
  /** item 02 (ADR-009): clip được bảo vệ bởi hồ sơ khiếu nại / hàng hoàn / cờ giữ cũ. */
  protected_by_claim: boolean;
  protection: Protection | null;
};

/** 02 §6.2 API-31 v0.2 (DEC-245): lý do bảo vệ clip / ảnh; `until` = hạn khi lý do có hạn. */
export type Protection = {
  reasons: ("CLAIM" | "RETURN_CASE" | "HELD")[];
  claims: string[];
  return_cases: string[];
  until: string | null;
};

/** Lý do hủy phiên (02 §5 `session.cancel_reason`). */
export type CancelReason = "OUT_OF_STOCK" | "WRONG_SCAN" | "OTHER" | "SUPERVISOR" | "NOT_A_RETURN";

/** item 03 (v0.3, API-189): phiên mở hoàn được đánh dấu "Quét nhầm". */
export type WrongScan = {
  at: string;
  by: { id: string; display_name: string };
  code: WrongScanCode;
  note: string;
};
/** item 03 (v0.4, API-189 `CONFIRM_RETURN`). */
export type ReturnConfirmed = { at: string; by: { id: string; display_name: string }; note: string };

/**
 * item 03 (02 §5.1 SESSION v0.3 / v0.4, BR-39): trường phiên RETURN dùng ở D4 / D17 — chỉ đọc. Lý do hiệu lực =
 * `cancel_cause` nếu có, không thì `cancel_reason`.
 */
export type ReturnSessionReview = {
  cancel_cause: CancelCause | null;
  wrong_scan: WrongScan | null;
  review_needed: boolean;
  evidence_exclusion: EvidenceExclusion | null;
  return_confirmed: ReturnConfirmed | null;
};

export type PackageSession = {
  id: string;
  status: SessionStatus;
  station_name: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  flags: SessionFlag[];
  /** v0.3 (DEC-57): chỉ có khi phiên bị hủy. */
  cancel_reason: CancelReason | null;
  note: string | null;
  clips: Clip[];
  /** item 02 (API-31 mở rộng — BE T-115). */
  type: "PACK" | "RETURN";
  operator_name: string | null;
  return_case_id: string | null;
  /** Phiên RETURN: kết luận + `corrections[]` (+ `corrected` = lần sửa gần nhất); phiên PACK → null. */
  inspection: (Inspection & { corrected?: InspectionCorrection | null }) | null;
  /** Sửa kết luận được (RETURN `COMPLETED` ≤ 7 ngày, người xem ADMIN / SUPERVISOR — API-113). */
  can_correct: boolean;
  /** Ảnh chụp tay (F2) của phiên; ảnh đã xóa / thiếu tệp (item 03 `MISSING`) → `url = null`. */
  snapshots: (Omit<Snapshot, "url"> & { url: string | null; protection: Protection | null })[];
  /** Phiên PACK: ảnh Cam 1 lúc đóng gói (J-17, L8); ảnh đã xóa → `url = null`. */
  pack_snapshot: { id: string; url: string | null; status: "READY" | "DELETED" | "MISSING" } | null;
  protected_by_claims: { id: string; code: string }[];
};

export type PackageDetail = {
  id: string;
  tracking_number: string;
  warehouse_status: WarehouseStatus;
  platform_logistics_status: string | null;
  verified: boolean;
  order: {
    id: string;
    platform: Platform;
    platform_order_sn: string;
    platform_status: string | null;
    buyer_note: string | null;
    source: "API" | "CSV";
    items: {
      product_name: string;
      variation: string | null;
      quantity: number;
      image_url: string | null;
      /** item 03: đơn của dòng khi kiện gộp. */
      platform_order_sn?: string | null;
    }[];
    /** item 03 (API-31 mở rộng). */
    shop: (ShopRef & { platform: Platform }) | null;
    platform_status_group: PlatformStatusGroup | null;
    merged_orders: { platform_order_sn: string }[];
  } | null;
  sessions: PackageSession[];
  /** item 02 (API-31 mở rộng — BE T-115). Hồ sơ hàng hoàn mới trước (gồm hồ sơ đã gộp / hủy). */
  is_placeholder: boolean;
  return_cases: ReturnListItem[];
  /** Cảnh báo lệch của kiện, mới phát hiện trước. */
  recon_alerts: Pick<
    ReconAlert,
    "id" | "rule" | "br" | "severity" | "status" | "detected_at" | "closed_at"
  >[];
  /** Hồ sơ khiếu nại của kiện, mới tạo trước. */
  claims: (ClaimBrief & { type: string })[];
  /** Đích "Điều chỉnh trạng thái" (API-122) theo trạng thái kho; rỗng → ẩn nút. */
  allowed_status_targets: WarehouseStatus[];
  /** item 03 (API-31): ≤ 3 link mới nhất (trừ `FAILED`) có phiên của kiện + số link đang hoạt động. */
  shares: ShareBrief[];
  shares_active_count: number;
  timeline: {
    at: string;
    source: "PLATFORM" | "WAREHOUSE" | "MANUAL";
    /** v0.3 (DEC-57). */
    from_status: string | null;
    to_status: string;
    actor: string | null;
    /**
     * item 03 (02 §6.2 API-31: "sự kiện phiên có `AMBIGUOUS_SHOP` thêm `{shops: [{platform, name}]}` trong dòng thời
     * gian"): có → dòng "Mã có ở {n} shop: …" thay chữ trạng thái (DEC-603 — shape chờ BE T-206 xác nhận).
     */
    shops?: { platform: Platform; name: string }[];
  }[];
};

/** API-122 (02 §6.2): điều chỉnh tay `warehouse_status` — lý do 5–500; `recon_alert_id` → cảnh báo RESOLVED. */
export type AdjustStatusBody = { to_status: WarehouseStatus; reason: string; recon_alert_id?: string | null };
export type AdjustStatusResult = {
  package: { id: string; tracking_number: string; warehouse_status: WarehouseStatus };
  recon_alert: ReconAlert | null;
};

export const packagesApi = {
  search: (filters: PackageFilters) => api.get<Page<PackageListItem>>("/packages", { query: filters }),
  get: (id: string) => api.get<PackageDetail>(`/packages/${id}`),
  /** 409 TRANSITION_NOT_ALLOWED (`details.allowed`) / SESSION_ACTIVE; 422 VALIDATION_ERROR. */
  adjustStatus: (id: string, body: AdjustStatusBody) =>
    api.post<AdjustStatusResult>(`/packages/${id}/warehouse-status`, body),
};
