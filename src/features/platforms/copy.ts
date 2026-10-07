import type { Shop } from "@/lib/api/shops";
import type { Platform } from "@/shared/labels";
import { PLATFORM_LABEL } from "@/shared/labels";
import type { ChipTone } from "@/shared/ui";

const L = (p: Platform) => PLATFORM_LABEL[p];

/** Chữ D7 Kết nối sàn — nguyên văn 01 §10.5 D7 (item 03) / 02b-admin §6 khi có (DEC-17). */
export const COPY = {
  title: "Kết nối sàn",
  subtitle: "Đơn, mã vận đơn, trạng thái và hàng hoàn được đồng bộ tự động từ mọi shop đã kết nối",
  connect: (p: Platform) => `Kết nối ${L(p)}`,
  reconnect: "Kết nối lại",
  sync: "Đồng bộ ngay",
  syncQueued: "Đã bắt đầu đồng bộ. Số liệu sẽ tự cập nhật.",
  syncInProgress: "Đang đồng bộ, thử lại sau.",
  /** EX-T1 / FR-05.20: sàn tắt hoặc thiếu khóa ứng dụng. */
  notConfigured: {
    SHOPEE: "Chưa cấu hình Shopee Open Platform. Dùng Nhập đơn từ file.",
    TIKTOK: "Chưa cấu hình TikTok Shop. Liên hệ IT để bật (cần tài khoản đối tác TikTok Shop).",
  } as Record<Platform, string>,
  openImports: "Mở Nhập đơn",
  empty: "Chưa kết nối shop nào.",
  emptyHint: "Kết nối để hệ thống tự lấy đơn và mã vận đơn. Trong lúc chờ, dùng Nhập đơn từ file.",
  groupEmpty: (p: Platform) => `Chưa kết nối shop ${L(p)} nào.`,
  loadError: "Không tải được trạng thái kết nối.",
  retry: "Thử lại",
  /** `?result=` sau callback API-72 / API-155 (01 §10.5 D7) — theo `platform`, `count`. */
  result: (result: string, p: Platform, count: number | null): string => {
    switch (result) {
      case "connected":
        return `${count ? `Đã kết nối ${count} shop ${L(p)}` : `Đã kết nối ${L(p)}`}. Lần đồng bộ đầu tiên chạy trong vài phút.`;
      case "denied":
        return `${L(p)} từ chối ủy quyền. Bấm Kết nối lại để thử lần nữa.`;
      case "expired":
        return `Phiên kết nối đã hết hạn. Bấm Kết nối ${L(p)} để làm lại.`;
      default:
        return `Kết nối ${L(p)} thất bại. Thử lại sau ít phút.`;
    }
  },
  status: {
    CONNECTED: ["Đã kết nối", "success"],
    EXPIRED: ["Hết hạn", "warning"],
    DISCONNECTED: ["Đã ngắt", "neutral"],
  } as Record<string, [string, ChipTone]>,
  expiredHint: "Ủy quyền đã hết hạn và không tự làm mới được. Bấm Kết nối lại để tiếp tục đồng bộ.",
  field: {
    expires: "Hạn ủy quyền",
    lastSync: "Lần đồng bộ gần nhất",
    today: "Đơn đồng bộ hôm nay",
  },
  /** Câu theo `last_error.code` (02 v0.5 DEC-62 + item 03 02 §6.2 API-70); thay "Shopee" bằng tên sàn; mã lạ → câu chung. */
  syncError: (p: Platform, at: string | null, code: string | null | undefined) => {
    const when = at ? ` lúc ${at}` : "";
    switch (code) {
      case "SYNC_FAILED":
        return `Đồng bộ lỗi${when}: ${L(p)} không phản hồi sau nhiều lần thử. Bấm Đồng bộ ngay để thử lại.`;
      case "AUTH_EXPIRED":
        return `${L(p)} từ chối ủy quyền${when}. Bấm Kết nối lại để tiếp tục đồng bộ.`;
      case "REFRESH_FAILED":
        return `Làm mới ủy quyền ${L(p)} lỗi${when}. Hệ thống sẽ tự thử lại.`;
      case "SHOP_NOT_AUTHORIZED":
        return `${L(p)} đã bỏ shop này khỏi ủy quyền${when}. Bấm Kết nối lại để cấp quyền lại.`;
      case "CREDENTIALS_UNREADABLE":
        return `Không đọc được ủy quyền đã lưu${when}. Bấm Kết nối lại để cấp quyền lại.`;
      default:
        return `Đồng bộ lỗi${when}. Thử lại sau ít phút.`;
    }
  },
  techDetails: "Chi tiết kỹ thuật",
  warnings: "Cảnh báo đồng bộ",
  moreWarnings: (n: number) => `và ${n} cảnh báo khác`,
  disconnectedGroup: (n: number) => `Shop đã ngắt (${n})`,
  disconnectedAt: "ngắt lúc",
  moreActions: (name: string) => `Thao tác khác cho ${name}`,
  disconnect: "Ngắt kết nối",
  disconnectTitle: (name: string) => `Ngắt kết nối ${name}?`,
  disconnectBody:
    "Hệ thống ngừng đồng bộ đơn, trạng thái và hàng hoàn của shop này. Đơn, kiện, hồ sơ đã có giữ nguyên. Kết nối lại bất kỳ lúc nào.",
  cancel: "Hủy",
  disconnected: (name: string) => `Đã ngắt kết nối ${name}.`,
  unnamed: (p: Platform) => `Shop ${L(p)}`,
};

export const shopName = (shop: Shop) => shop.name ?? COPY.unnamed(shop.platform);
