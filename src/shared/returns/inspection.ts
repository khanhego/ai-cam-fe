import type { ChipTone } from "@/shared/ui";

import type { Conclusion, InspectionLine, LinesMode, ReturnCaseStatus, ReturnKind } from "./types";

/**
 * Luật kết luận phiên hoàn + nhãn dùng chung station (R2) và dashboard (D4 sửa kết luận) — DEC-236.
 * Server vẫn kiểm lại (API-102 / API-113 `CONCLUSION_INCONSISTENT`); client chặn trước để không gửi nhầm.
 */

/** Thứ tự 6 nút kết luận trên R2 (01 §10.4). */
export const CONCLUSIONS: readonly Conclusion[] = [
  "OK",
  "DAMAGED",
  "MISSING_ITEM",
  "WRONG_ITEM",
  "EMPTY_BOX",
  "OTHER",
] as const;

/** Nhãn kết luận (02 §5.2, 01 §10.4 R2 — nút "Sai hàng" là bản ngắn của "Sai hàng / bị tráo"). */
export const CONCLUSION_LABEL: Record<Conclusion, string> = {
  OK: "Nguyên vẹn",
  DAMAGED: "Hư hỏng",
  MISSING_ITEM: "Thiếu hàng",
  WRONG_ITEM: "Sai hàng / bị tráo",
  EMPTY_BOX: "Hộp rỗng",
  OTHER: "Khác",
};

/** Chữ trên nút `SegmentedButtons` ở R2 (01 §10.4: [Nguyên vẹn] [Hư hỏng] [Thiếu hàng] [Sai hàng] [Hộp rỗng] [Khác]). */
export const CONCLUSION_BUTTON: Record<Conclusion, string> = { ...CONCLUSION_LABEL, WRONG_ITEM: "Sai hàng" };

export const conclusionTone = (c: Conclusion | null | undefined): ChipTone =>
  !c ? "neutral" : c === "OK" ? "success" : "warning";

/** Tình trạng một dòng (cùng tập giá trị với kết luận). */
export const CONDITION_LABEL: Record<Conclusion, string> = CONCLUSION_LABEL;

/** Loại hoàn (02 §5.2, chip ở R2 / D14). */
export const RETURN_KIND: Record<ReturnKind, [string, ChipTone]> = {
  FAILED_DELIVERY: ["Giao thất bại", "info"],
  BUYER_RETURN: ["Khách trả hàng", "primary"],
  REFUND_ONLY: ["Chỉ hoàn tiền", "neutral"],
  UNANNOUNCED: ["Về trước khi sàn báo", "warning"],
  UNIDENTIFIED: ["Chưa xác định", "error"],
};

/** Trạng thái hồ sơ hàng hoàn (02 §5.2). */
export const RETURN_CASE_STATUS: Record<ReturnCaseStatus, [string, ChipTone]> = {
  EXPECTED: ["Đang về", "info"],
  INSPECTING: ["Đang kiểm", "primary"],
  PARTIALLY_RECEIVED: ["Đã nhận một phần", "warning"],
  RECEIVED_OK: ["Đã nhận – nguyên vẹn", "success"],
  RECEIVED_ISSUE: ["Đã nhận – có vấn đề", "warning"],
  MISSING: ["Quá hạn chưa về", "error"],
  CANCELLED: ["Đã hủy", "neutral"],
  NO_PARCEL: ["Không có kiện về", "neutral"],
};

type LineForRule = Pick<InspectionLine, "quantity_received" | "quantity_requested" | "condition">;

/** Dòng "có vấn đề" theo BR-22: tình trạng khác Nguyên vẹn, hoặc số nhận ≠ số yêu cầu trả. */
export const isLineIssue = (line: LineForRule) =>
  (line.condition !== null && line.condition !== "OK") || line.quantity_received !== line.quantity_requested;

/**
 * BR-22: "Nguyên vẹn" chỉ chọn được khi mọi dòng Nguyên vẹn và đủ số yêu cầu trả. `REFERENCE` (giao thất bại đơn
 * nhiều kiện) không kiểm dòng — luôn chọn được (02 §6.3 #8).
 */
export function canBeOk(lines: readonly LineForRule[], mode: LinesMode = "FULL"): boolean {
  if (mode === "REFERENCE") return true;
  return !lines.some(isLineIssue);
}

/** Kết luận có thể gửi chưa: chưa chọn → không; `OTHER` cần ghi chú; `OK` phải hợp BR-22. */
export function conclusionError(
  conclusion: Conclusion | null,
  note: string,
  lines: readonly LineForRule[],
  mode: LinesMode = "FULL",
): "REQUIRED" | "NOTE_REQUIRED" | "INCONSISTENT" | null {
  if (!conclusion) return "REQUIRED";
  if (conclusion === "OTHER" && !note.trim()) return "NOTE_REQUIRED";
  if (conclusion === "OK" && !canBeOk(lines, mode)) return "INCONSISTENT";
  return null;
}

/** Giới hạn của contract (02 §6.2 API-102). */
export const INSPECTION_LIMITS = { noteMax: 500, quantityMin: 0, quantityMax: 999 } as const;
