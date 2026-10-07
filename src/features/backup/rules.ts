import { BACKUP_LIMITS, type BackupStatus } from "@/lib/api/backup";

import { COPY } from "./copy";

/** Kiểm "Giới hạn tốc độ tải lên" 1–1000 số nguyên (02 §6.2 API-181); server kiểm lại (422 `fields.upload_mbps`). */
export function parseUploadMbps(v: string): number | null {
  const t = v.trim();
  if (!/^\d+$/.test(t)) return null;
  const num = Number(t);
  return num >= BACKUP_LIMITS.uploadMbpsMin && num <= BACKUP_LIMITS.uploadMbpsMax ? num : null;
}

/** Lý do nút ghi (Sao lưu ngay / Tải lại) bị khóa theo `state` (v0.3 G2R2-9: `DISABLED` có chữ riêng). */
export function writeLockTip(s: BackupStatus): string | null {
  if (s.state === "ON") return null;
  return s.state === "DISABLED" ? COPY.disabledTip : COPY.pausedTip;
}
