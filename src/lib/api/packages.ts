import type { SessionStatus, WarehouseStatus } from "@/shared/labels";
import type { ClaimBrief, Inspection, ReturnCaseStatus, ReturnKind, Snapshot } from "@/shared/returns/types";

import { api } from "./client";
import type { SessionFlag } from "./station";
import type { ReconAlert } from "./recon";
import type { ReturnListItem } from "./returns";
import type { Page } from "./stations";

/** API-30, API-31 (02 §6.2); item 02 mở rộng (02 §6.2 "API-30 / API-31 / API-32 mở rộng") + API-122. */
export type PackageListItem = {
  id: string;
  tracking_number: string;
  platform_order_sn: string | null;
  warehouse_status: WarehouseStatus;
  platform_status: string | null;
  source: "API" | "CSV";
  last_session: { station_name: string; ended_at: string | null } | null;
  has_clip: boolean;
  /** item 02: hồ sơ hàng hoàn của kiện (null nếu không có). */
  return_case?: { id: string; code: string; kind: ReturnKind; status: ReturnCaseStatus } | null;
  /** item 02: kiện tạm của hàng hoàn chưa xác định (chip "Kiện tạm"). */
  is_placeholder?: boolean;
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
  source?: string;
  page?: number;
  page_size?: number;
};

export type ClipStatus = "PENDING" | "READY" | "FAILED" | "DELETED";

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
  protected_by_claim?: boolean;
  protection?: Protection | null;
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
  /** item 02: thiếu → PACK (BE trước T-115). */
  type?: "PACK" | "RETURN";
  operator_name?: string | null;
  return_case_id?: string | null;
  /** Phiên RETURN: kết luận + `corrections[]`. */
  inspection?: Inspection | null;
  /** Sửa kết luận được (≤ 7 ngày, ADMIN / SUPERVISOR — API-113). */
  can_correct?: boolean;
  snapshots?: (Snapshot & { protection?: Protection | null })[];
  /** Phiên PACK: ảnh Cam 1 lúc đóng gói (J-17, L8). */
  pack_snapshot?: { id: string; url: string; status: string } | null;
  protected_by_claims?: { id: string; code: string }[];
};

export type PackageDetail = {
  id: string;
  tracking_number: string;
  warehouse_status: WarehouseStatus;
  platform_logistics_status: string | null;
  verified: boolean;
  order: {
    id: string;
    platform: string;
    platform_order_sn: string;
    platform_status: string | null;
    buyer_note: string | null;
    source: "API" | "CSV";
    items: { product_name: string; variation: string | null; quantity: number; image_url: string | null }[];
  } | null;
  sessions: PackageSession[];
  /** item 02 (API-31 mở rộng); thiếu → BE trước T-115. */
  is_placeholder?: boolean;
  return_cases?: ReturnListItem[];
  recon_alerts?: Pick<
    ReconAlert,
    "id" | "rule" | "br" | "severity" | "status" | "detected_at" | "closed_at"
  >[];
  claims?: ClaimBrief[];
  /** Đích "Điều chỉnh trạng thái" (API-122); rỗng → ẩn menu. */
  allowed_status_targets?: WarehouseStatus[];
  timeline: {
    at: string;
    source: "PLATFORM" | "WAREHOUSE" | "MANUAL";
    /** v0.3 (DEC-57). */
    from_status: string | null;
    to_status: string;
    actor: string | null;
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
