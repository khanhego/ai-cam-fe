import { http, HttpResponse } from "msw";

import type { CancelReason } from "@/lib/api/station";
import type { InspectionInput } from "@/shared/returns/types";

import { userFromAuth } from "../db";
import { API, apiError } from "../http";
import { stationSim, type SimError } from "../stationSim";
import { stationWs } from "../ws";
import { announceApprovalCreated, pendingApprovals, recordWithdrawn } from "./approvals";

const simError = (e: SimError) => apiError(e.status, e.code, e.message, e.details ?? {});
const isSimError = (x: unknown): x is SimError =>
  typeof x === "object" && x !== null && "status" in x && "code" in x && "message" in x;
const event = (type: string, data: unknown) => JSON.stringify({ type, data, at: new Date().toISOString() });

/** item 03: kiện có yêu cầu hủy đến khi đang đóng gói (04 §1 `TTTST0000000051`). */
export const CANCEL_LATER_CODE = "TTTST0000000051";
const CANCEL_LATER_MS = 5_000;

/** Ảnh mẫu cho API-106 (02b-station §12). */
const SNAPSHOT_FILE = "/mock/snapshot.jpg";

/**
 * Hook dev / test giả lập job server cho station (J-07 quá giờ phiên hoàn, J-04/J-06 đơn hủy khi đang đóng) và phát
 * WS-01 như BE (02 §6.2 WS-01 mở rộng).
 */
export const stationJobs = {
  expireReturnSession() {
    const alert = stationSim.expireReturnSession();
    if (!alert) return null;
    stationWs.broadcast(event("station.state", stationSim.state()));
    stationWs.broadcast(event("alert", alert));
    return alert;
  },
  /** item 03 (DEC-494): đơn vào nhóm `CANCEL_REQUESTED` khi đang đóng → cờ phiên, chỉ WS `station.state` (không alert). */
  orderCancelRequested(trackingNumber?: string) {
    if (!stationSim.flagOrderCancelRequested(trackingNumber)) return false;
    stationWs.broadcast(event("station.state", stationSim.state()));
    return true;
  },
  orderCancelled() {
    const alert = stationSim.flagOrderCancelled();
    if (!alert) return null;
    stationWs.broadcast(event("station.state", stationSim.state()));
    stationWs.broadcast(event("alert", alert));
    return alert;
  },
};

/** API-10, 11, 12, 15 theo 02 §6.2, chạy trên StationSim; item 02: API-100..106 (T-131). */
function requireStation(request: Request) {
  const user = userFromAuth(request.headers.get("Authorization"));
  if (!user) return apiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Đăng nhập lại.");
  if (user.role !== "STATION")
    return apiError(403, "FORBIDDEN", "Tài khoản không có quyền thực hiện thao tác này.");
  return null;
}

export const stationHandlers = [
  http.get(
    `${API}/station/state`,
    ({ request }) => requireStation(request) ?? HttpResponse.json(stationSim.state()),
  ),

  http.post(`${API}/station/scan`, async ({ request }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const body = (await request.json()) as { code?: string; client_scan_id?: string };
    if (!body.code || !body.client_scan_id) {
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", { fields: { code: "Bắt buộc" } });
    }
    const result = stationSim.scan(body.code, body.client_scan_id);
    // 02b-station §12 v0.2: `TTTST0000000051` — yêu cầu hủy tới 5 giây sau khi mở phiên (J-04 lượt 2).
    const code = body.code.trim().toUpperCase();
    if (result.outcome === "SESSION_OPENED" && code === CANCEL_LATER_CODE)
      setTimeout(() => stationJobs.orderCancelRequested(code), CANCEL_LATER_MS);
    return HttpResponse.json(result);
  }),

  http.post(`${API}/station/sessions/:id/cancel`, async ({ request, params }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const body = (await request.json()) as { reason: CancelReason; note: string | null };
    if (body.reason === "OTHER" && !body.note?.trim()) {
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { note: "Nhập lý do khi chọn Khác" },
      });
    }
    const error = stationSim.cancel(String(params.id), body.reason);
    // item 03 (02 §6.2 API-12, BR-37).
    if (error === "CANCEL_REQUIRES_SUPERVISOR")
      return apiError(409, error, "Phiên đã quá 60 giây. Bấm Gọi quản lý để hủy.");
    if (error === "VALIDATION_ERROR")
      return apiError(422, error, "Dữ liệu không hợp lệ.", {
        fields: { reason: "Lý do không hợp với loại phiên" },
      });
    if (error) return apiError(409, error, "Phiên không còn mở.");
    return HttpResponse.json({ state: stationSim.state() });
  }),

  http.get(
    `${API}/station/sessions/recent`,
    ({ request }) => requireStation(request) ?? HttpResponse.json({ items: stationSim.recent }),
  ),

  http.post(`${API}/station/approval-requests`, async ({ request }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const body = (await request.json()) as {
      type: "MISMATCH" | "ASSIST" | "REPACK";
      session_id?: string;
      tracking_number?: string;
    };
    const error = stationSim.requestApproval(body);
    if (error === "APPROVAL_ALREADY_PENDING") return apiError(409, error, "Station đã có yêu cầu đang chờ.");
    if (error) return apiError(409, error, "Không gửi được yêu cầu duyệt lúc này.");
    announceApprovalCreated();
    return HttpResponse.json(
      { approval_request: { ...stationSim.approval, status: "PENDING" }, state: stationSim.state() },
      { status: 201 },
    );
  }),

  http.post(`${API}/station/approval-requests/:id/withdraw`, ({ request, params }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const pending = pendingApprovals().find((a) => a.id === params.id);
    if (!pending || !stationSim.withdraw(String(params.id)))
      return apiError(409, "ALREADY_RESOLVED", "Yêu cầu đã được xử lý.");
    recordWithdrawn(pending);
    return HttpResponse.json({ state: stationSim.state() });
  }),

  // ---- item 02 (02 §6.2 API-100..106) ----
  http.put(`${API}/station/work-mode`, async ({ request }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const body = (await request.json()) as { work_mode?: "PACK" | "RETURN" };
    const error = stationSim.setWorkMode(body.work_mode as "PACK" | "RETURN");
    return error ? simError(error) : HttpResponse.json({ state: stationSim.state() });
  }),

  http.put(`${API}/station/operator`, async ({ request }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const body = (await request.json()) as { name?: unknown };
    const error = stationSim.setOperator(body.name);
    return error ? simError(error) : HttpResponse.json({ state: stationSim.state() });
  }),

  http.put(`${API}/station/sessions/:id/inspection`, async ({ request, params }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const body = (await request.json()) as Partial<InspectionInput>;
    const result = stationSim.saveInspection(String(params.id), body);
    return isSimError(result) ? simError(result) : HttpResponse.json(result);
  }),

  http.post(`${API}/station/sessions/:id/snapshots`, ({ request, params }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const result = stationSim.takeSnapshot(String(params.id));
    return isSimError(result) ? simError(result) : HttpResponse.json(result, { status: 201 });
  }),

  http.get(`${API}/station/return-lookup`, ({ request }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const result = stationSim.returnLookup(q);
    return isSimError(result) ? simError(result) : HttpResponse.json(result);
  }),

  http.post(`${API}/station/return-sessions`, async ({ request }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const body = (await request.json()) as Record<string, unknown>;
    const result = stationSim.openFromLookup(body);
    return isSimError(result) ? simError(result) : HttpResponse.json(result);
  }),

  // API-106: ảnh ký — mock không kiểm chữ ký, chuyển tới ảnh mẫu tĩnh (`sig=expired` → 403, `sig=deleted` → 410).
  http.get(`${API}/media/snapshots/:id`, ({ request }) => {
    const sig = new URL(request.url).searchParams.get("sig");
    if (sig === "expired") return apiError(403, "SIGNATURE_INVALID", "Liên kết đã hết hạn.");
    if (sig === "deleted") return apiError(410, "SNAPSHOT_DELETED", "Ảnh đã bị xóa theo chính sách lưu trữ.");
    return new HttpResponse(null, { status: 302, headers: { Location: SNAPSHOT_FILE } });
  }),
];
