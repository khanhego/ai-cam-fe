/** Chữ đối soát (D15) + điều chỉnh trạng thái kho (D4 / D15) — nguyên văn 01 §10.5 khi có (02b-admin §9). */
export const COPY = {
  adjust: {
    open: "Điều chỉnh trạng thái",
    title: "Điều chỉnh trạng thái",
    current: "Trạng thái hiện tại",
    target: "Trạng thái đích",
    reason: "Lý do",
    reasonHint: "Bắt buộc, 5–500 ký tự",
    reasonRule: "Nhập lý do 5–500 ký tự.",
    targetRequired: "Chọn trạng thái đích.",
    submit: "Xác nhận",
    done: "Đã điều chỉnh trạng thái kho.",
    noTargets: "Không còn chuyển trạng thái nào được phép cho kiện này.",
  },
  generic: "Có lỗi hệ thống. Thử lại sau ít phút.",
};
