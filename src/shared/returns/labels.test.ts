/** Nhãn + hạn hồ sơ phía dashboard (02b-admin §13 Unit: labels, tính hạn "còn / quá"). */
import { RECON_RULES } from "@/lib/api/recon";

import { CLAIM_SOURCE, CLAIM_STATUS, deadlineText, fmtVnd, reconRuleLabel, RETURN_TAB } from "./labels";

const H = 3_600_000;
const NOW = Date.parse("2026-10-05T03:00:00Z");

test("tên quy tắc D15 theo 01 §10.5, chèn ngưỡng cấu hình N / X từ API-80", () => {
  expect(RECON_RULES.map((r) => reconRuleLabel(r))).toEqual([
    "Giao đi không có clip đóng gói",
    "Đơn hủy sau khi đóng — cần tháo kiện",
    "Hàng hoàn quá 7 ngày chưa về",
    "Nhận hoàn khi sàn chưa báo",
    "Đóng xong 24 giờ chưa bàn giao",
    "Sàn báo đã hoàn, kho chưa nhận",
    "Kiện chưa xác minh với sàn quá 24 giờ",
  ]);
  expect(reconRuleLabel("RETURN_OVERDUE", { return_missing_days: 10 })).toBe("Hàng hoàn quá 10 ngày chưa về");
  expect(reconRuleLabel("PACKED_NOT_HANDED_OVER", { handover_warn_hours: 12 })).toBe(
    "Đóng xong 12 giờ chưa bàn giao",
  );
});

test.each([
  [3 * 24 * H, "còn 3 ngày", false, false],
  [47 * H, "còn 1 ngày", true, false],
  [20 * H, "còn 20 giờ", true, false],
  [30 * 60_000, "còn 1 giờ", true, false],
  [-5 * H, "Quá hạn 5 giờ", true, true],
  [-2 * 24 * H, "Quá hạn 2 ngày", true, true],
])("deadlineText %d ms → %s", (delta, text, urgent, overdue) => {
  expect(deadlineText(new Date(NOW + delta).toISOString(), NOW)).toEqual({ text, urgent, overdue });
});

test("deadlineText null khi không có hạn; tiền VND; nhãn tab / trạng thái / nguồn", () => {
  expect(deadlineText(null, NOW)).toBeNull();
  expect(fmtVnd(150000)).toMatch(/^150\.000 đ$/);
  expect(fmtVnd(null)).toBe("—");
  expect(Object.values(RETURN_TAB)).toEqual([
    "Đang về",
    "Quá hạn",
    "Đã nhận",
    "Chỉ hoàn tiền",
    "Chưa xác định",
    "Tất cả",
  ]);
  expect(CLAIM_STATUS.WAITING[0]).toBe("Đang chờ");
  expect(CLAIM_SOURCE.LEGACY_HOLD).toBe("Chuyển từ cờ giữ");
});
