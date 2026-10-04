import { http, HttpResponse } from "msw";

import { userFromAuth } from "../db";
import { API, apiError } from "../http";
import { stationSim } from "../stationSim";

/** API-10, 11, 12, 15 theo 02 §6.2, chạy trên StationSim. */
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
    return HttpResponse.json(stationSim.scan(body.code, body.client_scan_id));
  }),

  http.post(`${API}/station/sessions/:id/cancel`, async ({ request, params }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    const body = (await request.json()) as { reason: string; note: string | null };
    if (body.reason === "OTHER" && !body.note?.trim()) {
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { note: "Nhập lý do khi chọn Khác" },
      });
    }
    if (!stationSim.cancel(String(params.id)))
      return apiError(409, "SESSION_NOT_OPEN", "Phiên không còn mở.");
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
    return HttpResponse.json(
      { approval_request: { ...stationSim.approval, status: "PENDING" }, state: stationSim.state() },
      { status: 201 },
    );
  }),

  http.post(`${API}/station/approval-requests/:id/withdraw`, ({ request, params }) => {
    const denied = requireStation(request);
    if (denied) return denied;
    if (!stationSim.withdraw(String(params.id)))
      return apiError(409, "ALREADY_RESOLVED", "Yêu cầu đã được xử lý.");
    return HttpResponse.json({ state: stationSim.state() });
  }),

  // API-40 (mock): URL phát trỏ tới video mẫu trong public/mock (chỉ dev).
  http.get(`${API}/clips/:id/play-url`, ({ params }) =>
    HttpResponse.json({
      url: String(params.id).endsWith("-2") ? "/mock/clip-cam2.mp4" : "/mock/clip-cam1.mp4",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    }),
  ),
];
