import { api } from "./client";

/** API-80 (GET: ADMIN, SUPERVISOR · PUT: ADMIN — gửi đủ 4 trường), API-81 (02 §6.2, v0.3 DEC-57). */
export type SystemSettings = {
  retention_raw_days: number;
  retention_clip_days: number;
  session_warn_minutes: number;
  session_abandon_minutes: number;
  updated_at?: string;
};
export type SettingsInput = Omit<SystemSettings, "updated_at">;

export type ComponentStatus = "OK" | "ERROR";
export type Health = {
  db: ComponentStatus;
  redis: ComponentStatus;
  mediamtx: ComponentStatus;
  disk: { total_bytes: number; used_bytes: number; percent: number } | null;
  cameras: {
    id: string;
    station_name: string;
    role: "CAM1" | "CAM2";
    status: "ONLINE" | "OFFLINE";
    clock_offset_ms: number | null;
    last_seen_at: string | null;
  }[];
  sync: { shop_id: string; last_success_at: string | null; last_error: Record<string, unknown> | null }[];
};

export const settingsApi = {
  get: () => api.get<SystemSettings>("/settings"),
  put: (body: SettingsInput) => api.put<SystemSettings>("/settings", body),
  health: () => api.get<Health>("/system/health"),
};
