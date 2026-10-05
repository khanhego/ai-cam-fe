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
  /** Câu theo `last_error.code` (02 v0.5 DEC-62); mã lạ → câu chung. */
  syncError: (at: string | null, code: string | null | undefined) => {
    const when = at ? ` lúc ${at}` : "";
    switch (code) {
      case "SYNC_FAILED":
        return `Đồng bộ lỗi${when}: Shopee không phản hồi sau nhiều lần thử. Bấm Đồng bộ ngay để thử lại.`;
      case "AUTH_EXPIRED":
        return `Shopee từ chối ủy quyền${when}. Bấm Kết nối lại để tiếp tục đồng bộ.`;
      case "REFRESH_FAILED":
        return `Làm mới ủy quyền Shopee lỗi${when}. Hệ thống sẽ tự thử lại.`;
      default:
        return `Đồng bộ lỗi${when}. Thử lại sau ít phút.`;
    }
  },
  techDetails: "Chi tiết kỹ thuật",
  past: (n: number) => `Shop đã thay (${n})`,
  pastLabel: "Shop đã thay",
  unnamed: "Shop Shopee",
};
