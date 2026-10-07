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

  claims: {
    cards: {
      created: "Hồ sơ tạo trong kỳ",
      winRate: "Tỷ lệ thắng",
      recovered: "Giá trị thu hồi",
      beforeDeadline: "Gửi trước hạn",
      overdue: "Quá hạn chưa gửi",
    },
    detail: {
      winRate: (n: number, d: number) => `${fmtNumber(n)} / ${fmtNumber(d)} có kết quả`,
      beforeDeadline: (n: number, d: number) => `${fmtNumber(n)} / ${fmtNumber(d)} đã gửi`,
      now: "Hiện tại",
    },
    emptyRate: {
      winRate: "Chưa có hồ sơ có kết quả trong kỳ",
      beforeDeadline: "Chưa có hồ sơ đã gửi trong kỳ",
    },
    formula: {
      created: "Hồ sơ tạo trong kỳ = hồ sơ khiếu nại có giờ tạo trong kỳ (trừ hồ sơ giữ từ dữ liệu cũ).",
      winRate: "Tỷ lệ thắng = Thắng ÷ (Thắng + Thua), theo giờ có kết quả trong kỳ.",
      recovered: "Giá trị thu hồi = tổng số tiền thu hồi của hồ sơ Thắng, theo giờ có kết quả trong kỳ.",
      beforeDeadline: 'Gửi trước hạn = hồ sơ chuyển "Đã gửi" trước hạn ÷ hồ sơ đã gửi trong kỳ.',
      overdue: "Quá hạn chưa gửi = hồ sơ đã quá hạn mà chưa gửi ở thời điểm hiện tại (không theo kỳ).",
    },
    sections: {
      byStatus: "Theo trạng thái",
      byType: "Theo loại × kết quả",
      byCounterparty: "Theo bên nhận",
      byShop: "Theo sàn / shop",
    },
    col: {
      status: "Trạng thái",
      count: "Số hồ sơ",
      type: "Loại",
      won: "Thắng",
      lost: "Thua",
      pending: "Đang chờ",
      counterparty: "Bên nhận",
      recovered: "Thu hồi",
      shop: "Sàn · Shop",
    },
  },

  productivity: {
    cards: {
      packed: "Kiện đã đóng gói",
      packAvg: "TB / kiện",
      inspected: "Kiện hoàn đã kiểm",
      returnAvg: "TB / kiện hoàn",
    },
    formula: {
      packed:
        "Kiện đã đóng gói = phiên đóng gói hoàn tất có giờ đóng trong kỳ (đóng gói lại vẫn tính, đếm riêng ở cột Đóng gói lại).",
      packAvg:
        "TB / kiện = trung bình (giờ đóng − giờ mở − thời gian chờ duyệt) của phiên đóng gói hoàn tất trong kỳ.",
      inspected: "Kiện hoàn đã kiểm = phiên mở hoàn hoàn tất trong kỳ.",
      returnAvg:
        "TB / kiện hoàn = trung bình (giờ đóng − giờ mở − thời gian chờ duyệt) của phiên mở hoàn hoàn tất trong kỳ.",
    },
    sections: {
      byStation: "Theo station",
      byOperator: "Theo người đứng bàn",
      returnByOperator: "Bàn hoàn theo người kiểm",
    },
    col: {
      station: "Station",
      operator: "Người đứng bàn",
      inspector: "Người kiểm",
      packed: "Số kiện",
      avg: "TB",
      mismatch: "Lệch mã",
      abandoned: "Bỏ dở",
      cancelled: "Hủy",
      repacked: "Đóng gói lại",
      inspected: "Số kiện",
      issue: "Có vấn đề",
    },
  },

  chart: {
    returns: "Hồ sơ hàng hoàn theo thời gian",
    claims: "Hồ sơ khiếu nại theo thời gian",
    granularity: { day: "theo ngày", week: "theo tuần", month: "theo tháng" },
    bar: (bucket: string, value: number) => `${bucket}: ${fmtNumber(value)}`,
    total: (n: number) => `Tổng ${fmtNumber(n)}`,
  },
} as const;
