import type {
  Conclusion,
  Inspection,
  InspectionInput,
  ReturnCaseStatus,
  ReturnKind,
  Snapshot,
} from "@/shared/returns/types";
import type { Platform } from "@/shared/labels";

import { api } from "./client";

/**
 * Type theo 02 §6.2 API-10..15 (viết tay tới khi có `pnpm gen:api` — DEC-41), mở rộng item 02 (02 §6.1 "Mở rộng",
 * API-100..105 — T-131) và item 03 (02 §6.2 "API-10 / API-11 / API-12 mở rộng", API-104 — T-231).
 */
export type StationStateName = "READY" | "PACKING" | "MISMATCH" | "WAITING_APPROVAL" | "INSPECTING";
/** Loại station (`BOTH` chỉ có ở `kind`) và chế độ bàn hiện tại (02 §5.2). */
export type StationKind = "PACK" | "RETURN" | "BOTH";
export type WorkMode = "PACK" | "RETURN";
export type SessionType = "PACK" | "RETURN";
export type TrayMatch = "MATCH" | "NOT_SEEN" | "DIFFERENT" | "MULTIPLE" | "UNAVAILABLE";
export type SessionFlag =
  | "UNVERIFIED"
  | "CAM2_UNVERIFIED"
  | "LABEL_ON_TRAY"
  | "VIDEO_INCOMPLETE"
  | "REPACK"
  | "HAD_MISMATCH"
  | "CLOSED_BY_SUPERVISOR"
  // item 02 (02 §5.2 `session.flags` thêm)
  | "AUTO_CLOSED"
  | "ORDER_CANCELLED"
  | "NO_PACK_CLIP"
  | "UNANNOUNCED"
  | "UNIDENTIFIED"
  | "INSPECTION_CORRECTED"
  // item 03 (02 §5.2 `session.flags` thêm)
  | "AMBIGUOUS_SHOP"
  | "ORDER_CANCEL_REQUESTED";

export type StationItem = {
  /** item 02: có ở API-10 mở rộng (dòng kiểm hàng hoàn trỏ về dòng đơn). */
  order_item_id?: string;
  product_name: string;
  variation: string | null;
  quantity: number;
  image_url: string | null;
  /** item 03: đơn của dòng (kiện gộp — FR-05.22); luôn có khi `package.order` có. */
  platform_order_sn?: string | null;
};

/** `session.package.order` ở API-10 (item 03: sàn, shop, kiện gộp). null → kiện chưa xác minh ("Chưa rõ sàn"). */
export type StationOrder = {
  platform: Platform;
  /** null = đơn chưa gắn shop (đơn nhập file). */
  shop_name: string | null;
  platform_order_sn: string;
  buyer_note: string | null;
  /** Đơn **thêm** cùng mã vận đơn; rỗng khi không gộp. */
  merged_orders: { platform_order_sn: string }[];
};

/** `session.return_case` ở API-10 (phiên RETURN). */
export type StationReturnCase = {
  id: string;
  code: string;
  kind: ReturnKind;
  status: ReturnCaseStatus;
  platform_return_sn: string | null;
  return_tracking_number: string | null;
  reason: string | null;
  reason_text: string | null;
  reason_label: string | null;
  package_count: number;
  received_count: number;
};

/** Phiên PACK hiệu lực của kiện đang kiểm (cột "Lúc đóng gói" ở R2); null → cờ `NO_PACK_CLIP`. */
export type PackReference = {
  session_id: string;
  /** BE có thể null (sessions/schemas.py). */
  ended_at: string | null;
  station_name: string;
  clips: { id: string; camera_role: "CAM1" | "CAM2"; status: string }[];
  snapshot: { id: string; url: string } | null;
};

export type StationSession = {
  id: string;
  /** item 02 (02 §6.2 API-10). */
  type: SessionType;
  status: "OPEN" | "MISMATCH" | "WAITING_APPROVAL";
  started_at: string;
  flags: SessionFlag[];
  operator_name: string | null;
  /**
   * item 03 (BR-37): phiên RETURN `OPEN` chưa lưu kết luận, chưa có ảnh `MANUAL` → `started_at + 60 giây`; còn lại null.
   * FE so với giờ server (`server_time`); server vẫn là nơi chặn (API-12 409 `CANCEL_REQUIRES_SUPERVISOR`).
   */
  self_cancel_until: string | null;
  /** Chỉ phiên RETURN; PACK → null (02 §6.2 API-10). */
  return_case: StationReturnCase | null;
  inspection: Inspection | null;
  snapshots: Snapshot[] | null;
  pack_reference: PackReference | null;
  package: {
    id: string;
    tracking_number: string;
    order: StationOrder | null;
    items: StationItem[];
  };
  mismatch: { source: "SCAN" | "CAM2"; expected: string; actual: string } | null;
  warn_at: string;
  abandon_at: string;
};

export type ApprovalBrief = {
  id: string;
  type: "MISMATCH" | "ASSIST" | "REPACK";
  tracking_number: string;
  created_at: string;
};

export type StationInfo = {
  id: string;
  name: string;
  kind: StationKind;
  work_mode: WorkMode;
  /** null + `work_mode = RETURN` → FE mở R5 (BR-28). */
  operator_name: string | null;
  /** item 03 (FR-03.16): Admin bật `packer_name_required` → chế độ PACK quét khi chưa có tên trả `OPERATOR_REQUIRED`. */
  operator_required: boolean;
};

export type StationState = {
  station: StationInfo;
  state: StationStateName;
  cameras: { role: "CAM1" | "CAM2"; status: "ONLINE" | "OFFLINE" }[];
  tray: { codes: string[]; match: TrayMatch; updated_at: string | null };
  session: StationSession | null;
  approval_request: ApprovalBrief | null;
  today_count: number;
  today_return_count: number;
  today_return_issue_count: number;
  server_time: string;
};

export type AlertCode =
  | "ORDER_CANCELLED"
  | "ALREADY_PACKED"
  | "ALREADY_HANDED_OVER"
  | "INVALID_CODE"
  | "PACKED_ELSEWHERE_IN_PROGRESS"
  // item 02 — chế độ RETURN (02 §6.2 API-11)
  | "OPERATOR_REQUIRED"
  | "RETURN_NOT_FOUND"
  | "RETURN_ALREADY_RECEIVED"
  | "RETURN_MULTIPLE_PACKAGES"
  | "NOT_SHIPPED"
  | "RETURN_IN_PROGRESS_ELSEWHERE"
  | "INSPECTION_REQUIRED"
  | "RETURN_CODE_DIFFERENT"
  // item 03 (02 §5.2 `alert.code` thêm)
  | "ORDER_CANCEL_REQUESTED"
  | "RETURN_MULTIPLE_ORDERS";

/** Mã alert chỉ ở chế độ RETURN; hai mã cuối hiện tại chỗ R2, không overlay (02b-station §8). */
export const RETURN_ALERT_CODES = [
  "OPERATOR_REQUIRED",
  "RETURN_NOT_FOUND",
  "RETURN_ALREADY_RECEIVED",
  "RETURN_MULTIPLE_PACKAGES",
  "NOT_SHIPPED",
  "RETURN_IN_PROGRESS_ELSEWHERE",
  "INSPECTION_REQUIRED",
  "RETURN_CODE_DIFFERENT",
  "RETURN_MULTIPLE_ORDERS",
] as const satisfies readonly AlertCode[];

/** `alert.data` của `OPERATOR_REQUIRED` (item 03: cả chế độ PACK khi `operator_required`). */
export type OperatorRequiredData = { mode: WorkMode };

/** Một đơn khớp mã ở bàn hoàn (`RETURN_MULTIPLE_ORDERS`, BR-29 / EX-R20). */
export type MatchedOrder = { platform: Platform; shop_name: string | null; platform_order_sn: string };
/** `alert.data` của `RETURN_MULTIPLE_ORDERS`: FE mở R3 với `code`. */
export type ReturnMultipleOrdersData = { code: string; orders: MatchedOrder[] };

export type ScanAlert = { code: AlertCode; message: string; data: Record<string, unknown> };
export type Outcome = "SESSION_OPENED" | "SESSION_COMPLETED" | "MISMATCH" | "ALERT" | "IGNORED";

/** Phiên vừa đóng (API-11 `SESSION_COMPLETED`, WS-01 `SESSION_AUTO_CLOSED`) — thông báo FR-03.14 / R1. */
export type ClosedSession = {
  id: string;
  type: SessionType;
  tracking_number: string;
  flags: SessionFlag[];
  conclusion: Conclusion | null;
  claim_code: string | null;
  package_status: string;
  /** Chỉ phiên RETURN. */
  return_case_status?: ReturnCaseStatus;
};

export type ScanResult = {
  outcome: Outcome;
  alert: ScanAlert | null;
  state: StationState;
  /** item 02: có khi `outcome = SESSION_COMPLETED`. */
  closed_session?: ClosedSession | null;
};

/** PACK: Hết hàng / Quét nhầm / Khác · RETURN: Quét nhầm / Không phải hàng hoàn / Khác (02 §5.2). */
export type CancelReason = "OUT_OF_STOCK" | "WRONG_SCAN" | "OTHER" | "NOT_A_RETURN";

/** Kết quả tìm thủ công R3 (API-104). */
export type ReturnLookupItem = {
  package_id: string;
  tracking_number: string;
  platform_order_sn: string | null;
  warehouse_status: string;
  return_case: {
    id: string;
    code: string;
    kind: ReturnKind;
    status: ReturnCaseStatus;
    return_tracking_number: string | null;
  } | null;
  can_open: boolean;
  /** Mã alert khi `can_open = false` (NOT_SHIPPED, RETURN_ALREADY_RECEIVED, …). */
  blocked_reason: AlertCode | null;
  /** item 03 (API-104): null = kiện / đơn chưa gắn shop. */
  platform: Platform | null;
  shop_name: string | null;
};
export type ReturnLookup = { items: ReturnLookupItem[]; platform_checked: boolean };

/** API-105: mở từ kết quả tìm, hoặc phiên chưa xác định (`force_new` cần `note` 5–200 — 02 §6.4 #2). */
export type OpenReturnSessionBody =
  | { package_id: string; client_scan_id: string }
  | { unidentified_code: string; client_scan_id: string; force_new?: false }
  | { unidentified_code: string; client_scan_id: string; force_new: true; note: string };

/** WS-01 `alert` (02 §6.2 WS-01): mã Phase 1 + item 02. */
export type StationServerAlert =
  | { code: "SESSION_ABANDONED"; session_id?: string; tracking_number?: string }
  /** J-07 tới `warn_at` (BE gửi; FE tự tính cảnh báo theo `warn_at` nên chỉ dùng để flush nháp). */
  | { code: "SESSION_WARN"; session_id: string; minutes: number; reason?: "INSPECTION_INCOMPLETE" }
  | { code: "SESSION_CANCELLED_BY_SUPERVISOR"; session_id?: string; tracking_number?: string }
  | { code: "ORDER_CANCELLED_DURING_SESSION"; session_id: string; tracking_number: string }
  | {
      code: "SESSION_AUTO_CLOSED";
      session_id: string;
      tracking_number: string;
      closed_session: ClosedSession;
    };

export type RecentSession = {
  id: string;
  tracking_number: string;
  status: string;
  flags: SessionFlag[];
  /** item 02 (API-15 mở rộng). */
  type: SessionType;
  conclusion: Conclusion | null;
  claim_code: string | null;
  started_at: string;
  ended_at: string | null;
  clips: { id: string; camera_role: "CAM1" | "CAM2"; status: string }[];
};

export const stationApi = {
  state: () => api.get<StationState>("/station/state"),
  scan: (code: string, clientScanId: string) =>
    api.post<ScanResult>("/station/scan", { code, client_scan_id: clientScanId }),
  /** API-12. Phiên RETURN ngoài BR-37 → 409 `CANCEL_REQUIRES_SUPERVISOR` (item 03). */
  cancel: (sessionId: string, reason: CancelReason, note?: string) =>
    api.post<{ state: StationState }>(`/station/sessions/${sessionId}/cancel`, {
      reason,
      note: note || null,
    }),
  recent: () => api.get<{ items: RecentSession[] }>("/station/sessions/recent"),
  requestApproval: (
    body: { type: "MISMATCH" | "ASSIST"; session_id: string } | { type: "REPACK"; tracking_number: string },
  ) => api.post<{ approval_request: ApprovalBrief; state: StationState }>("/station/approval-requests", body),
  withdrawApproval: (id: string) =>
    api.post<{ state: StationState }>(`/station/approval-requests/${id}/withdraw`),
  /** API-100: đổi chế độ bàn (chỉ station `BOTH`). 409 MODE_NOT_ALLOWED / SESSION_ACTIVE. */
  setWorkMode: (workMode: WorkMode) =>
    api.put<{ state: StationState }>("/station/work-mode", { work_mode: workMode }),
  /** API-101: tên người kiểm / người đóng gói (item 03 — strip, 2–40). 409 SESSION_ACTIVE, 422 VALIDATION_ERROR. */
  setOperator: (name: string) => api.put<{ state: StationState }>("/station/operator", { name }),
  /** API-102: lưu nháp kết luận (ghi đè toàn bộ). */
  saveInspection: (sessionId: string, body: InspectionInput) =>
    api.put<{ inspection: Inspection }>(`/station/sessions/${sessionId}/inspection`, body),
  /** API-103: chụp ảnh Cam 1 (body rỗng) → 201. */
  takeSnapshot: (sessionId: string) =>
    api.post<{ snapshot: Snapshot }>(`/station/sessions/${sessionId}/snapshots`),
  /** API-104: tìm thủ công (q: strip + upper, 4–40). */
  returnLookup: (q: string) =>
    api.get<ReturnLookup>("/station/return-lookup", { query: { q: q.trim().toUpperCase() } }),
  /** API-105: mở phiên hoàn — trả cùng dạng API-11. */
  openReturnSession: (body: OpenReturnSessionBody) => api.post<ScanResult>("/station/return-sessions", body),
};
