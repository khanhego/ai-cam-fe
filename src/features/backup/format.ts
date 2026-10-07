import { fmtHourMinute, fmtNumber, fmtShort, vnDay } from "@/shared/format";

const SIZE = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/**
 * Dung lượng sao lưu theo bội 1024 với nhãn MB / GB như phác thảo 01 §10.5 D23 ("182 MB" = 190 840 832 byte, "151 GB"
 * trên cloud) — DEC-633. D8 (ổ đĩa) vẫn dùng bội 1000 (`settings/rules.ts`).
 */
export function fmtSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${SIZE.format(i >= 2 && v >= 100 ? Math.round(v) : v)} ${units[i]}`;
}

/** GB (bội 1024) cho Dialog tải lại: "136" / "1,5". */
export const fmtGb = (bytes: number) =>
  SIZE.format(bytes / 1024 ** 3 >= 100 ? Math.round(bytes / 1024 ** 3) : bytes / 1024 ** 3);

/** "13:00 hôm nay" (01 §10.5 D23) / "06/10 13:00" ngày khác (giờ VN). */
export function fmtWhen(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  return vnDay(iso) === vnDay(now) ? `${fmtHourMinute(iso)} hôm nay` : fmtShort(iso);
}

/** "1.204". */
export const n = (v: number) => fmtNumber(v);

/** Dấu vân tay rút gọn cho cột lịch sử: "7F3A…44D1". */
export const shortFp = (fp: string) => (fp.length > 9 ? `${fp.slice(0, 4)}…${fp.slice(-4)}` : fp);
