import { api } from "./client";

/** Type theo 02 §6.2 API-10..15 (viết tay tới khi có `pnpm gen:api` — DEC-41). */
export type StationStateName = "READY" | "PACKING" | "MISMATCH" | "WAITING_APPROVAL";
export type TrayMatch = "MATCH" | "NOT_SEEN" | "DIFFERENT" | "MULTIPLE" | "UNAVAILABLE";
export type SessionFlag =
  | "UNVERIFIED"
  | "CAM2_UNVERIFIED"
  | "LABEL_ON_TRAY"
  | "VIDEO_INCOMPLETE"
  | "REPACK"
  | "HAD_MISMATCH"
  | "CLOSED_BY_SUPERVISOR";

export type StationItem = {
  product_name: string;
  variation: string | null;
  quantity: number;
  image_url: string | null;
};

export type StationSession = {
  id: string;
  status: "OPEN" | "MISMATCH" | "WAITING_APPROVAL";
  started_at: string;
  flags: SessionFlag[];
  package: {
    id: string;
    tracking_number: string;
    order: { platform: string; platform_order_sn: string; buyer_note: string | null } | null;
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

export type StationState = {
  station: { id: string; name: string };
  state: StationStateName;
  cameras: { role: "CAM1" | "CAM2"; status: "ONLINE" | "OFFLINE" }[];
  tray: { codes: string[]; match: TrayMatch; updated_at: string | null };
  session: StationSession | null;
  approval_request: ApprovalBrief | null;
  today_count: number;
  server_time: string;
};

export type AlertCode =
  | "ORDER_CANCELLED"
  | "ALREADY_PACKED"
  | "ALREADY_HANDED_OVER"
  | "INVALID_CODE"
  | "PACKED_ELSEWHERE_IN_PROGRESS";

export type ScanAlert = { code: AlertCode; message: string; data: Record<string, unknown> };
export type Outcome = "SESSION_OPENED" | "SESSION_COMPLETED" | "MISMATCH" | "ALERT" | "IGNORED";
export type ScanResult = { outcome: Outcome; alert: ScanAlert | null; state: StationState };

export type CancelReason = "OUT_OF_STOCK" | "WRONG_SCAN" | "OTHER";

export type RecentSession = {
  id: string;
  tracking_number: string;
  status: string;
  flags: SessionFlag[];
  started_at: string;
  ended_at: string | null;
  clips: { id: string; camera_role: "CAM1" | "CAM2"; status: string }[];
};

export const stationApi = {
  state: () => api.get<StationState>("/station/state"),
  scan: (code: string, clientScanId: string) =>
    api.post<ScanResult>("/station/scan", { code, client_scan_id: clientScanId }),
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
};
