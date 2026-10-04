import { fmtDate } from "@/shared/format";

/** Chữ trạng thái clip (01 §10.5 D4), dùng chung station và dashboard. */
export const CLIP_COPY = {
  pending: "Clip đang được cắt, sẵn sàng trong khoảng 1 phút.",
  deleted: (date?: string | null, days?: number | null) =>
    date
      ? `Clip đã bị xóa ngày ${fmtDate(date)} theo chính sách lưu trữ${days ? ` ${days} ngày` : ""}.`
      : "Clip đã bị xóa theo chính sách lưu trữ.",
  failed: "Không tạo được clip cho phiên này.",
  playError: "Không phát được clip. Bấm Thử lại; nếu vẫn lỗi, tải lại trang.",
  retry: "Thử lại",
};
