import { api } from "./client";

/** API-60..65, API-90 (02 §6). */
export type CameraRole = "CAM1" | "CAM2";
export type Roi = { x: number; y: number; w: number; h: number };
export type Camera = {
  id: string;
  role: CameraRole;
  rtsp_url_masked: string;
  status: "ONLINE" | "OFFLINE";
  roi: Roi | null;
  clock_offset_ms: number | null;
};
/** item 02 (API-60 `kind`). */
export type StationKind = "PACK" | "RETURN" | "BOTH";
export type Station = {
  id: string;
  name: string;
  is_active: boolean;
  /** item 02 (API-60 — BE T-106): loại station, chế độ hiện tại, người kiểm (chế độ nhận hoàn). */
  kind: StationKind;
  work_mode: "PACK" | "RETURN";
  operator_name: string | null;
  account: { id: string; username: string } | null;
  cameras: Camera[];
};
export type CameraInput = { rtsp_url: string; username?: string; password?: string };
export type UserItem = {
  id: string;
  username: string;
  display_name: string;
  role: "ADMIN" | "SUPERVISOR" | "CSKH" | "STATION";
  is_active: boolean;
  station: { id: string; name: string } | null;
};
export type Page<T> = { items: T[]; page: number; page_size: number; total: number };

export const stationsApi = {
  list: () => api.get<{ items: Station[] }>("/stations"),
  get: (id: string) => api.get<Station>(`/stations/${id}`),
  create: (body: { name: string; account_user_id?: string | null; kind?: StationKind }) =>
    api.post<Station>("/stations", body),
  /** item 02: đổi `kind` khi station có phiên / yêu cầu chờ → 409 STATION_BUSY. */
  patch: (
    id: string,
    body: Partial<{ name: string; is_active: boolean; account_user_id: string | null; kind: StationKind }>,
  ) => api.patch<Station>(`/stations/${id}`, body),
  setCamera: (stationId: string, role: CameraRole, body: CameraInput) =>
    api.put<Camera>(`/stations/${stationId}/cameras/${role}`, body),
  testCamera: (body: CameraInput) =>
    api.post<{ ok: boolean; snapshot: string; clock_offset_ms: number | null }>("/cameras/test", body),
  /** API-63: ảnh hiện tại (JPEG). 422 CAMERA_UNREACHABLE. */
  snapshot: (cameraId: string) => api.blob(`/cameras/${cameraId}/snapshot`),
  /** API-64: vùng đọc mã Cam 2 (tỉ lệ 0–1). 422 ROI_INVALID, 409 ROI_ONLY_CAM2. */
  setRoi: (cameraId: string, roi: Roi) => api.put<Camera>(`/cameras/${cameraId}/roi`, roi),
  stationAccounts: () => api.get<Page<UserItem>>("/users", { query: { role: "STATION", page_size: 100 } }),
};
