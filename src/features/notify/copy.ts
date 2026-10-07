import type { NotifyChannelType } from "@/shared/labels";

/**
 * Chữ D22 Thông báo — nguyên văn 01 §10.5 D22 / §4.5 EX-N1 (DEC-17). Mục đánh dấu `/** mới *\/` là chữ 01 chưa có, chờ
 * PO xác nhận (DEC-761).
 */
export const COPY = {
  title: "Thông báo",
  /** mới */
  subtitle: "Gửi cảnh báo quan trọng qua Telegram / Zalo OA tới điện thoại.",
  add: "Thêm kênh",
  loading: "Đang tải kênh thông báo",
  /** mới */
  loadError: "Không tải được kênh thông báo.",
  retry: "Thử lại",
  generic: "Có lỗi hệ thống. Thử lại sau ít phút.",
  notConfigured: {
    TELEGRAM: "Chưa cấu hình bot Telegram trên máy chủ. Liên hệ IT.",
    ZALO_OA: "Chưa cấu hình Zalo OA trên máy chủ. Liên hệ IT.",
  } satisfies Record<NotifyChannelType, string>,
  empty: "Chưa có kênh thông báo.",
  emptyHint: "Thêm kênh để nhận cảnh báo quan trọng trên điện thoại.",
  table: {
    /** mới */
    caption: "Kênh thông báo",
    name: "Kênh",
    type: "Loại",
    events: "Sự kiện",
    status: "Trạng thái",
    actions: "Thao tác",
  },
  status: {
    ok: (at: string) => `Gửi được ${at}`,
    error: (at: string | null, message: string) => (at ? `Lỗi ${at}: ${message}` : `Lỗi: ${message}`),
    off: "Tắt",
    /** mới */
    never: "Chưa gửi",
  },
  test: "Gửi thử",
  /** mới */
  testing: "Đang gửi thử…",
  testFor: (name: string) => `Gửi thử kênh ${name}`,
  testDone: (name: string) => `Đã gửi tin thử tới ${name}.`,
  testFailed: (message: string) => `Gửi thử lỗi: ${message}`,
  /** mới — gửi thử khi loại kênh chưa cấu hình */
  testLocked: "Loại kênh này chưa cấu hình trên máy chủ.",
  edit: "Sửa",
  editFor: (name: string) => `Sửa kênh ${name}`,
  more: (name: string) => `Thao tác khác cho kênh ${name}`,
  remove: "Xóa kênh",
  /** mới */
  timeout: {
    TELEGRAM: "Không kết nối được Telegram từ máy chủ (mạng chặn?).",
    ZALO_OA: "Không kết nối được Zalo OA từ máy chủ (mạng chặn?).",
  } satisfies Record<NotifyChannelType, string>,
} as const;

export const DIALOG = {
  addTitle: "Thêm kênh",
  editTitle: "Sửa kênh",
  name: "Tên kênh *",
  /** mới */
  nameRule: "Tên kênh 2–40 ký tự.",
  nameExists: "Đã có kênh tên này.",
  type: "Loại *",
  target: { TELEGRAM: "Chat ID *", ZALO_OA: "Zalo user ID *" } satisfies Record<NotifyChannelType, string>,
  targetHint: {
    TELEGRAM: "Thêm bot vào nhóm, gửi /start, rồi dán Chat ID.",
    ZALO_OA: "Người nhận phải quan tâm OA của shop.",
  } satisfies Record<NotifyChannelType, string>,
  targetRule: {
    TELEGRAM: "Chat ID là một số (nhóm thường bắt đầu bằng -100).",
    ZALO_OA: "Zalo user ID 1–64 chữ số.",
  } satisfies Record<NotifyChannelType, string>,
  /** mới */
  events: "Sự kiện *",
  eventsRule: "Chọn ít nhất 1 sự kiện.",
  enabled: "Bật",
  save: "Lưu",
  cancel: "Hủy",
  /** mới */
  added: (name: string) => `Đã thêm kênh ${name}.`,
  /** mới */
  saved: (name: string) => `Đã lưu kênh ${name}.`,
} as const;

export const REMOVE = {
  title: (name: string) => `Xóa kênh ${name}?`,
  body: "Tin đang chờ của kênh này bị bỏ.",
  confirm: "Xóa kênh",
  cancel: "Hủy",
  /** mới */
  done: (name: string) => `Đã xóa kênh ${name}.`,
} as const;

export const QUIET = {
  /** mới — tiêu đề khối + Dialog */
  title: "Giờ yên lặng",
  summary: (start: string, end: string) => `Giờ yên lặng: ${start} – ${end} (chỉ gửi mức Cao)`,
  /** mới */
  summaryOff: "Giờ yên lặng: tắt (gửi mọi lúc)",
  edit: "Sửa",
  editLabel: "Sửa giờ yên lặng",
  /** mới — nhãn 2 ô (02b-admin §5) */
  start: "Từ",
  end: "Đến",
  off: "Tắt giờ yên lặng",
  /** mới */
  hint: "Trong giờ yên lặng chỉ gửi sự kiện mức Cao; tin khác gom gửi lúc hết giờ.",
  /** mới */
  timeRule: "Giờ dạng HH:MM.",
  /** mới */
  sameRule: "Giờ kết thúc phải khác giờ bắt đầu.",
  save: "Lưu",
  cancel: "Hủy",
  /** mới */
  saved: "Đã lưu giờ yên lặng.",
} as const;

export const LOG = {
  title: "Nhật ký gửi (30 ngày)",
  channel: "Kênh",
  /** mới */
  allChannels: "Tất cả kênh",
  status: "Kết quả",
  /** mới */
  allStatuses: "Tất cả",
  col: { time: "Thời gian", channel: "Kênh", event: "Nội dung", status: "Kết quả" },
  /** "Lệch trạng thái mức Cao (2 mục)" (01 §10.5 D22). */
  event: (label: string, count: number) => `${label} (${count} mục)`,
  /** mới */
  showText: "Xem tin",
  /** mới */
  nextAttempt: (at: string) => `thử lại lúc ${at}`,
  /** mới */
  empty: "Chưa có tin nào trong 30 ngày.",
  /** mới */
  emptyFiltered: "Không có tin khớp bộ lọc.",
  /** mới */
  clear: "Xóa lọc",
  /** mới */
  loadError: "Không tải được nhật ký gửi.",
  loading: "Đang tải nhật ký gửi",
  retry: "Thử lại",
} as const;
