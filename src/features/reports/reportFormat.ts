import { fmtNumber } from "@/shared/format";
import { PLATFORM_SHORT, type Platform } from "@/shared/labels";

const PCT = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Tỷ lệ 0..1 → `4,0%` (02b-admin §9); `null` (mẫu số 0) → "—". */
export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${PCT.format(v * 100)}%`);

/** Giây → "1 phút 30 giây" / "45 giây" / "1 giờ 5 phút" (02b-admin §9); `null` → "—". */
export function fmtSeconds(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
  if (m > 0) return sec > 0 ? `${m} phút ${sec} giây` : `${m} phút`;
  return `${sec} giây`;
}

/** `YYYY-MM-DD` → `dd/mm/yyyy`. */
export const fmtDay = (day: string) => {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
};

/** Số nguyên định dạng `1.000`. */
export const num = (n: number) => fmtNumber(n);

/** "(Không ghi tên)" (`operator_name = null`) luôn cuối bảng (02 §6.2 API-152); thứ tự còn lại giữ như server. */
export function nullNameLast<T extends { operator_name: string | null }>(rows: T[]): T[] {
  return [...rows.filter((r) => r.operator_name !== null), ...rows.filter((r) => r.operator_name === null)];
}

/** Khớp BE `reports/csv_export.NO_SHOP` (BUG-G5-P3-1). */
export const NO_SHOP = "(Không có shop)";

/** Ô "Sàn · Shop" khối "Theo sàn / shop": dòng không gắn shop (đơn nhập CSV) → "(Không có shop)" như CSV. */
export function shopLabel(platform: Platform | null, shopName: string | null): string {
  const name = shopName ?? NO_SHOP;
  return platform ? `${PLATFORM_SHORT[platform]} · ${name}` : name;
}
