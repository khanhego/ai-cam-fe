import type { AttentionItem } from "@/lib/api/reports";
import { fmtNumber, fmtShort } from "@/shared/format";

/** Chữ D2 — nguyên văn 01 §10.5 (DEC-17). */
export const COPY = {
  title: "Tổng quan",
  today: (d: string) => `Hôm nay ${d}`,
  day: (d: string) => `Ngày ${d}`,
  dateLabel: "Đổi ngày",
  empty: "Chưa có phiên đóng gói nào trong ngày.",
  error: "Không tải được số liệu ngày.",
  retry: "Thử lại",
  kpi: {
    packed: "Đã đóng gói",
    had_mismatch: "Từng lệch mã",
    abandoned: "Bỏ dở",
    cancelled: "Hủy phiên",
    packed_not_handed_over: "Chưa bàn giao",
    cancelled_after_pack: "Hủy sau khi đóng",
  },
  stations: "Station",
  noStations: "Chưa có station nào.",
  lastScan: "Quét gần nhất",
  noCamera: "Chưa gắn camera",
  attention: "Cần xử lý",
  noAttention: "Không có việc cần xử lý.",
  view: "Xem",
  approve: "Duyệt",
};

const seconds = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const ROLE = { CAM1: "Cam 1", CAM2: "Cam 2" } as const;

/** Một dòng "Cần xử lý" (01 §10.5 D2). */
export function attentionText(item: AttentionItem): string {
  switch (item.kind) {
    case "CANCELLED_AFTER_PACK":
      return `${fmtNumber(item.count)} đơn bị hủy sau khi đóng`;
    case "CAMERA_OFFLINE":
      return `${ROLE[item.role]} ${item.station_name} mất tín hiệu`;
    case "CLOCK_DRIFT": {
      const who = item.role && item.station_name ? `${ROLE[item.role]} ${item.station_name}` : "Camera";
      return `${who} lệch giờ ${seconds.format(Math.abs(item.offset_ms) / 1000)} giây`;
    }
    case "APPROVAL_PENDING":
      return `${fmtNumber(item.count)} yêu cầu duyệt đang chờ`;
    case "CLIP_FAILED":
      return `${fmtNumber(item.count)} clip cắt lỗi — cần cắt lại`;
    case "SYNC_ERROR":
      return `Đồng bộ Shopee lỗi lúc ${fmtShort(item.at)}`;
    case "DISK_USAGE":
      return `Ổ lưu video đã dùng ${item.percent}%`;
  }
}
