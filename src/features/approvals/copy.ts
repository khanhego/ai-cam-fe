import type { ApprovalAction } from "@/lib/api/approvals";

/** Chữ D13 — nguyên văn 01 §10.5 + 02 §6.2 API-21 + 02b-admin §3, §8 (DEC-17). */
export const COPY = {
  title: "Yêu cầu duyệt",
  subtitle: "Yêu cầu từ station đang chờ quản lý xử lý. Danh sách tự cập nhật.",
  empty: "Không có yêu cầu nào đang chờ.",
  error: "Không tải được danh sách yêu cầu duyệt.",
  retry: "Thử lại",
  trackingLabel: "Mã vận đơn",
  operatorLabel: "Người kiểm",
  scanned: "Vừa quét",
  cam2Saw: "Cam 2 thấy",
  waiting: (minutes: number) => (minutes < 1 ? "Vừa gửi" : `Chờ ${minutes} phút`),
  live: "Xem live",
  trayWarning: "Cam 2 vẫn thấy phiếu sai, Cho tiếp tục sẽ đưa station về Lệch mã.",
  trayStillDifferent: "Cam 2 vẫn thấy phiếu sai trên khay. Yêu cầu bỏ phiếu sai trước.",
  alreadyResolved: (by: string, at: string) => `Yêu cầu này đã được ${by} xử lý lúc ${at}.`,
  withdrawn: "Station đã rút yêu cầu.",
  forbidden: "Tài khoản không có quyền thực hiện thao tác này.",
  noteTitle: "Đóng phiên có ghi chú",
  noteLabel: "Ghi chú",
  noteHint: "Bắt buộc, tối đa 500 ký tự. Phiên được đóng với cờ Quản lý đóng phiên.",
  noteRequired: "Nhập ghi chú (1–500 ký tự).",
  noteConfirm: "Đóng phiên",
  cancelTitle: "Hủy phiên?",
  cancelBody: (code: string) => `Phiên đóng gói ${code} sẽ bị hủy, kiện quay về chưa đóng gói.`,
  cancelReturnBody: (code: string) => `Phiên mở hoàn ${code} sẽ bị hủy.`,
  cancelConfirm: "Hủy phiên",
  badge: (n: number) => `${n} yêu cầu đang chờ`,
  // item 03 v0.3 (01 §10.5 D13 — DEC-514, DEC-525): Dialog "Hủy phiên mở hoàn?".
  cancelReturn: {
    title: "Hủy phiên mở hoàn?",
    reason: "Lý do*",
    reasons: {
      WRONG_SCAN: "Quét nhầm kiện khác",
      NOT_A_RETURN: "Không phải kiện hàng hoàn",
      OTHER: "Lý do khác (kiện hoàn thật)",
    },
    note: "Ghi chú*",
    notePlaceholder: "Ví dụ: quét nhầm mã kiện bên cạnh",
    excluded: "Video phiên này vẫn được giữ nhưng không tự vào hồ sơ khiếu nại của kiện.",
    other: "Video phiên này vẫn được giữ và tự vào hồ sơ khiếu nại nếu kiện có hồ sơ sau này.",
    reasonRequired: "Chọn lý do hủy.",
    noteRule: "Nhập ghi chú (5–500 ký tự).",
    confirm: "Hủy phiên",
    back: "Quay lại",
  },
  // item 03 (01 §10.5 D13, FR-04.14): tóm tắt phiên hoàn trên thẻ "Gọi quản lý".
  summaryLabel: "Phiên hoàn",
  summary: (conclusion: string | null, photos: number, minutes: number) =>
    `${conclusion ? `Đã có kết luận: ${conclusion}` : "Chưa có kết luận"} · ${photos} ảnh · mở ${minutes} phút`,
};

export const ACTION_LABEL: Record<ApprovalAction, string> = {
  CONTINUE: "Cho tiếp tục",
  CLOSE_WITH_NOTE: "Đóng phiên có ghi chú",
  CANCEL_SESSION: "Hủy phiên",
  APPROVE_REPACK: "Duyệt đóng gói lại",
  REJECT: "Từ chối",
};

export const ACTION_DONE: Record<ApprovalAction, string> = {
  CONTINUE: "Đã cho station tiếp tục.",
  CLOSE_WITH_NOTE: "Đã đóng phiên có ghi chú.",
  CANCEL_SESSION: "Đã hủy phiên.",
  APPROVE_REPACK: "Đã duyệt đóng gói lại.",
  REJECT: "Đã từ chối yêu cầu đóng gói lại.",
};
