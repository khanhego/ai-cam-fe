/** Chữ khung dashboard (01 §10.3 drawer, 01 §10.5). */
export const COPY = {
  badge: {
    approvals: (n: number) => `${n} yêu cầu đang chờ`,
    recon: (n: number) => `${n} cảnh báo mức Cao đang mở`,
    claims: (n: number) => `${n} hồ sơ sắp hết hạn`,
  },
  nav: {
    returns: "Hàng hoàn",
    recon: "Lệch trạng thái",
    claims: "Hồ sơ khiếu nại",
    // item 03 (01 §10.3 drawer, 02b-admin §2)
    reports: "Báo cáo",
    shares: "Link chia sẻ",
    platforms: "Kết nối sàn",
    notifications: "Thông báo",
    backup: "Sao lưu",
  },
};
