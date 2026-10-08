/**
 * Chữ D23 Sao lưu cloud — nguyên văn 01 §10.5 D23 khi có (DEC-17). Chữ 01 không có (đánh dấu "mới") ghi ở DEC-632 để PO
 * xác nhận.
 */
export const COPY = {
  title: "Sao lưu cloud",
  /** mới */
  subtitle: "Sao lưu cơ sở dữ liệu và bằng chứng lên kho lưu ngoài, đã mã hóa",
  storage: (host: string, bucket: string) => `Kho lưu: ${host} / ${bucket}`,
  keyLine: (fp: string) => `Khóa giải mã: dấu vân tay ${fp}`,
  keyConfirmed: (at: string, by: string) => `Đã xác nhận cất ${at} (${by})`,
  /** mới */
  keyNotConfirmed: "Chưa xác nhận cất khóa",
  testConnection: "Kiểm tra kết nối",
  /** mới */
  testing: "Đang kiểm tra…",
  runDb: "Sao lưu DB ngay",
  /** mới */
  runDbStarted: "Đã bắt đầu sao lưu DB.",
  runDbRunning: "Đang sao lưu, thử lại sau.",
  disabledTip: "Sao lưu đang tắt. Bật sao lưu trước.",
  /** mới — nút khóa khi khóa chưa xác nhận / khôi phục chưa kiểm. */
  pausedTip: "Sao lưu đang tạm dừng.",
  testOk: "Kết nối kho lưu tốt (ghi, đọc, xóa thử thành công).",
  testAuthFailed: "Kho lưu từ chối: sai khóa truy cập.",
  testUnreachable: "Không kết nối được kho lưu. Kiểm tra Internet.",

  notConfiguredTitle: "Chưa cấu hình kho lưu cloud.",
  notConfiguredBody:
    "IT điền thông tin kho lưu và khóa sao lưu trong cấu hình máy chủ (xem tài liệu vận hành, mục Sao lưu cloud).",

  /** mới */
  enabledSwitch: "Bật sao lưu tự động",
  /** mới — Dialog xác nhận khi tắt. */
  disable: {
    title: "Tắt sao lưu cloud?",
    body: "Cơ sở dữ liệu và bằng chứng mới sẽ không được sao lưu tới khi bật lại. Nếu máy chủ hỏng trong thời gian này, dữ liệu sau lần sao lưu cuối không khôi phục được.",
    confirm: "Tắt sao lưu",
    cancel: "Hủy",
  },
  /** mới */
  enabledToast: "Đã bật sao lưu cloud.",
  /** mới */
  disabledToast: "Đã tắt sao lưu cloud.",

  banner: {
    unconfirmed: "Sao lưu chưa bật: xác nhận đã cất khóa giải mã.",
    changed: "Khóa sao lưu trên máy chủ đã đổi. Sao lưu tạm dừng tới khi xác nhận đã cất khóa mới.",
    restorePending:
      "Hệ thống vừa được khôi phục. Sao lưu tạm dừng tới khi IT chạy lệnh kiểm khôi phục đạt (tài liệu vận hành, mục Khôi phục).",
    confirm: "Xác nhận",
  },
  confirmKey: {
    title: "Đã cất khóa giải mã?",
    body: (fp: string) =>
      `Nếu máy chủ hỏng mà không có khóa này, bản sao lưu trên cloud không mở được. Chép khóa trong cấu hình máy chủ ra nơi an toàn ngoài máy (két, trình quản lý mật khẩu). Dấu vân tay: ${fp}.`,
    bodyStrong: "không mở được",
    check: "Tôi đã cất bản sao khóa ở nơi an toàn ngoài máy chủ",
    submit: "Bật sao lưu",
    cancel: "Hủy",
    mismatch: "Khóa trên máy chủ vừa đổi — kiểm lại dấu vân tay.",
  },

  cards: {
    db: "Cơ sở dữ liệu",
    evidence: "Bằng chứng",
    cloud: "Trên cloud",
    /** "13:00 hôm nay · 182 MB" */
    lastSuccess: (when: string, size: string) => `${when} · ${size}`,
    /** mới */
    never: "Chưa có lần sao lưu thành công",
    next: (at: string) => `Lần kế ${at}`,
    /** mới */
    running: "Đang sao lưu…",
    late: (hours: number) => `Chưa sao lưu được ${hours} giờ`,
    failedTwice: "2 lần sao lưu DB gần nhất không thành công",
    uploaded: (n: string) => `${n} tệp đã sao lưu`,
    pending: (n: string) => `${n} tệp đang chờ`,
    lateFiles: (n: string) => `${n} tệp chờ quá 24 giờ`,
  },
  /** mới */
  lastError: (at: string, message: string) => `Lỗi gần nhất (${at}): ${message}`,

  history: {
    title: "Lịch sử 14 ngày",
    at: "Thời điểm",
    kind: "Loại",
    size: "Kích thước",
    result: "Kết quả",
    /** mới (v0.2 cột dấu vân tay) */
    key: "Khóa",
    db: "Cơ sở dữ liệu",
    success: "Thành công",
    /** mới */
    running: "Đang chạy",
    failed: (error: string | null) => (error ? `Lỗi: ${error}` : "Lỗi"),
    /** mới */
    empty: "Chưa có lượt sao lưu nào trong 14 ngày.",
    /** mới */
    oldKey: "khóa cũ",
  },

  issues: {
    hashAlert: (n: number) => `${n} clip có mã băm khác lúc tạo — không được sao lưu.`,
    sourceAlert: (n: number) =>
      `${n} tệp bằng chứng không thấy trên ổ của máy chủ — chưa được sao lưu. Hệ thống tự thử lại mỗi giờ.`,
    show: "Xem danh sách",
    /** mới */
    hide: "Ẩn danh sách",
    /** mới */
    listLabel: (kind: string) => `Danh sách tệp: ${kind}`,
    tracking: "Mã kiện",
    /** mới */
    noTracking: "Không gắn kiện",
    type: { CLIP: "Clip", SNAPSHOT: "Ảnh" } as Record<string, string>,
    /** mới */
    detectedAt: (at: string) => `Phát hiện ${at}`,
    /** mới */
    hashes: (expected: string, actual: string) => `Mã băm lúc tạo ${expected} · hiện tại ${actual}`,
    /** mới */
    loadError: "Không tải được danh sách tệp.",
    /** mới */
    more: (shown: number, total: number) => `Đang hiện ${shown} / ${total} tệp.`,
    uploadAnyway: "Vẫn sao lưu",
    ignore: "Bỏ qua",
    retry: "Thử lại ngay",
  },
  resolve: {
    title: {
      UPLOAD_ANYWAY: "Vẫn sao lưu bản hiện có?",
      IGNORE: "Bỏ qua tệp này?",
      RETRY: "Thử lại ngay?",
    },
    body: {
      UPLOAD_ANYWAY: "Bản trên cloud sẽ ghi chú lệch mã băm.",
      IGNORE: "Tệp này sẽ không có bản sao ngoài kho.",
      RETRY: "Dùng sau khi IT đã chép lại tệp vào máy chủ.",
    },
    /** mới — Bỏ qua tệp không thấy tại kho → clip / ảnh thành "Thiếu tệp" (DEC-530). */
    ignoreMissing:
      'Clip / ảnh này sẽ hiện "Thiếu tệp" ở mọi màn (không phát, không cắt lại, không vào link).',
    reason: "Lý do*",
    reasonRule: "Nhập lý do (5–500 ký tự).",
    cancel: "Hủy",
    done: "Đã ghi nhận.",
    retried: "Đã xếp thử lại.",
  },

  oldKeys: {
    alert: (files: string, runs: string, fp: string) =>
      `${files} tệp bằng chứng và ${runs} bản DB mã hóa bằng khóa ${fp} (cũ) — giữ khóa cũ để khôi phục được các bản này.`,
    button: "Tải lại bằng chứng bằng khóa mới",
    dialogTitle: "Tải lại bằng chứng bằng khóa mới?",
    dialogBody: (n: string, gb: string) =>
      `Tải lại ${n} tệp còn ở kho bằng khóa mới? Khoảng ${gb} GB, chạy nền theo giới hạn tốc độ.`,
    /** 01: "(tệp đã bị xóa tại kho không tải lại được — vẫn cần khóa cũ)". */
    dialogNote: "Tệp đã bị xóa tại kho không tải lại được — vẫn cần khóa cũ để khôi phục.",
    /** mới — `reuploadable = 0`. */
    nothing: "Không còn tệp nào ở kho để tải lại — vẫn cần khóa cũ để khôi phục các bản trên.",
    confirm: "Tải lại",
    cancel: "Hủy",
    queued: (n: string) => `Đã xếp ${n} tệp vào hàng chờ.`,
  },

  options: {
    /** mới */
    title: "Tùy chọn",
    allPackClips: "Sao lưu thêm mọi clip đóng gói",
    /** mới — L27: hệ quả của mặc định (FR-02.18). */
    allPackClipsScope:
      "Mặc định chỉ sao lưu bằng chứng đang được giữ (hồ sơ hàng hoàn / khiếu nại). Mất máy kho thì clip " +
      "đóng gói của đơn đang giao hoặc mới giao chưa có hồ sơ sẽ mất. Bật tùy chọn này để sao lưu mọi clip " +
      "đóng gói (tốn dung lượng cloud hơn — xem ước tính).",
    estimate: (gb: string) => `Ước tính thêm ≈ ${gb} GB / ngày tải lên.`,
    advanced: "Nâng cao",
    uploadMbps: "Giới hạn tốc độ tải lên (Mbit/s)",
    uploadHint: "Giảm khi Internet kho yếu để quét và xem camera không bị chậm.",
    /** mới */
    uploadRule: "Nhập số từ 1 đến 1000.",
    save: "Lưu",
    saved: "Đã lưu.",
  },

  /** mới */
  loadError: "Không tải được trạng thái sao lưu.",
  retry: "Thử lại",
  generic: "Có lỗi hệ thống. Thử lại sau ít phút.",
};
