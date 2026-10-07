import type { Health } from "@/lib/api/settings";
import { fmtHourMinute, fmtNumber, fmtShort, vnDay } from "@/shared/format";
import { BACKUP_STATE } from "@/shared/labels";
import type { ChipTone } from "@/shared/ui";

import { COPY } from "./copy";

const H = COPY.health;

export type BackupHealth = NonNullable<Health["backup"]>;

/**
 * Dòng "Sao lưu cloud" (01 §10.5 D8, API-81 `backup`): Chưa cấu hình (xám) / Lỗi (đỏ — lỗi xảy ra sau lần DB thành công
 * gần nhất) / Trễ (vàng — `late`) / trạng thái khác `ON` theo nhãn `backup.state` / OK "DB 13:00 · 3 tệp chờ" — DEC-636.
 */
export function backupHealth(b: BackupHealth): { tone: ChipTone; chip: string; text: string | null } {
  const last = b.last_db_success_at;
  const text = last
    ? H.backupLine(vnDay(last) === vnDay() ? fmtHourMinute(last) : fmtShort(last), fmtNumber(b.pending))
    : null;
  if (b.state === "NOT_CONFIGURED") return { tone: "neutral", chip: H.backupNotConfigured, text: null };
  if (b.last_error && (!last || Date.parse(b.last_error.at) > Date.parse(last)))
    return { tone: "error", chip: H.error, text: b.last_error.message };
  if (b.late) return { tone: "warning", chip: H.backupLate, text };
  if (b.state !== "ON") {
    const [label, tone] = BACKUP_STATE[b.state];
    return { tone, chip: label, text };
  }
  return { tone: "success", chip: H.ok, text };
}
