export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DUE_COPY = {
  overdue: "Quá hạn",
  lessThanMinute: "còn dưới 1 phút",
  defaultInfo: (hours: number) => `Sàn không trả hạn — dùng mặc định ${hours} giờ từ lúc sàn báo.`,
  defaultInfoButton: "Cách tính hạn",
};

/** "còn 1 ngày 4 giờ" / "còn 5 giờ 20 phút" / "còn 12 phút"; ≤ 0 → null (quá hạn). */
export function remainingText(dueAtMs: number, nowMs: number): string | null {
  const left = dueAtMs - nowMs;
  if (left <= 0) return null;
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  const minutes = Math.floor((left % HOUR) / MINUTE);
  if (days > 0) return `còn ${days} ngày${hours ? ` ${hours} giờ` : ""}`;
  if (hours > 0) return `còn ${hours} giờ${minutes ? ` ${minutes} phút` : ""}`;
  return minutes > 0 ? `còn ${minutes} phút` : DUE_COPY.lessThanMinute;
}
