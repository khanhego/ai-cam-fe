import type { AlertCode, ApprovalBrief } from "@/lib/api/station";
import { CONCLUSION_LABEL } from "@/shared/returns/inspection";
import type { Conclusion } from "@/shared/returns/types";

/** Chữ màn station — nguyên văn 01 §10.4 (DEC-17: không dùng thư viện i18n). Item 02: R1–R5, S1/S2/S3 mở rộng. */
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
    // R4 (01 §10.4). OPERATOR_REQUIRED mở R5, hai mã cuối hiện tại chỗ R2 — tiêu đề dùng khi cần.
    OPERATOR_REQUIRED: "CHƯA CÓ NGƯỜI KIỂM",
    RETURN_NOT_FOUND: "KHÔNG TÌM THẤY ĐƠN",
    RETURN_ALREADY_RECEIVED: "KIỆN HOÀN ĐÃ NHẬN",
    RETURN_MULTIPLE_PACKAGES: "ĐƠN CÓ NHIỀU KIỆN",
    NOT_SHIPPED: "KIỆN CHƯA GỬI ĐI",
    RETURN_IN_PROGRESS_ELSEWHERE: "ĐANG KIỂM Ở STATION KHÁC",
    INSPECTION_REQUIRED: "CHƯA CHỌN KẾT LUẬN",
    RETURN_CODE_DIFFERENT: "MÃ KHÔNG THUỘC KIỆN ĐANG KIỂM",
    // item 03 (02b-station §9) — hành vi đầy đủ ở T-233 / T-236.
    ORDER_CANCEL_REQUESTED: "ĐƠN ĐANG YÊU CẦU HỦY",
    RETURN_MULTIPLE_ORDERS: "MÃ CÓ Ở NHIỀU ĐƠN",
  } satisfies Record<AlertCode, string>,
  /** Dòng phụ R4 khi server không gửi `message` đủ ý (01 §10.4 R4). */
  returnAlert: {
    notFound: (code: string) => `Không có đơn nào khớp mã ${code}, sàn không trả lời.`,
    alreadyReceived: (code: string, time: string, station: string, conclusion: Conclusion | null) =>
      `${code} đã nhận lúc ${time} tại ${station}${conclusion ? ` — ${CONCLUSION_LABEL[conclusion]}` : ""}.`,
    notShipped: (code: string, status: string) =>
      `${code} đang ở trạng thái ${status} trong kho. Đây không phải hàng hoàn.`,
    multiple: (orderSn: string, n: number) => `Đơn ${orderSn} có ${n} kiện. Chọn đúng kiện đang cầm.`,
    elsewhere: (code: string, station: string) => `${code} đang được kiểm tại ${station}.`,
    operatorRequired: "Nhập tên người kiểm trước khi nhận hàng hoàn.",
    findManual: "Tìm thủ công",
    openUnidentified: "Mở phiên chưa xác định",
    recordOther: "Đây là kiện khác — vẫn ghi hình",
    recordOtherTitle: "Ghi chú kiện khác",
    recordOtherNote: "Ghi chú (bắt buộc)",
    recordOtherNoteError: "Nhập ghi chú 5–200 ký tự.",
    recordOtherConfirm: "Mở phiên",
    forceNewNotAllowed: "Mã này không thuộc kiện đã nhận — quét lại.",
    isReturnAtPack: "Đây là kiện hàng hoàn — nhận ở bàn nhận hoàn.",
  },
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
    /** Phiên RETURN (01 §10.4 R2 "Hủy phiên"). */
    returnReasons: { WRONG_SCAN: "Quét nhầm", NOT_A_RETURN: "Kiện không phải hàng hoàn", OTHER: "Khác" },
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
  autoCloseBlocked:
    "Phiên hoàn chưa tự hoàn tất được: kết luận chưa đủ (vd. chọn Khác mà thiếu ghi chú). Sửa kết luận rồi quét lại mã để đóng.",
  logout: "Đăng xuất station (giữ 3 giây)",

  // ---- item 02 (01 §10.4) ----
  workMode: {
    chip: "Nhận hàng hoàn",
    toReturn: "Chuyển sang nhận hàng hoàn",
    toPack: "Chuyển sang đóng gói",
    sessionActive: "Đóng phiên trước khi đổi.",
  },
  operator: {
    title: "Người kiểm hàng hoàn",
    label: "Tên người kiểm",
    submit: "Bắt đầu ca",
    required: "Nhập tên người kiểm.",
    length: "Tên người kiểm 2–40 ký tự.",
    statusBar: (name: string) => `Người kiểm: ${name}`,
    change: "Đổi",
    sessionActive: "Đóng phiên trước khi đổi người kiểm.",
  },
  returns: {
    ready: {
      title: "SẴN SÀNG NHẬN HÀNG HOÀN",
      hint: "Quét mã trên kiện hoàn để bắt đầu",
      hintCodes: "(mã vận đơn chiều về, mã gốc hoặc mã đơn)",
      today: (n: number, issues: number) => `Hôm nay: ${n} kiện hoàn · ${issues} có vấn đề`,
      empty: "Chưa có kiện hoàn nào hôm nay.",
      lookup: "Không quét được mã? Tìm thủ công",
      cameraAlert: (role: string) => `${role} mất tín hiệu. Vẫn nhận hoàn được, video sẽ thiếu. Báo quản lý.`,
    },
    inspecting: {
      title: "ĐANG KIỂM HÀNG HOÀN",
      order: (sn: string) => `Đơn ${sn}`,
      original: (code: string) => `Mã gốc ${code}`,
      reason: "Lý do của khách:",
      columns: {
        product: "Sản phẩm",
        sent: "Gửi",
        requested: "Yêu cầu trả",
        received: "Nhận",
        condition: "Tình trạng",
      },
      notReturned: "(không trả)",
      referenceOnly: (n: number) => `Đơn có ${n} kiện — chỉ chọn kết luận chung cho kiện này.`,
      noLines: "Chưa có danh sách sản phẩm. Chọn kết luận chung.",
      conclusion: "Kết luận:",
      okLocked: "Có dòng thiếu / hỏng — chọn vấn đề.",
      note: "Ghi chú",
      noteRequired: "Nhập ghi chú khi chọn Khác.",
      snapshots: "Ảnh:",
      capture: "+ Chụp ảnh (F2)",
      snapshotLimit: "Đã đủ 20 ảnh",
      snapshotFailed: "Không chụp được ảnh từ Cam 1. Thử lại.",
      hint: "Chọn kết luận rồi QUÉT LẠI MÃ để hoàn tất",
      inspectionRequired: "Chọn kết luận trước khi quét đóng.",
      inspectionUnsaved: "Kết luận chưa lưu được — sửa lỗi rồi quét lại mã để hoàn tất.",
      codeDifferent: (code: string) =>
        `Mã ${code} không thuộc kiện đang kiểm. Quét lại mã trên kiện này để hoàn tất.`,
      packRef: "Lúc đóng gói",
      viewPackClip: "Xem clip đóng gói",
      noPackClip: "Không có clip đóng gói (đơn trước khi dùng hệ thống).",
      packClipForbidden: "Không xem được clip lúc này.",
      warn: (m: number) => `Phiên đã mở ${m} phút. Chọn kết luận rồi quét lại mã.`,
      saved: "Đã lưu",
      saving: "Đang lưu…",
      saveFailed: "Chưa lưu được — thử lại",
      lineQuantity: (name: string) => `Số nhận ${name}`,
    },
  },
  lookup: {
    title: "Tìm kiện hoàn",
    label: "Mã vận đơn hoặc mã đơn",
    submit: "Tìm",
    minLength: "Nhập ít nhất 4 ký tự.",
    empty: "Không tìm thấy. Kiểm tra lại mã hoặc Mở phiên chưa xác định.",
    error: "Không tìm được lúc này. Thử lại.",
    open: "Mở phiên",
    openUnidentified: "Mở phiên chưa xác định",
    sessionActive: "Station đang có phiên. Đóng phiên trước.",
    notFound: "Không tìm thấy kiện này nữa. Tìm lại.",
  },
  closedNotice: {
    /** S1 (FR-03.14). */
    labelOnTray: (code: string) =>
      `Phiếu ${code} vẫn còn trên khay. Kiểm tra kiện vừa đóng đã dán phiếu chưa.`,
    cam2Unverified: (code: string) =>
      `Cam 2 không xác minh được phiếu của ${code}. Kiểm tra phiếu trên kiện trước khi giao.`,
    /** R1. */
    returnOk: (code: string, conclusion: Conclusion) => `Đã nhận ${code} — ${CONCLUSION_LABEL[conclusion]}.`,
    returnIssue: (code: string, conclusion: Conclusion, claim: string | null) =>
      `Đã nhận ${code} — ${CONCLUSION_LABEL[conclusion]}.${claim ? ` Đã tạo hồ sơ khiếu nại ${claim}.` : ""}`,
    autoClosed: (code: string, conclusion: Conclusion) =>
      `Phiên ${code} đã tự hoàn tất do quá 45 phút (kết luận: ${CONCLUSION_LABEL[conclusion]}).`,
    returnAbandoned: (code: string) => `Phiên ${code} đã tự đóng do quá 45 phút, chưa có kết luận.`,
  },
  orderCancelled: {
    banner: "ĐƠN VỪA BỊ HỦY TRÊN SHOPEE — không gửi kiện này. Bấm Hủy phiên, để hàng lại kệ.",
  },
  /** S3 nguồn "Vừa quét" (FR-03.13) — hai tình huống. */
  mismatchScanCases: {
    title: "LỆCH MÃ — DỪNG LẠI, CHƯA DÁN PHIẾU",
    forgot: (expected: string) => `1. Kiện ${expected} đã đóng xong mà quên quét?`,
    forgotAction: (expected: string) => `→ Quét mã trên chính kiện ${expected} để hoàn tất.`,
    forgotNote: (scanned: string) => `Phiếu ${scanned} là của kiện sau: để riêng, chưa dán.`,
    wrongLabel: (scanned: string) => `2. Vừa dán nhầm phiếu ${scanned} lên kiện này?`,
    wrongLabelAction: (scanned: string, expected: string) =>
      `→ Gỡ phiếu ${scanned}, dán phiếu ${expected}, quét lại mã.`,
    cam2: (actual: string) => `Bỏ phiếu ${actual} khỏi khay. Phiếu này không thuộc kiện đang đóng.`,
  },
};

export const cameraName = (role: "CAM1" | "CAM2") => (role === "CAM1" ? "Cam 1" : "Cam 2");
