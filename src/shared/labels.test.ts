import {
  AUDIT_ACTION,
  BACKUP_STATE,
  isPlatform,
  notifyMessageStatus,
  PLATFORM_LABEL,
  PLATFORM_SHORT,
  PLATFORM_STATUS_GROUP,
  RETURN_CANCEL_REASON,
  SHARE_STATUS,
} from "./labels";

/** Nhãn enum item 03 theo 02 §5.2 / 02b-admin §9 (T-251). */
test("sàn: tên đầy đủ / ngắn, kiểm giá trị", () => {
  expect(PLATFORM_LABEL).toEqual({ SHOPEE: "Shopee", TIKTOK: "TikTok Shop" });
  expect(PLATFORM_SHORT.TIKTOK).toBe("TikTok");
  expect(isPlatform("TIKTOK")).toBe(true);
  expect(isPlatform("LAZADA")).toBe(false);
  expect(isPlatform(null)).toBe(false);
});

test("nhóm trạng thái, link, sao lưu, lý do hủy phiên hoàn", () => {
  expect(PLATFORM_STATUS_GROUP.CANCEL_REQUESTED[0]).toBe("Đang yêu cầu hủy");
  expect(SHARE_STATUS.ACTIVE[0]).toBe("Đang hoạt động");
  expect(BACKUP_STATE.RESTORE_PENDING[0]).toBe("Chờ kiểm khôi phục");
  expect(RETURN_CANCEL_REASON.WRONG_SCAN).toBe("Hủy: quét nhầm");
});

test("trạng thái tin: 'Lỗi · thử lại {n}'", () => {
  expect(notifyMessageStatus("RETRYING", 2)).toBe("Lỗi · thử lại 2");
  expect(notifyMessageStatus("RETRYING")).toBe("Lỗi · thử lại");
  expect(notifyMessageStatus("SKIPPED")).toBe("Trùng, bỏ qua");
});

test("nhật ký: action mới có nhãn tiếng Việt", () => {
  for (const a of [
    "SHOP_DISCONNECT",
    "SHARE_CREATE",
    "BACKUP_ISSUE_RESOLVE",
    "SESSION_WRONG_SCAN_MARK",
    "MEDIA_MARK_MISSING",
  ])
    expect(AUDIT_ACTION[a]).toBeTruthy();
  expect(AUDIT_ACTION.SHOP_CONNECT).toBe("Kết nối shop");
});
