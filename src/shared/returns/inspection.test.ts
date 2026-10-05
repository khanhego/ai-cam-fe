/** BR-22 dùng chung station R2 + dashboard D4 (DEC-236) — 02b-station §13 "inspection.canBeOk (BR-22, 8 trường hợp)". */
import {
  canBeOk,
  CONCLUSION_BUTTON,
  CONCLUSION_LABEL,
  CONCLUSIONS,
  conclusionError,
  conclusionTone,
  isLineIssue,
  RETURN_KIND,
} from "./inspection";

const line = (requested: number, received: number, condition: "OK" | "DAMAGED" | null = "OK") => ({
  quantity_requested: requested,
  quantity_received: received,
  condition,
});

test.each([
  ["mọi dòng đủ số, Nguyên vẹn", [line(2, 2), line(1, 1)], true],
  ["không có dòng (chưa xác định / đơn không sản phẩm)", [], true],
  ["dòng không trả (yêu cầu 0) nhận 0", [line(2, 2), line(0, 0)], true],
  ["TC-04.15: nhận ít hơn yêu cầu (2 → 1)", [line(2, 1)], false],
  ["nhận nhiều hơn yêu cầu (khách gửi thừa)", [line(0, 1)], false],
  ["một dòng Hư hỏng", [line(2, 2), line(1, 1, "DAMAGED")], false],
  ["tình trạng chưa kiểm (null) + đủ số", [line(1, 1, null)], true],
  ["nhận 0 tất cả (hộp rỗng)", [line(2, 0), line(1, 0)], false],
])("BR-22 FULL — %s → %s", (_name, lines, expected) => {
  expect(canBeOk(lines, "FULL")).toBe(expected);
});

test("BR-22 REFERENCE (giao thất bại đơn nhiều kiện, 02 §6.3 #8): không kiểm dòng — luôn chọn Nguyên vẹn được", () => {
  expect(canBeOk([line(2, 0, "DAMAGED")], "REFERENCE")).toBe(true);
  expect(isLineIssue(line(2, 0, "DAMAGED"))).toBe(true);
});

test("conclusionError: chưa chọn / Khác thiếu ghi chú / Nguyên vẹn mâu thuẫn / hợp lệ", () => {
  expect(conclusionError(null, "", [])).toBe("REQUIRED");
  expect(conclusionError("OTHER", "  ", [])).toBe("NOTE_REQUIRED");
  expect(conclusionError("OTHER", "Thùng ướt", [])).toBeNull();
  expect(conclusionError("OK", "", [line(2, 1)])).toBe("INCONSISTENT");
  expect(conclusionError("OK", "", [line(2, 1)], "REFERENCE")).toBeNull();
  expect(conclusionError("MISSING_ITEM", "", [line(2, 1)])).toBeNull();
});

test("nhãn tiếng Việt đủ 6 kết luận theo thứ tự R2; không hiện mã kỹ thuật", () => {
  expect(CONCLUSIONS.map((c) => CONCLUSION_BUTTON[c])).toEqual([
    "Nguyên vẹn",
    "Hư hỏng",
    "Thiếu hàng",
    "Sai hàng",
    "Hộp rỗng",
    "Khác",
  ]);
  expect(CONCLUSION_LABEL.WRONG_ITEM).toBe("Sai hàng / bị tráo");
  expect(RETURN_KIND.BUYER_RETURN[0]).toBe("Khách trả hàng");
  expect(RETURN_KIND.UNIDENTIFIED[0]).toBe("Chưa xác định");
  expect(conclusionTone("OK")).toBe("success");
  expect(conclusionTone("EMPTY_BOX")).toBe("warning");
  expect(conclusionTone(null)).toBe("neutral");
});
