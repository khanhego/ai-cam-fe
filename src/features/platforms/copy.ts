import type { ChipTone } from "@/shared/ui";

/** Chữ D7 — nguyên văn 01 §10.5 / 02b-admin §6 khi có (DEC-17). */
export const COPY = {
  title: "Kết nối Shopee",
  subtitle: "Đồng bộ đơn và trạng thái vận chuyển từ Shopee",
  connect: "Kết nối Shopee",
  reconnect: "Kết nối lại",
  sync: "Đồng bộ ngay",
  syncQueued: "Đã bắt đầu đồng bộ. Số liệu sẽ tự cập nhật.",
  syncInProgress: "Đang đồng bộ, thử lại sau.",
  notConfigured: "Chưa cấu hình Shopee Open Platform. Dùng Nhập đơn từ file.",
  openImports: "Mở Nhập đơn",
  empty: "Chưa kết nối shop Shopee nào.",
  emptyHint: "Kết nối để hệ thống tự lấy đơn và mã vận đơn. Trong lúc chờ, dùng Nhập đơn từ file.",
  loadError: "Không tải được trạng thái kết nối.",
  retry: "Thử lại",
  result: {
    connected: "Đã kết nối Shopee. Lần đồng bộ đầu tiên chạy trong vài phút.",
    denied: "Shopee từ chối ủy quyền. Bấm Kết nối lại để thử lần nữa.",
    error: "Kết nối Shopee thất bại. Thử lại sau ít phút.",
  } as Record<string, string>,
  status: {
    CONNECTED: ["Đã kết nối", "success"],
    EXPIRED: ["Hết hạn", "warning"],
    DISCONNECTED: ["Chưa kết nối", "neutral"],
  } as Record<string, [string, ChipTone]>,
  expiredHint: "Ủy quyền đã hết hạn và không tự làm mới được. Bấm Kết nối lại để tiếp tục đồng bộ.",
  field: {
    expires: "Hạn ủy quyền",
    lastSync: "Lần đồng bộ gần nhất",
    today: "Đơn đồng bộ hôm nay",
  },
  syncError: (at: string | null, message: string | null) =>
    `Đồng bộ lỗi${at ? ` lúc ${at}` : ""}${message ? `: ${message}` : "."}`,
  unnamed: "Shop Shopee",
};
