import { vnDay } from "@/shared/format";

/** D2 → D3 phiên hoàn hủy / bỏ dở 7 ngày (02 §6.2 API-32: `date_from` = 7 ngày trước theo giờ VN — DEC-602). */
export function droppedPath(today: string): string {
  const from = new Date(`${today}T00:00:00+07:00`);
  from.setUTCDate(from.getUTCDate() - 7);
  return `/admin/packages?session_type=RETURN&return_dropped=true&date_from=${vnDay(from)}`;
}
