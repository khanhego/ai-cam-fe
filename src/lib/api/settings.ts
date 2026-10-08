import type { BackupState, Platform } from "@/shared/labels";

import { api } from "./client";

/**
 * API-80 (GET: ADMIN, SUPERVISOR · PUT: ADMIN — 4 trường Phase 1 bắt buộc, 6 ngưỡng tùy chọn), API-81 (02 §6.2, v0.3
 * DEC-57); khớp BE M9 `SettingsOut`.
 */
export type SystemSettings = {
  retention_raw_days: number;
  retention_clip_days: number;
  session_warn_minutes: number;
  session_abandon_minutes: number;
  updated_at: string;
} & ThresholdSettings & {
    /** Sàn retention clip (chỉ đọc, `RETENTION_CLIP_MIN_DAYS` của máy chủ — item 02). */
    retention_clip_min_days: number;
  } & Phase3Settings;

/** item 03 (02 §6.2 API-80): GET luôn có; PUT tùy chọn (thiếu = giữ). */
export type Phase3Settings = {
  packer_name_required: boolean;
  /** 1–168 (422 `fields.refund_only_default_hours`). */
  refund_only_default_hours: number;
};
export type SettingsInput = Omit<
  SystemSettings,
  "updated_at" | keyof ThresholdSettings | "retention_clip_min_days" | keyof Phase3Settings
>;

/** item 02 (02 §6.2 API-80): 6 ngưỡng mới (tùy chọn khi PUT — thiếu giữ giá trị cũ). */
export type ThresholdSettings = {
  return_warn_minutes: number;
  return_abandon_minutes: number;
  return_missing_days: number;
  handover_warn_hours: number;
  claim_deadline_days: number;
  claim_due_soon_hours: number;
};
export const THRESHOLD_KEYS = [
  "return_missing_days",
  "handover_warn_hours",
  "claim_deadline_days",
  "claim_due_soon_hours",
  "return_warn_minutes",
  "return_abandon_minutes",
] as const satisfies readonly (keyof ThresholdSettings)[];

/** Body PUT: 4 trường Phase 1 bắt buộc + ngưỡng tùy chọn + `confirm_reduction` (409 RETENTION_REDUCTION_UNCONFIRMED). */
export type SettingsPutBody = SettingsInput &
  Partial<ThresholdSettings> &
  Partial<Phase3Settings> & { confirm_reduction?: boolean };

/** API-82 (cũng là `details.impact` của 409). */
export type RetentionImpact = {
  clips: number;
  clip_bytes: number;
  raw_hours: number;
  raw_bytes: number;
  protected_clips: number;
  next_run_at: string;
};

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
  sync: {
    shop_id: string;
    last_success_at: string | null;
    last_error: Record<string, unknown> | null;
    /** item 03. */
    platform?: Platform;
    shop_name?: string | null;
  }[];
  /** item 03 (API-81): `late` = DB > 26 giờ không thành công / tệp chờ > 24 giờ / lệch mã băm chưa xử lý. */
  backup?: {
    state: BackupState;
    last_db_success_at: string | null;
    pending: number;
    late: boolean;
    last_error: { code: string; message: string; at: string } | null;
  };
};

export const settingsApi = {
  get: () => api.get<SystemSettings>("/settings"),
  /** 422 RETENTION_BELOW_MINIMUM (`details.min`); 409 RETENTION_REDUCTION_UNCONFIRMED (`details.impact`). */
  put: (body: SettingsPutBody) => api.put<SystemSettings>("/settings", body),
  /** API-82 (ADMIN). */
  retentionImpact: (q: { retention_raw_days: number; retention_clip_days: number }) =>
    api.get<RetentionImpact>("/settings/retention-impact", { query: q }),
  health: () => api.get<Health>("/system/health"),
};
