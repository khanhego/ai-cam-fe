/** Chữ hồ sơ khiếu nại (D4 Tạo hồ sơ, D16, D17, gói bằng chứng) — nguyên văn 01 §10.5 khi có (02b-admin §9). */
export const COPY = {
  create: {
    title: "Tạo hồ sơ khiếu nại",
    open: "Tạo hồ sơ khiếu nại",
    code: "Mã vận đơn hoặc mã đơn",
    codeHint: "Quét hoặc nhập mã của kiện cần khiếu nại",
    find: "Tìm",
    notFound: "Không tìm thấy kiện.",
    pickPackage: "Chọn kiện",
    type: "Loại",
    counterparty: "Bên nhận",
    note: "Ghi chú",
    noteHint: "Tối đa 1000 ký tự",
    noteMax: "Tối đa 1000 ký tự.",
    submit: "Tạo hồ sơ",
    created: (code: string) => `Đã tạo hồ sơ ${code}.`,
    /** BR-27 (01 §10.5 D4): "Kiện này đã có hồ sơ Hộp rỗng đang mở: KN-000124." */
    exists: (type: string, code: string) => `Kiện này đã có hồ sơ ${type} đang mở: ${code}.`,
    openExisting: "Mở hồ sơ",
    needPackage: "Chọn kiện trước khi tạo hồ sơ.",
  },
  generic: "Có lỗi hệ thống. Thử lại sau ít phút.",
};
