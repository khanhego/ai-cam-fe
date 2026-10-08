import type { ClaimSource, ClaimStatus, ClaimType, Counterparty } from "@/lib/api/claims";
import type { ReconRule, ReconSeverity, ReconStatus } from "@/lib/api/recon";
import type { ReturnTab } from "@/lib/api/returns";
import { fmtNumber } from "@/shared/format";
import type { ChipTone } from "@/shared/ui";

export { CONCLUSION_LABEL, RETURN_CASE_STATUS, RETURN_KIND } from "./inspection";

/**
 * Nhãn tiếng Việt cho enum mới của item 02 phía dashboard (02 §5.2, 01 §10.5 — 02b-admin §9). Không hiện mã kỹ thuật.
 * Nhãn kết luận / loại hoàn / trạng thái hồ sơ hàng hoàn dùng chung station ở `inspection.ts` (DEC-236).
 */

/** Tab D14 (01 §10.5). */
export const RETURN_TAB: Record<ReturnTab, string> = {
  EXPECTED: "Đang về",
  MISSING: "Quá hạn",
  RECEIVED: "Đã nhận",
  NO_PARCEL: "Chỉ hoàn tiền",
  UNIDENTIFIED: "Chưa xác định",
  ALL: "Tất cả",
};

/** Ngưỡng cấu hình chèn vào tên quy tắc ("quá {N} ngày", "{X} giờ") — lấy từ API-80. */
/** item 03: `refund_only_default_hours` (API-80, BR-40) cho ⓘ hạn mặc định Chỉ hoàn tiền (D14). */
export type RuleThresholds = {
  return_missing_days?: number;
  handover_warn_hours?: number;
  refund_only_default_hours?: number;
};

/** Tên quy tắc đối soát trên UI (01 §10.5 D15). */
export function reconRuleLabel(rule: ReconRule, t: RuleThresholds = {}): string {
  const n = t.return_missing_days ?? 7;
  const x = t.handover_warn_hours ?? 24;
  const labels: Record<ReconRule, string> = {
    SHIPPED_NOT_PACKED: "Giao đi không có clip đóng gói",
    CANCELLED_AFTER_PACK: "Đơn hủy sau khi đóng — cần tháo kiện",
    RETURN_OVERDUE: `Hàng hoàn quá ${n} ngày chưa về`,
    RETURN_UNANNOUNCED: "Nhận hoàn khi sàn chưa báo",
    PACKED_NOT_HANDED_OVER: `Đóng xong ${x} giờ chưa bàn giao`,
    RETURN_DONE_NOT_RECEIVED: "Sàn báo đã hoàn, kho chưa nhận",
    UNVERIFIED_STALE: "Kiện chưa xác minh với sàn quá 24 giờ",
  };
  return labels[rule];
}

/** Mức (D15: "Cao", "TB", "Thấp" — chữ đầy đủ "Trung bình" cho trình đọc màn hình). */
export const RECON_SEVERITY: Record<ReconSeverity, [string, ChipTone]> = {
  HIGH: ["Cao", "error"],
  MEDIUM: ["Trung bình", "warning"],
  LOW: ["Thấp", "neutral"],
};

export const RECON_STATUS: Record<ReconStatus, [string, ChipTone]> = {
  OPEN: ["Đang mở", "warning"],
  RESOLVED: ["Đã xử lý", "success"],
  AUTO_RESOLVED: ["Tự hết", "neutral"],
};

export const CLAIM_TYPE: Record<ClaimType, string> = {
  DAMAGED: "Hư hỏng",
  MISSING_ITEM: "Thiếu hàng",
  WRONG_ITEM: "Sai hàng / bị tráo",
  EMPTY_BOX: "Hộp rỗng",
  OTHER: "Khác",
  BUYER_CLAIM: "Khách báo thiếu / sai",
  LOST_IN_TRANSIT: "Thất lạc",
};

export const CLAIM_STATUS: Record<ClaimStatus, [string, ChipTone]> = {
  NEW: ["Mới", "primary"],
  SUBMITTED: ["Đã gửi", "info"],
  WAITING: ["Đang chờ", "warning"],
  WON: ["Thắng", "success"],
  LOST: ["Thua", "error"],
  CLOSED: ["Đóng", "neutral"],
};

export const COUNTERPARTY: Record<Counterparty, string> = { PLATFORM: "Sàn", CARRIER: "Đơn vị vận chuyển" };

/** Nguồn hồ sơ (01 §10.5 D16: Tự động / Tay / Chuyển từ cờ giữ; thêm "Từ cảnh báo lệch"). */
export const CLAIM_SOURCE: Record<ClaimSource, string> = {
  AUTO_RETURN: "Tự động",
  MANUAL: "Tay",
  RECON: "Từ cảnh báo lệch",
  LEGACY_HOLD: "Chuyển từ cờ giữ",
};

/** Loại phiên (chip D4 / D3). */
export const SESSION_TYPE: Record<"PACK" | "RETURN", string> = { PACK: "Đóng gói", RETURN: "Mở hoàn" };

/** Loại station (D6). */
export const STATION_KIND: Record<"PACK" | "RETURN" | "BOTH", string> = {
  PACK: "Đóng gói",
  RETURN: "Nhận hoàn",
  BOTH: "Cả hai",
};

const HOUR = 3_600_000;

/**
 * Hạn hồ sơ (01 §10.5 D16 / D17): "còn 2 ngày" / "còn 5 giờ" / "Quá hạn 5 giờ" / "Quá hạn 2 ngày"; `urgent` khi còn
 * ≤ `dueSoonHours` (mặc định 48) hoặc đã quá hạn → tô đỏ.
 */
export function deadlineText(
  deadline: string | null | undefined,
  now: number = Date.now(),
  dueSoonHours = 48,
): { text: string; urgent: boolean; overdue: boolean } | null {
  if (!deadline) return null;
  const diff = Date.parse(deadline) - now;
  const abs = Math.abs(diff);
  const span =
    abs >= 24 * HOUR ? `${Math.floor(abs / (24 * HOUR))} ngày` : `${Math.max(1, Math.floor(abs / HOUR))} giờ`;
  if (diff < 0) return { text: `Quá hạn ${span}`, urgent: true, overdue: true };
  return { text: `còn ${span}`, urgent: diff <= dueSoonHours * HOUR, overdue: false };
}

/** Tiền VND (02b-admin §9): `Intl.NumberFormat('vi-VN')` + "đ". */
export const fmtVnd = (amount: number | null | undefined) =>
  amount == null ? "—" : `${fmtNumber(amount)} đ`;
