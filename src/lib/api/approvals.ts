import { api } from "./client";
import type { TrayMatch } from "./station";
import type { Page } from "./stations";

/** API-20 / API-21 (02 §6.2) — yêu cầu duyệt từ station (DEC-5, FR-03.10, 03.12). */
export type ApprovalType = "MISMATCH" | "ASSIST" | "REPACK";
export type ApprovalAction = "CONTINUE" | "CLOSE_WITH_NOTE" | "CANCEL_SESSION" | "APPROVE_REPACK" | "REJECT";

export type ApprovalContext = {
  expected?: string | null;
  actual?: string | null;
  source?: "SCAN" | "CAM2" | null;
  tray_match?: TrayMatch | null;
};

export type ApprovalItem = {
  id: string;
  type: ApprovalType;
  status: "PENDING" | "RESOLVED" | "WITHDRAWN";
  station: { id: string; name: string };
  session_id: string | null;
  tracking_number: string;
  context: ApprovalContext | null;
  created_at: string;
  /** item 02 (02 §6.2 API-20 mở rộng): loại phiên của yêu cầu (null khi không gắn phiên) + người kiểm. */
  session_type: "PACK" | "RETURN" | null;
  operator_name: string | null;
  /** v0.4 (DEC-61): có khi đã xử lý; `decided_at` có cả khi `WITHDRAWN` (DEC-60). */
  decision: ApprovalAction | null;
  decided_by: { id: string; display_name: string } | null;
  decided_at: string | null;
  note: string | null;
};

export type ApprovalDecision = {
  approval_request: {
    id: string;
    status: "RESOLVED";
    decision: ApprovalAction;
    decided_by: { id: string; display_name: string };
    decided_at: string;
  };
};

/** `details` của 409 ALREADY_RESOLVED. */
export type AlreadyResolvedDetails = {
  status?: "RESOLVED" | "WITHDRAWN";
  decided_by?: { id: string; display_name: string } | null;
  decided_at?: string | null;
};

/** Hành động hợp lệ theo loại (02 §6.2 API-21). */
export const ACTIONS_BY_TYPE: Record<ApprovalType, ApprovalAction[]> = {
  MISMATCH: ["CONTINUE", "CLOSE_WITH_NOTE", "CANCEL_SESSION"],
  ASSIST: ["CONTINUE", "CLOSE_WITH_NOTE", "CANCEL_SESSION"],
  REPACK: ["APPROVE_REPACK", "REJECT"],
};

/** Phiên RETURN đóng bằng quét + kết luận → không có CLOSE_WITH_NOTE (02 §6.2 API-21 mở rộng). */
export const actionsFor = (item: Pick<ApprovalItem, "type" | "session_type">): ApprovalAction[] =>
  item.session_type === "RETURN"
    ? ACTIONS_BY_TYPE[item.type].filter((a) => a !== "CLOSE_WITH_NOTE")
    : ACTIONS_BY_TYPE[item.type];

export const PENDING_APPROVALS_KEY = ["approvals", "PENDING"] as const;

export const approvalsApi = {
  pending: () =>
    api.get<Page<ApprovalItem>>("/approval-requests", { query: { status: "PENDING", page_size: 100 } }),
  decide: (id: string, action: ApprovalAction, note: string | null = null) =>
    api.post<ApprovalDecision>(`/approval-requests/${id}/decision`, { action, note }),
};
