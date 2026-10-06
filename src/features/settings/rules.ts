import {
  THRESHOLD_KEYS,
  type SettingsInput,
  type SettingsPutBody,
  type ThresholdSettings,
} from "@/lib/api/settings";

import { COPY } from "./copy";

/** Ô của form D8: 4 trường Phase 1 + 6 ngưỡng item 02 (02 §6.2 API-80). */
export type SettingsKey = keyof SettingsInput | keyof ThresholdSettings;
export type SettingsForm = Record<SettingsKey, string>;
export const PHASE1_KEYS = [
  "retention_raw_days",
  "retention_clip_days",
  "session_warn_minutes",
  "session_abandon_minutes",
] as const satisfies readonly (keyof SettingsInput)[];
export const SETTINGS_KEYS = [...PHASE1_KEYS, ...THRESHOLD_KEYS] as const satisfies readonly SettingsKey[];

/** Giới hạn trên mỗi ô (02 §6.2 API-80; BE `SettingsIn`). */
export const MAX: Record<SettingsKey, number> = {
  retention_raw_days: 365,
  retention_clip_days: 365,
  session_warn_minutes: 1440,
  session_abandon_minutes: 1440,
  return_missing_days: 60,
  handover_warn_hours: 168,
  claim_deadline_days: 90,
  claim_due_soon_hours: 168,
  return_warn_minutes: 1440,
  return_abandon_minutes: 1440,
};

const toInt = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
const inRange = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;

/**
 * Kiểm D8 (02b-admin §5, 02 API-80): khoảng từng ô; clip ≥ thô; bỏ dở > cảnh báo (phiên đóng gói + phiên hoàn); clip ≥
 * sàn `minClipDays` (`retention_clip_min_days`) — thứ tự lỗi như BE (ràng buộc chéo trước, sàn sau). Server kiểm lại.
 */
export function validateSettings(
  form: SettingsForm,
  minClipDays?: number,
): {
  errors: Partial<Record<SettingsKey, string>>;
  value: Required<Omit<SettingsPutBody, "confirm_reduction">> | null;
} {
  const n = Object.fromEntries(SETTINGS_KEYS.map((k) => [k, toInt(form[k])])) as Record<SettingsKey, number>;
  const errors: Partial<Record<SettingsKey, string>> = {};
  for (const k of SETTINGS_KEYS) {
    if (inRange(n[k], MAX[k])) continue;
    errors[k] =
      k === "retention_raw_days" || k === "retention_clip_days"
        ? COPY.days
        : k === "session_warn_minutes" || k === "session_abandon_minutes"
          ? COPY.minutes
          : COPY.range(MAX[k]);
  }
  if (
    !errors.retention_raw_days &&
    !errors.retention_clip_days &&
    n.retention_clip_days < n.retention_raw_days
  )
    errors.retention_clip_days = COPY.clipLtRaw;
  if (
    !errors.session_warn_minutes &&
    !errors.session_abandon_minutes &&
    n.session_abandon_minutes <= n.session_warn_minutes
  )
    errors.session_abandon_minutes = COPY.abandonLteWarn;
  if (
    !errors.return_warn_minutes &&
    !errors.return_abandon_minutes &&
    n.return_abandon_minutes <= n.return_warn_minutes
  )
    errors.return_abandon_minutes = COPY.returnAbandonLteWarn;
  if (!errors.retention_clip_days && minClipDays !== undefined && n.retention_clip_days < minClipDays)
    errors.retention_clip_days = COPY.belowMin(minClipDays);
  return { errors, value: Object.keys(errors).length === 0 ? n : null };
}

/** Giảm số ngày giữ clip / video thô so với đang lưu → cần xác nhận (BR-25, 01 §10.5 D8). */
export const isReduction = (
  next: Pick<SettingsInput, "retention_raw_days" | "retention_clip_days">,
  current: Pick<SettingsInput, "retention_raw_days" | "retention_clip_days">,
) =>
  next.retention_clip_days < current.retention_clip_days ||
  next.retention_raw_days < current.retention_raw_days;

const BYTES = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
/** Dung lượng theo đơn vị thập phân (TB/GB) như nhãn ổ đĩa. */
export function fmtBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${BYTES.format(v)} ${units[i]}`;
}
