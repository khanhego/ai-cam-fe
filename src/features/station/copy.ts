import type { AlertCode, ApprovalBrief } from "@/lib/api/station";

/** Chữ màn station — nguyên văn 01 §10.4 (DEC-17: không dùng thư viện i18n). */
export const COPY = {
  ready: {
    title: "SẴN SÀNG",
    hint: "Quét mã vận đơn để bắt đầu",
    today: (n: number) => `Hôm nay: ${n} kiện`,
  },
  recent: {
    title: "Phiên gần đây",
    empty: "Chưa có phiên nào hôm nay.",
    view: "Xem",
    cutting: "Đang cắt clip",
  },
  packing: {
    title: "ĐANG ĐÓNG GÓI",
    hint: "Dán phiếu lên kiện rồi QUÉT LẠI MÃ để hoàn tất",
    timer: "Thời gian",
    noItems: "Chưa có danh sách sản phẩm cho đơn này.",
    buyerNote: "Ghi chú của khách:",
    cancel: "Hủy phiên",
    callManager: "Gọi quản lý",
    warn15: (m: number) => `Phiên đã mở ${m} phút. Quét lại mã để hoàn tất hoặc Hủy phiên.`,
  },
  tray: {
    MATCH: "Cam 2 khớp mã trên khay",
    NOT_SEEN: "Cam 2 chưa thấy phiếu",
    UNAVAILABLE: "Cam 2 không đọc được",
  },
  flags: { UNVERIFIED: "Chưa xác minh với Shopee", REPACK: "Đóng gói lại" } as Record<string, string>,
  mismatch: {
    title: "LỆCH MÃ — KHÔNG DÁN PHIẾU NÀY",
    expected: "Đang đóng gói",
    scanned: "Vừa quét",
    cam2: "Cam 2 thấy trên khay",
    hint: (code: string) => `Gỡ phiếu sai, dán đúng phiếu ${code} rồi quét lại mã.`,
  },
  alert: {
    ORDER_CANCELLED: "ĐƠN ĐÃ HỦY",
    ALREADY_PACKED: "ĐƠN ĐÃ ĐÓNG GÓI",
    ALREADY_HANDED_OVER: "ĐƠN ĐÃ BÀN GIAO",
    INVALID_CODE: "MÃ KHÔNG HỢP LỆ",
    PACKED_ELSEWHERE_IN_PROGRESS: "ĐANG ĐÓNG GÓI Ở STATION KHÁC",
  } satisfies Record<AlertCode, string>,
  requestRepack: "Yêu cầu đóng gói lại",
  waiting: {
    title: "ĐANG CHỜ QUẢN LÝ DUYỆT",
    reason: { MISMATCH: "Lệch mã", ASSIST: "Gọi quản lý", REPACK: "Đóng gói lại" } satisfies Record<
      ApprovalBrief["type"],
      string
    >,
    hint: "Quản lý duyệt trên dashboard, mục Yêu cầu duyệt.",
    withdraw: "Rút yêu cầu",
    waited: "Đã chờ",
  },
  disconnected: {
    title: "MẤT KẾT NỐI MÁY CHỦ",
    hint: "Không quét được lúc này. Kiểm tra dây mạng của máy trạm. Hệ thống tự kết nối lại.",
    since: (s: number) => `Mất kết nối ${s} giây`,
  },
  cancelDialog: {
    title: "Hủy phiên",
    reasons: { OUT_OF_STOCK: "Hết hàng", WRONG_SCAN: "Quét nhầm", OTHER: "Khác" },
    note: "Ghi chú",
    noteRequired: "Nhập lý do khi chọn Khác",
    confirm: "Hủy phiên",
  },
  camera: {
    online: (role: string) => role,
    offline: (role: string) => `${role} mất tín hiệu`,
    alert: (role: string) => `${role} mất tín hiệu. Vẫn đóng gói được, video sẽ thiếu. Báo quản lý.`,
  },
  inactive: {
    title: "STATION ĐANG TẮT",
    hint: "Không quét được. Hệ thống tự kiểm tra lại mỗi 30 giây.",
  },
  unexpected: "Có lỗi xảy ra. Thử lại.",
  network: "Mạng",
  notLoggedIn: "Station chưa đăng nhập. Đăng nhập rồi quét lại.",
  abandoned: (code: string) => `Phiên ${code} đã tự đóng do quá 30 phút.`,
  cancelledByManager: "Quản lý đã hủy phiên.",
  logout: "Đăng xuất station (giữ 3 giây)",
};

export const cameraName = (role: "CAM1" | "CAM2") => (role === "CAM1" ? "Cam 1" : "Cam 2");
