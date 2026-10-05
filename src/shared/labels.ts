import type { ChipTone } from "@/shared/ui";

/**
 * Nhãn tiếng Việt cho enum API (02 §5 "Enum dùng chung", DEC-17) và tone chip theo design system
 * ("Trạng thái kiện" — README §Mẫu màn hình dashboard). Không hiện mã kỹ thuật lên giao diện.
 */
export type WarehouseStatus =
  "NEW" | "PACKING" | "PACKED" | "HANDED_OVER" | "DELIVERED" | "CANCELLED" | "CANCELLED_AFTER_PACK";

export const WAREHOUSE_STATUS: Record<WarehouseStatus, [string, ChipTone]> = {
  NEW: ["Mới", "neutral"],
  PACKING: ["Đang đóng gói", "primary"],
  PACKED: ["Đã đóng gói", "success"],
  HANDED_OVER: ["Đã bàn giao", "info"],
  DELIVERED: ["Đã giao", "info"],
  CANCELLED: ["Đã hủy", "neutral"],
  CANCELLED_AFTER_PACK: ["Hủy sau khi đóng", "warning"],
};

export type SessionStatus =
  "OPEN" | "MISMATCH" | "WAITING_APPROVAL" | "COMPLETED" | "CANCELLED" | "ABANDONED" | "SUPERSEDED";

export const SESSION_STATUS: Record<SessionStatus, [string, ChipTone]> = {
  OPEN: ["Đang mở", "primary"],
  MISMATCH: ["Lệch mã", "error"],
  WAITING_APPROVAL: ["Chờ duyệt", "warning"],
  COMPLETED: ["Đã đóng gói", "success"],
  CANCELLED: ["Đã hủy", "neutral"],
  ABANDONED: ["Bỏ dở", "warning"],
  SUPERSEDED: ["Bị thay thế", "neutral"],
};

export const SESSION_FLAG: Record<string, string> = {
  UNVERIFIED: "Chưa xác minh với Shopee",
  CAM2_UNVERIFIED: "Cam 2 không xác minh",
  LABEL_ON_TRAY: "Phiếu còn trên khay",
  VIDEO_INCOMPLETE: "Thiếu video",
  REPACK: "Đóng gói lại",
  HAD_MISMATCH: "Từng lệch mã",
  CLOSED_BY_SUPERVISOR: "Quản lý đóng phiên",
};

export const CANCEL_REASON: Record<string, string> = {
  OUT_OF_STOCK: "Hết hàng",
  WRONG_SCAN: "Quét nhầm",
  OTHER: "Khác",
  SUPERVISOR: "Quản lý hủy",
};

/** Trạng thái station trên D2 (01 §10.5: Rảnh / Đang đóng gói / Lệch mã / Chờ duyệt). */
export const STATION_STATE: Record<string, [string, ChipTone]> = {
  READY: ["Rảnh", "success"],
  PACKING: ["Đang đóng gói", "primary"],
  MISMATCH: ["Lệch mã", "error"],
  WAITING_APPROVAL: ["Chờ duyệt", "warning"],
};

export const SOURCE: Record<string, string> = { API: "Shopee", CSV: "File" };

/** Trạng thái đơn Shopee (order_status của Open Platform). Giá trị lạ → "Khác" (không hiện mã). */
const PLATFORM_STATUS: Record<string, string> = {
  UNPAID: "Chờ thanh toán",
  READY_TO_SHIP: "Chờ lấy hàng",
  PROCESSED: "Đã xử lý",
  RETRY_SHIP: "Giao lại",
  SHIPPED: "Đang giao",
  TO_CONFIRM_RECEIVE: "Đã giao",
  IN_CANCEL: "Đang hủy",
  CANCELLED: "Đã hủy",
  TO_RETURN: "Trả hàng",
  COMPLETED: "Hoàn thành",
};
export const platformStatus = (s: string | null | undefined) => (s ? (PLATFORM_STATUS[s] ?? "Khác") : "—");

export const CAMERA_ROLE = { CAM1: "Cam 1", CAM2: "Cam 2" } as const;

/** Loại yêu cầu duyệt (02 §5 `approval_request.type`, 01 §10.5 D13). */
export const APPROVAL_TYPE: Record<"MISMATCH" | "ASSIST" | "REPACK", [string, ChipTone]> = {
  MISMATCH: ["Lệch mã", "error"],
  ASSIST: ["Gọi quản lý", "warning"],
  REPACK: ["Đóng gói lại", "info"],
};
