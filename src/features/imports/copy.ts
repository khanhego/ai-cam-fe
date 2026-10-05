import { fmtNumber } from "@/shared/format";

/** Chữ D5 — nguyên văn 01 §10.5 khi có (DEC-17). */
export const COLUMN_LABEL: Record<string, string> = {
  platform_order_sn: "Mã đơn",
  tracking_number: "Mã vận đơn",
  sku: "SKU",
  product_name: "Tên sản phẩm",
  variation: "Phân loại",
  quantity: "Số lượng",
  buyer_note: "Ghi chú",
};

export const columnLabel = (c: string | null | undefined) => (c ? (COLUMN_LABEL[c] ?? c) : "—");

export const COPY = {
  title: "Nhập đơn từ file",
  subtitle: "Dùng khi chưa kết nối Shopee: tải file theo mẫu, xem trước rồi xác nhận nhập",
  template: "Tải file mẫu",
  pick: "Chọn file",
  dropHint: "Kéo file vào đây hoặc bấm Chọn file. Nhận .csv, .xlsx, tối đa 5 MB.",
  fileLabel: "File đơn hàng (.csv, .xlsx)",
  reading: "Đang đọc file…",
  wrongType: "File phải là .csv hoặc .xlsx. Dùng file mẫu.",
  tooBig: "File lớn hơn 5 MB. Chia nhỏ file rồi tải lại.",
  missingColumns: (cols: string[]) =>
    `File thiếu cột bắt buộc: ${cols.map(columnLabel).join(", ")}. Dùng file mẫu.`,
  counts: (c: { new: number; updated: number; skipped: number; error: number }) =>
    `Mới ${fmtNumber(c.new)} · Cập nhật ${fmtNumber(c.updated)} · Bỏ qua ${fmtNumber(c.skipped)} (đã có từ Shopee) · Lỗi ${fmtNumber(c.error)}`,
  hasErrors: (n: number) =>
    `File có ${fmtNumber(n)} dòng lỗi. Sửa file rồi tải lại; chưa có đơn nào được nhập.`,
  commit: (n: number) => `Nhập ${fmtNumber(n)} đơn`,
  nothingToImport: "Không có đơn nào để nhập: mọi dòng đã có từ Shopee.",
  chooseOther: "Chọn file khác",
  expiresAt: (time: string) => `Bản xem trước giữ tới ${time}.`,
  expired: "Bản xem trước đã hết hạn. Tải file lại.",
  conflict: "Dữ liệu đơn vừa thay đổi trong lúc nhập. Bấm Nhập lại.",
  done: (n: number) => `Đã nhập ${fmtNumber(n)} đơn.`,
  sampleTitle: "20 dòng đầu",
  errorsTitle: "Dòng lỗi",
  previewOf: (name: string) => `Xem trước: ${name}`,
  action: { NEW: "Mới", UPDATE: "Cập nhật", SKIP: "Bỏ qua" } as const,
  col: {
    row: "Dòng",
    column: "Cột",
    reason: "Lý do",
    tracking: "Mã vận đơn",
    order: "Mã đơn",
    product: "Sản phẩm",
    variation: "Phân loại",
    quantity: "SL",
    result: "Kết quả",
  },
  history: {
    title: "Lịch sử nhập",
    empty: "Chưa nhập file nào.",
    error: "Không tải được lịch sử nhập.",
    at: "Thời gian",
    file: "File",
    by: "Người nhập",
    new: "Mới",
    updated: "Cập nhật",
    skipped: "Bỏ qua",
    error_: "Lỗi",
    status: "Trạng thái",
    download: (name: string) => `Tải file gốc ${name}`,
    fileExpired: "File gốc đã quá 90 ngày, không còn lưu.",
  },
  status: {
    COMMITTED: ["Đã nhập", "success"],
    PREVIEW: ["Chưa xác nhận", "neutral"],
    EXPIRED: ["Hết hạn", "neutral"],
    REJECTED: ["Có dòng lỗi", "error"],
  } as const,
  retry: "Thử lại",
  generic: "Có lỗi hệ thống. Thử lại sau ít phút.",
};
