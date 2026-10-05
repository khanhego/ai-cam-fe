import { http, HttpResponse } from "msw";

import {
  ACTIONS_BY_TYPE,
  type AlreadyResolvedDetails,
  type ApprovalAction,
  type ApprovalItem,
} from "@/lib/api/approvals";

import { API, apiError } from "../http";
import { stationSim } from "../stationSim";
import { dashboardWs, stationWs } from "../ws";
import { requireRole } from "./session";

/**
 * API-20 / API-21 theo 02 §6.2 (BE T-13 chưa xong — DEC-81). Yêu cầu đang chờ = yêu cầu của station giả
 * (`stationSim`, TST Station 01 — đồng bộ station ↔ dashboard trong cùng trang) + yêu cầu seed của TST Station 02.
 */
export const mockApprovals: ApprovalItem[] = [];
/** Yêu cầu đã đóng → `details` của 409 ALREADY_RESOLVED. */
export const closedApprovals = new Map<string, AlreadyResolvedDetails>();

export function resetMockApprovals() {
  closedApprovals.clear();
  mockApprovals.splice(0, mockApprovals.length, {
    id: "apr-seed-1",
    type: "MISMATCH",
    status: "PENDING",
    station: { id: "st-2", name: "TST Station 02" },
    session_id: "ses-st2-seed",
    tracking_number: "SPXTST0000020",
    context: { expected: "SPXTST0000020", actual: "SPXTST0000021", source: "CAM2", tray_match: "DIFFERENT" },
    created_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  });
}
resetMockApprovals();

const APPROVER_ROLES = ["ADMIN", "SUPERVISOR"] as const;
const event = (type: string, data: unknown) => JSON.stringify({ type, data, at: new Date().toISOString() });

/** Item API-20 cho yêu cầu đang chờ của station giả. */
function simApproval(): ApprovalItem | null {
  const a = stationSim.approval;
  if (!a) return null;
  const st = stationSim.state();
  return {
    id: a.id,
    type: a.type,
    status: "PENDING",
    station: st.station,
    session_id: st.session?.id ?? null,
    tracking_number: a.tracking_number,
    context: stationSim.approvalContext,
    created_at: a.created_at,
  };
}

export function pendingApprovals(): ApprovalItem[] {
  const sim = simApproval();
  return [...(sim ? [sim] : []), ...mockApprovals];
}

/** Station giả vừa gửi yêu cầu (API-13) → WS-02 `approval.created`. */
export function announceApprovalCreated() {
  const item = simApproval();
  if (item) dashboardWs.broadcast(event("approval.created", item));
}

/** Station rút yêu cầu (API-14) → lần duyệt sau nhận ALREADY_RESOLVED `WITHDRAWN`. */
export function recordWithdrawn(item: ApprovalItem) {
  closedApprovals.set(item.id, { status: "WITHDRAWN", decided_by: null, decided_at: null });
  dashboardWs.broadcast(event("approval.resolved", { ...item, status: "WITHDRAWN" }));
}

/** Test: giả lập người khác vừa xử lý yêu cầu (TC-03.47). */
export function resolveMockApproval(id: string, displayName: string, at = new Date().toISOString()) {
  const i = mockApprovals.findIndex((a) => a.id === id);
  if (i >= 0) mockApprovals.splice(i, 1);
  closedApprovals.set(id, {
    status: "RESOLVED",
    decided_by: { id: "u-other", display_name: displayName },
    decided_at: at,
  });
}

export const approvalsHandlers = [
  http.get(`${API}/approval-requests`, ({ request }) => {
    const [, denied] = requireRole(request, [...APPROVER_ROLES]);
    if (denied) return denied;
    const status = new URL(request.url).searchParams.get("status") ?? "PENDING";
    const items = status === "PENDING" ? pendingApprovals() : [];
    return HttpResponse.json({ items, page: 1, page_size: 100, total: items.length });
  }),

  http.post(`${API}/approval-requests/:id/decision`, async ({ request, params }) => {
    const [user, denied] = requireRole(request, [...APPROVER_ROLES]);
    if (denied) return denied;
    const id = String(params.id);
    const body = (await request.json()) as { action: ApprovalAction; note?: string | null };
    const closed = closedApprovals.get(id);
    if (closed) return apiError(409, "ALREADY_RESOLVED", "Yêu cầu đã được xử lý.", closed);
    const item = pendingApprovals().find((a) => a.id === id);
    if (!item) return apiError(404, "NOT_FOUND", "Không tìm thấy yêu cầu.");
    if (!ACTIONS_BY_TYPE[item.type].includes(body.action))
      return apiError(422, "INVALID_ACTION", "Thao tác không hợp với loại yêu cầu.");
    const note = body.note?.trim() ?? "";
    if (body.action === "CLOSE_WITH_NOTE" && (note.length < 1 || note.length > 500))
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { note: "Nhập ghi chú (1–500 ký tự)" },
      });

    if (item.id === stationSim.approval?.id) {
      const err = stationSim.decide(id, body.action);
      if (err === "TRAY_STILL_DIFFERENT")
        return apiError(409, err, "Cam 2 vẫn thấy phiếu sai trên khay. Yêu cầu bỏ phiếu sai trước.");
      if (err) return apiError(422, err, "Không xử lý được yêu cầu.");
      stationWs.broadcast(event("station.state", stationSim.state()));
      if (body.action === "CANCEL_SESSION")
        stationWs.broadcast(event("alert", { code: "SESSION_CANCELLED_BY_SUPERVISOR" }));
    } else {
      const tray = item.context?.tray_match;
      if (body.action === "CLOSE_WITH_NOTE" && (tray === "DIFFERENT" || tray === "MULTIPLE"))
        return apiError(
          409,
          "TRAY_STILL_DIFFERENT",
          "Cam 2 vẫn thấy phiếu sai trên khay. Yêu cầu bỏ phiếu sai trước.",
        );
      mockApprovals.splice(mockApprovals.indexOf(item), 1);
    }

    const decided = {
      id,
      status: "RESOLVED" as const,
      decision: body.action,
      decided_by: { id: user.id, display_name: user.display_name },
      decided_at: new Date().toISOString(),
    };
    closedApprovals.set(id, {
      status: "RESOLVED",
      decided_by: decided.decided_by,
      decided_at: decided.decided_at,
    });
    dashboardWs.broadcast(event("approval.resolved", { ...item, ...decided }));
    return HttpResponse.json({ approval_request: decided });
  }),
];
