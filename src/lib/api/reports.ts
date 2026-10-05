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

export type DailyStation = {
  id: string;
  name: string;
  state: "READY" | "PACKING" | "MISMATCH" | "WAITING_APPROVAL";
  cameras: { role: "CAM1" | "CAM2"; status: "ONLINE" | "OFFLINE" }[];
  last_scan_at: string | null;
  /** Kiện đang đóng gói (null khi không có phiên mở) — tùy chọn, v0.3 (DEC-57). */
  tracking_number?: string | null;
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

export const ATTENTION_KINDS = [
  "CANCELLED_AFTER_PACK",
  "CAMERA_OFFLINE",
  "CLOCK_DRIFT",
  "APPROVAL_PENDING",
  "CLIP_FAILED",
  "SYNC_ERROR",
  "DISK_USAGE",
] as const satisfies readonly AttentionItem["kind"][];

/** Contract: "client bỏ qua kind không biết" (02 §6.2 API-32) — server có thể thêm kind mới mà không đổi phiên bản. */
export const isKnownAttention = (item: { kind: string }): item is AttentionItem =>
  (ATTENTION_KINDS as readonly string[]).includes(item.kind);

export type DailyReport = {
  date: string;
  counts: DailyCounts;
  stations: DailyStation[];
  attention: AttentionItem[];
};

export const reportsApi = {
  daily: (date: string) => api.get<DailyReport>("/reports/daily", { query: { date } }),
};
