import { api } from "./client";

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
  | { kind: "SYNC_ERROR"; shop_id: string; at: string }
  | { kind: "DISK_USAGE"; percent: number };

/** Mục "Cần xử lý" mới của item 02 (02 §6.2 API-32, §6.3 #13, §6.5 #1) — D2 hiển thị từ T-160. */
export type ReturnAttentionItem =
  | { kind: "RETURN_MISSING"; count: number }
  | { kind: "RECON_HIGH"; count: number }
  | { kind: "CLAIM_DUE_SOON"; count: number }
  | { kind: "RETURN_UNIDENTIFIED"; count: number }
  | { kind: "RETURN_SESSION_ABANDONED"; count: number }
  | { kind: "RETURN_FORCE_NEW"; count: number };

export type AnyAttentionItem = AttentionItem | ReturnAttentionItem;

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
] as const satisfies readonly AnyAttentionItem["kind"][];

/** Contract: "client bỏ qua kind không biết" (02 §6.2 API-32) — server có thể thêm kind mới mà không đổi phiên bản. */
export const isKnownAttention = (item: { kind: string }): item is AnyAttentionItem =>
  (ATTENTION_KINDS as readonly string[]).includes(item.kind);

export type DailyReport = {
  date: string;
  counts: DailyCounts & ReturnCounts;
  stations: DailyStation[];
  attention: AnyAttentionItem[];
};

export const reportsApi = {
  daily: (date: string) => api.get<DailyReport>("/reports/daily", { query: { date } }),
};
