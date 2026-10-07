import { fmtNumber } from "@/shared/format";

/** Chữ D20 Báo cáo — nguyên văn 01 §10.5 D20 (DEC-17); công thức ⓘ theo BR-41 (02b-admin §9). */
export const REPORT_COPY = {
  title: "Báo cáo",
  tabsLabel: "Loại báo cáo",
  tab: { returns: "Hàng hoàn", claims: "Khiếu nại", productivity: "Năng suất" },
  filters: {
    label: "Bộ lọc báo cáo",
    period: "Kỳ",
    presets: { "7": "7 ngày", "30": "30 ngày", "90": "90 ngày" },
    from: "Từ ngày",
    to: "Đến ngày",
    apply: "Xem",
    station: "Station",
    allStations: "Tất cả station",
  },
  validate: {
    fromRequired: "Chọn ngày từ.",
    toRequired: "Chọn ngày đến.",
    range: "Ngày đến phải sau ngày từ.",
    max: "Chọn tối đa 366 ngày.",
    future: "Không chọn ngày trong tương lai.",
  },
  loading: "Đang tải báo cáo",
  refreshing: "Đang cập nhật báo cáo",
  error: "Không tải được báo cáo.",
  invalid: "Kỳ báo cáo chưa hợp lệ — sửa ngày rồi bấm Xem.",
  retry: "Thử lại",
  emptyTable: "Không có dữ liệu trong kỳ này.",
  forbiddenProductivity: "Bạn không có quyền xem báo cáo năng suất.",
  generatedAt: (period: string, at: string) => `Kỳ ${period} · số liệu lúc ${at}`,
  formulaButton: (label: string) => `Công thức: ${label}`,
  viewList: "Xem danh sách",
  csv: {
    button: "Xuất CSV",
    done: "Đã tải file CSV.",
    error: "Không tải được file CSV.",
  },
  noName: "(Không ghi tên)",
  noReason: "(Không có lý do)",

  returns: {
    cards: {
      returnRate: "Tỷ lệ hoàn",
      issueRate: "Có vấn đề",
      refundOnly: "Chỉ hoàn tiền",
      expected: "Đang về",
    },
    detail: {
      returnRate: (n: number, d: number) => `${fmtNumber(n)} / ${fmtNumber(d)} kiện`,
      issueRate: (n: number, d: number) => `${fmtNumber(n)} / ${fmtNumber(d)} đã nhận`,
      refundOnly: (pct: string) => `${pct} số kiện`,
      expected: "Hiện tại",
    },
    emptyRate: {
      returnRate: "Chưa có kiện bàn giao trong kỳ",
      issueRate: "Chưa có hồ sơ đã nhận trong kỳ",
      refundOnly: "Chưa có kiện bàn giao trong kỳ",
    },
    formula: {
      returnRate:
        'Tỷ lệ hoàn = hồ sơ hàng hoàn có kiện về (Khách trả hàng + Giao thất bại + Về trước khi sàn báo) tạo trong kỳ ÷ kiện chuyển "Đã bàn giao" trong kỳ. Chỉ hoàn tiền tính riêng.',
      issueRate: 'Tỷ lệ có vấn đề = hồ sơ "Đã nhận – có vấn đề" ÷ hồ sơ đã nhận, theo giờ nhận trong kỳ.',
      refundOnly:
        'Chỉ hoàn tiền = hồ sơ Chỉ hoàn tiền tạo trong kỳ; % tính trên số kiện chuyển "Đã bàn giao" trong kỳ.',
      expected: "Đang về = hồ sơ hàng hoàn đang chờ kiện về ở thời điểm hiện tại (không theo kỳ).",
    },
    sections: {
      byKind: "Theo loại",
      reason: "Lý do khách × kết luận kho",
      top: "Top sản phẩm bị trả",
      byShop: "Theo sàn / shop",
    },
    col: {
      kind: "Loại hồ sơ",
      count: "Số hồ sơ",
      share: "Tỷ trọng",
      reason: "Lý do khách",
      total: "Tổng",
      product: "Sản phẩm",
      variation: "Phân loại",
      shipped: "Đã gửi",
      requests: "Yêu cầu trả",
      rate: "Tỷ lệ",
      issue: "Có vấn đề",
      shop: "Sàn · Shop",
      handedOver: "Kiện bàn giao",
      cases: "Hồ sơ hàng hoàn",
    },
  },
} as const;
