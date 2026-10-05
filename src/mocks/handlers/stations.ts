import { http, HttpResponse } from "msw";

import type { Camera, Roi, Station } from "@/lib/api/stations";

import { mockUsers, userFromAuth } from "../db";
import { API, apiError } from "../http";
import { requireRole } from "./session";

/** API-60..62, API-90 (role=STATION) theo 02 §6 — dữ liệu trong bộ nhớ. */
export const mockStations: Station[] = [];

export function resetMockStations() {
  mockStations.splice(0, mockStations.length, {
    id: "st-1",
    name: "TST Station 01",
    is_active: true,
    account: { id: "u-st1", username: "tst_station01" },
    cameras: [
      {
        id: "cam-1",
        role: "CAM1",
        rtsp_url_masked: "rtsp://192.168.20.11:554/stream1",
        status: "ONLINE",
        roi: null,
        clock_offset_ms: 120,
      },
      {
        id: "cam-2",
        role: "CAM2",
        rtsp_url_masked: "rtsp://192.168.20.12:554/stream1",
        status: "OFFLINE",
        roi: null,
        clock_offset_ms: null,
      },
    ],
  });
}
resetMockStations();

const SNAPSHOT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#5c544a"/><rect x="180" y="90" width="280" height="180" fill="#8c8276"/><rect x="240" y="150" width="160" height="60" fill="#fff"/></svg>';
const SNAPSHOT = "data:image/svg+xml;base64," + btoa(SNAPSHOT_SVG);

const findCamera = (id: string) => mockStations.flatMap((s) => s.cameras).find((c) => c.id === id);

function admin(request: Request) {
  const user = userFromAuth(request.headers.get("Authorization"));
  if (!user) return apiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn. Đăng nhập lại.");
  if (user.role !== "ADMIN")
    return apiError(403, "FORBIDDEN", "Tài khoản không có quyền thực hiện thao tác này.");
  return null;
}

const accountOf = (id: string | null | undefined) => {
  const u = mockUsers.find((x) => x.id === id);
  return u ? { id: u.id, username: u.username } : null;
};

function nameTaken(name: string, except?: string) {
  return mockStations.some((s) => s.id !== except && s.name.toLowerCase() === name.trim().toLowerCase());
}

function accountError(accountId: string | null | undefined, except?: string) {
  if (!accountId) return null;
  const user = mockUsers.find((u) => u.id === accountId);
  if (!user || user.role !== "STATION") {
    return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
      fields: { account_user_id: "Phải là tài khoản loại Station" },
    });
  }
  if (mockStations.some((s) => s.id !== except && s.account?.id === accountId)) {
    return apiError(409, "ACCOUNT_IN_USE", "Tài khoản station đã gắn với station khác.", {
      fields: { account_user_id: "Đã gắn station khác" },
    });
  }
  return null;
}

export const stationsHandlers = [
  http.get(`${API}/stations`, ({ request }) => admin(request) ?? HttpResponse.json({ items: mockStations })),

  http.get(`${API}/stations/:id`, ({ request, params }) => {
    const denied = admin(request);
    if (denied) return denied;
    const station = mockStations.find((s) => s.id === params.id);
    return station ? HttpResponse.json(station) : apiError(404, "NOT_FOUND", "Không tìm thấy station.");
  }),

  http.post(`${API}/stations`, async ({ request }) => {
    const denied = admin(request);
    if (denied) return denied;
    const body = (await request.json()) as { name: string; account_user_id?: string | null };
    if (nameTaken(body.name))
      return apiError(409, "NAME_TAKEN", "Tên station đã tồn tại.", { fields: { name: "Đã tồn tại" } });
    const err = accountError(body.account_user_id);
    if (err) return err;
    const station: Station = {
      id: `st-${Date.now()}`,
      name: body.name.trim(),
      is_active: true,
      account: accountOf(body.account_user_id),
      cameras: [],
    };
    mockStations.push(station);
    return HttpResponse.json(station, { status: 201 });
  }),

  http.patch(`${API}/stations/:id`, async ({ request, params }) => {
    const denied = admin(request);
    if (denied) return denied;
    const station = mockStations.find((s) => s.id === params.id);
    if (!station) return apiError(404, "NOT_FOUND", "Không tìm thấy station.");
    const body = (await request.json()) as Partial<{
      name: string;
      is_active: boolean;
      account_user_id: string | null;
    }>;
    if (body.name !== undefined && nameTaken(body.name, station.id))
      return apiError(409, "NAME_TAKEN", "Tên station đã tồn tại.", { fields: { name: "Đã tồn tại" } });
    if ("account_user_id" in body) {
      const err = accountError(body.account_user_id, station.id);
      if (err) return err;
      station.account = accountOf(body.account_user_id);
    }
    if (body.name !== undefined) station.name = body.name.trim();
    if (body.is_active !== undefined) station.is_active = body.is_active;
    return HttpResponse.json(station);
  }),

  http.put(`${API}/stations/:id/cameras/:role`, async ({ request, params }) => {
    const denied = admin(request);
    if (denied) return denied;
    const station = mockStations.find((s) => s.id === params.id);
    if (!station) return apiError(404, "NOT_FOUND", "Không tìm thấy station.");
    const body = (await request.json()) as { rtsp_url: string };
    if (!body.rtsp_url?.startsWith("rtsp://"))
      return apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", {
        fields: { rtsp_url: "Phải bắt đầu bằng rtsp://" },
      });
    const role = params.role as Camera["role"];
    const masked = body.rtsp_url.replace(/\/\/[^@/]+@/, "//");
    const existing = station.cameras.find((c) => c.role === role);
    const camera: Camera = existing ?? {
      id: `cam-${Date.now()}`,
      role,
      rtsp_url_masked: masked,
      status: "OFFLINE",
      roi: null,
      clock_offset_ms: null,
    };
    camera.rtsp_url_masked = masked;
    if (!existing) station.cameras.push(camera);
    return HttpResponse.json(camera);
  }),

  http.post(`${API}/cameras/test`, async ({ request }) => {
    const denied = admin(request);
    if (denied) return denied;
    const body = (await request.json()) as { rtsp_url: string; password?: string };
    if (body.rtsp_url.includes("10.0.0.")) {
      return apiError(422, "CAMERA_UNREACHABLE", "Không kết nối được camera.", { reason: "TIMEOUT" });
    }
    if (body.password === "sai")
      return apiError(422, "CAMERA_UNREACHABLE", "Không kết nối được camera.", { reason: "AUTH" });
    return HttpResponse.json({ ok: true, snapshot: SNAPSHOT, clock_offset_ms: 120 });
  }),

  // API-63: ảnh hiện tại. Mock trả SVG (FE không phụ thuộc định dạng); camera trỏ tới 10.0.0.x → CAMERA_UNREACHABLE.
  http.get(`${API}/cameras/:id/snapshot`, ({ request, params }) => {
    const [, denied] = requireRole(request, ["ADMIN", "SUPERVISOR"]);
    if (denied) return denied;
    const camera = findCamera(String(params.id));
    if (!camera) return apiError(404, "NOT_FOUND", "Không tìm thấy camera.");
    if (camera.rtsp_url_masked.includes("10.0.0."))
      return apiError(422, "CAMERA_UNREACHABLE", "Không kết nối được camera.", { reason: "TIMEOUT" });
    return new HttpResponse(SNAPSHOT_SVG, { headers: { "Content-Type": "image/svg+xml" } });
  }),

  // API-64: vùng đọc mã — chỉ Cam 2, trong [0,1], w,h ≥ 0.05 (02 §6.2).
  http.put(`${API}/cameras/:id/roi`, async ({ request, params }) => {
    const denied = admin(request);
    if (denied) return denied;
    const camera = findCamera(String(params.id));
    if (!camera) return apiError(404, "NOT_FOUND", "Không tìm thấy camera.");
    if (camera.role !== "CAM2") return apiError(409, "ROI_ONLY_CAM2", "Chỉ Cam 2 có vùng đọc mã.");
    const roi = (await request.json()) as Roi;
    const inRange = [roi.x, roi.y, roi.w, roi.h].every((v) => typeof v === "number" && v >= 0 && v <= 1);
    if (!inRange || roi.w < 0.05 || roi.h < 0.05 || roi.x + roi.w > 1.0001 || roi.y + roi.h > 1.0001)
      return apiError(422, "ROI_INVALID", "Vùng đọc mã không hợp lệ.");
    camera.roi = { x: roi.x, y: roi.y, w: roi.w, h: roi.h };
    return HttpResponse.json(camera);
  }),

  http.get(`${API}/users`, ({ request }) => {
    const denied = admin(request);
    if (denied) return denied;
    const role = new URL(request.url).searchParams.get("role");
    const items = mockUsers
      .filter((u) => !role || u.role === role)
      .map((u) => ({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        role: u.role,
        is_active: !u.disabled,
        // Như BE: station suy ra từ station đang gắn tài khoản.
        station: (() => {
          const st = mockStations.find((x) => x.account?.id === u.id);
          return st ? { id: st.id, name: st.name } : null;
        })(),
        created_at: "2026-10-01T00:00:00Z",
      }));
    return HttpResponse.json({ items, page: 1, page_size: 100, total: items.length });
  }),
];
