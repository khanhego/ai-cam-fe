import type { SettingsInput } from "@/lib/api/settings";

import { COPY } from "./copy";

export type SettingsForm = Record<keyof SettingsInput, string>;
export const SETTINGS_KEYS = [
  "retention_raw_days",
  "retention_clip_days",
  "session_warn_minutes",
  "session_abandon_minutes",
] as const satisfies readonly (keyof SettingsInput)[];

const toInt = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
const inRange = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;

/** Kiểm D8 (02b-admin §5, 02 API-80): ngày 1–365, phút 1–1440, clip ≥ thô, bỏ dở > cảnh báo. Server kiểm lại. */
export function validateSettings(form: SettingsForm): {
  errors: Partial<Record<keyof SettingsInput, string>>;
  value: SettingsInput | null;
} {
  const n = Object.fromEntries(SETTINGS_KEYS.map((k) => [k, toInt(form[k])])) as SettingsInput;
  const errors: Partial<Record<keyof SettingsInput, string>> = {};
  if (!inRange(n.retention_raw_days, 365)) errors.retention_raw_days = COPY.days;
  if (!inRange(n.retention_clip_days, 365)) errors.retention_clip_days = COPY.days;
  if (!inRange(n.session_warn_minutes, 1440)) errors.session_warn_minutes = COPY.minutes;
  if (!inRange(n.session_abandon_minutes, 1440)) errors.session_abandon_minutes = COPY.minutes;
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
  return { errors, value: Object.keys(errors).length === 0 ? n : null };
}

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
