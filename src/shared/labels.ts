import type { ChipTone } from "@/shared/ui";

/**
 * Nhãn tiếng Việt cho enum API (02 §5 "Enum dùng chung", DEC-17) và tone chip theo design system
 * ("Trạng thái kiện" — README §Mẫu màn hình dashboard). Không hiện mã kỹ thuật lên giao diện.
 */
/** Sàn (02 §5.2 `platform`, item 03). */
export type Platform = "SHOPEE" | "TIKTOK";
export const PLATFORMS: readonly Platform[] = ["SHOPEE", "TIKTOK"] as const;

/** Tên đầy đủ (bộ lọc, aria-label, D7): "Shopee" / "TikTok Shop" (02b-admin §9). */
export const PLATFORM_LABEL: Record<Platform, string> = { SHOPEE: "Shopee", TIKTOK: "TikTok Shop" };
/** Tên ngắn trong chip "TikTok · Áo Đẹp Official" (01 §10.5 chung, 02b-station §3). */
export const PLATFORM_SHORT: Record<Platform, string> = { SHOPEE: "Shopee", TIKTOK: "TikTok" };
/** Kiện / đơn chưa gắn sàn (`platform = null`, `order = null`). */
export const PLATFORM_UNKNOWN = "Chưa rõ sàn";

export const isPlatform = (v: unknown): v is Platform => v === "SHOPEE" || v === "TIKTOK";

/** Nhóm trạng thái đơn theo sàn (02 §5.2, BR-30, ADR-011) — lõi và FE chỉ đọc nhóm, không đọc chữ sàn. */
export type PlatformStatusGroup =
  | "UNPAID"
  | "AWAITING_SHIPMENT"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "RETURNING"
  | "UNKNOWN";
export const PLATFORM_STATUS_GROUP: Record<PlatformStatusGroup, [string, ChipTone]> = {
  UNPAID: ["Chờ thanh toán", "neutral"],
  AWAITING_SHIPMENT: ["Chờ giao", "primary"],
  SHIPPED: ["Đã giao ĐVVC", "info"],
  DELIVERED: ["Đã giao", "success"],
  CANCEL_REQUESTED: ["Đang yêu cầu hủy", "warning"],
  CANCELLED: ["Đã hủy", "neutral"],
  RETURNING: ["Hoàn về người bán", "warning"],
  UNKNOWN: ["Không rõ", "neutral"],
};

/** Nhóm trạng thái yêu cầu trả (02 §5.2 `return_case.platform_status_group`, BR-31). */
export type ReturnStatusGroup = "REQUESTED" | "ACCEPTED" | "CANCELLED" | "DONE" | "CLOSED";
export const RETURN_STATUS_GROUP: Record<ReturnStatusGroup, [string, ChipTone]> = {
  REQUESTED: ["Chờ người bán duyệt", "warning"],
  ACCEPTED: ["Đã chấp nhận", "info"],
  CANCELLED: ["Đã hủy", "neutral"],
  DONE: ["Đã hoàn tiền", "success"],
  CLOSED: ["Đã đóng", "neutral"],
};

export type WarehouseStatus =
  | "NEW"
  | "PACKING"
  | "PACKED"
  | "HANDED_OVER"
  | "DELIVERED"
  | "CANCELLED"
  | "CANCELLED_AFTER_PACK"
  // item 02 (02 §5.2 `warehouse_status` thêm)
  | "RETURN_EXPECTED"
  | "RETURN_INSPECTING"
  | "RETURN_RECEIVED_OK"
  | "RETURN_RECEIVED_ISSUE"
  | "RETURN_MISSING";

export const WAREHOUSE_STATUS: Record<WarehouseStatus, [string, ChipTone]> = {
  NEW: ["Mới", "neutral"],
  PACKING: ["Đang đóng gói", "primary"],
  PACKED: ["Đã đóng gói", "success"],
  HANDED_OVER: ["Đã bàn giao", "info"],
  DELIVERED: ["Đã giao", "info"],
  CANCELLED: ["Đã hủy", "neutral"],
  CANCELLED_AFTER_PACK: ["Hủy sau khi đóng", "warning"],
  RETURN_EXPECTED: ["Hoàn đang về", "info"],
  RETURN_INSPECTING: ["Đang kiểm hoàn", "primary"],
  RETURN_RECEIVED_OK: ["Đã nhận hoàn – nguyên vẹn", "success"],
  RETURN_RECEIVED_ISSUE: ["Đã nhận hoàn – có vấn đề", "warning"],
  RETURN_MISSING: ["Hoàn quá hạn", "error"],
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
  // item 02 (02 §5.2)
  AUTO_CLOSED: "Tự đóng",
  ORDER_CANCELLED: "Đơn bị hủy khi đang đóng",
  NO_PACK_CLIP: "Không có clip đóng gói",
  UNANNOUNCED: "Về trước khi sàn báo",
  UNIDENTIFIED: "Chưa xác định đơn",
  INSPECTION_CORRECTED: "Đã sửa kết luận",
  // item 03 (02 §5.2)
  AMBIGUOUS_SHOP: "Mã có ở nhiều shop",
  ORDER_CANCEL_REQUESTED: "Người mua đang xin hủy",
};

export const CANCEL_REASON: Record<string, string> = {
  OUT_OF_STOCK: "Hết hàng",
  WRONG_SCAN: "Quét nhầm",
  OTHER: "Khác",
  SUPERVISOR: "Quản lý hủy",
  NOT_A_RETURN: "Không phải hàng hoàn",
};

/**
 * item 03 (02 §5.2, BR-39): nhãn chip lý do hủy của phiên RETURN `CANCELLED` (D4 / D17) — khác `CANCEL_REASON` (dòng
 * "Lý do" chung).
 */
export const RETURN_CANCEL_REASON: Record<string, string> = {
  WRONG_SCAN: "Hủy: quét nhầm",
  NOT_A_RETURN: "Hủy: không phải hàng hoàn",
  SUPERVISOR: "Quản lý hủy",
  OTHER: "Hủy: lý do khác",
};

/** `session.cancel_cause` (v0.3) khi `cancel_reason = SUPERVISOR`; null + `review_needed` → chip "Cần soát". */
export type CancelCause = "WRONG_SCAN" | "NOT_A_RETURN" | "OTHER";
export const CANCEL_CAUSE: Record<CancelCause, string> = {
  WRONG_SCAN: "Quản lý hủy: quét nhầm",
  NOT_A_RETURN: "Quản lý hủy: không phải hàng hoàn",
  OTHER: "Quản lý hủy: lý do khác",
};
export const REVIEW_NEEDED_LABEL = "Cần soát: quản lý hủy, chưa rõ lý do";

/** `session.evidence_exclusion` (v0.3, chỉ đọc). `STATION_CANCEL` / `SUPERVISOR_CANCEL` → nhãn theo lý do hiệu lực. */
export type EvidenceExclusion = "STATION_CANCEL" | "SUPERVISOR_CANCEL" | "MARKED";
export const EVIDENCE_EXCLUSION_MARKED = "Đã đánh dấu quét nhầm";

/** `session.wrong_scan.code` (API-189 `reason_code` khi đánh dấu). */
export type WrongScanCode = "WRONG_SCAN" | "NOT_A_RETURN";
export const WRONG_SCAN_CODE: Record<WrongScanCode, string> = {
  WRONG_SCAN: "Quét nhầm kiện khác",
  NOT_A_RETURN: "Không phải kiện hàng hoàn",
};

/** `claim.deadline_source` thêm (BR-42). */
export const DEADLINE_PLATFORM_PASSED = "Hạn sàn đã qua — dùng mặc định";

/** `clip.status` / `snapshot.status` = `MISSING` (v0.4: bỏ "(khôi phục)"). */
export const MEDIA_MISSING_LABEL = "Thiếu tệp";

/** Link chia sẻ (02 §5.2 `share.status`, `share.layout`). */
export type ShareStatus = "CREATING" | "ACTIVE" | "FAILED" | "REVOKED" | "EXPIRED";
export const SHARE_STATUS: Record<ShareStatus, [string, ChipTone]> = {
  CREATING: ["Đang tạo", "primary"],
  ACTIVE: ["Đang hoạt động", "success"],
  FAILED: ["Lỗi", "error"],
  REVOKED: ["Đã thu hồi", "neutral"],
  EXPIRED: ["Hết hạn", "neutral"],
};
export type ShareLayout = "SIDE_BY_SIDE" | "CAM1";
export const SHARE_LAYOUT: Record<ShareLayout, string> = {
  SIDE_BY_SIDE: "Ghép Cam 1 + Cam 2",
  CAM1: "Chỉ Cam 1",
};

/** Sao lưu cloud (02 §5.2 `backup.state`, `backup_object.status`, vấn đề D23, `resolution.action`). */
export type BackupState =
  "ON" | "NOT_CONFIGURED" | "KEY_UNCONFIRMED" | "KEY_CHANGED" | "DISABLED" | "RESTORE_PENDING";
export const BACKUP_STATE: Record<BackupState, [string, ChipTone]> = {
  ON: ["Đang bật", "success"],
  NOT_CONFIGURED: ["Chưa cấu hình", "neutral"],
  KEY_UNCONFIRMED: ["Chưa xác nhận khóa", "warning"],
  KEY_CHANGED: ["Khóa đã đổi", "error"],
  DISABLED: ["Đã tắt", "neutral"],
  RESTORE_PENDING: ["Chờ kiểm khôi phục", "warning"],
};
export type BackupObjectStatus =
  | "PENDING"
  | "UPLOADING"
  | "UPLOADED"
  | "FAILED"
  | "HASH_MISMATCH"
  | "SOURCE_DELETED"
  | "IGNORED"
  | "CLOUD_DELETED";
export const BACKUP_OBJECT_STATUS: Record<BackupObjectStatus, [string, ChipTone]> = {
  PENDING: ["Đang chờ", "neutral"],
  UPLOADING: ["Đang tải", "primary"],
  UPLOADED: ["Đã sao lưu", "success"],
  FAILED: ["Lỗi", "error"],
  HASH_MISMATCH: ["Lệch mã băm", "error"],
  SOURCE_DELETED: ["Tệp đã xóa tại kho", "neutral"],
  IGNORED: ["Bỏ qua", "neutral"],
  CLOUD_DELETED: ["Đã xóa trên cloud", "neutral"],
};
/** `FAILED` + `last_error = SOURCE_MISSING` (DEC-517). */
export const BACKUP_SOURCE_MISSING_LABEL = "Không thấy tệp tại kho";
export type BackupIssueKind = "HASH_MISMATCH" | "SOURCE_MISSING" | "UPLOAD_FAILED";
export const BACKUP_ISSUE_KIND: Record<BackupIssueKind, string> = {
  HASH_MISMATCH: "Lệch mã băm",
  SOURCE_MISSING: "Không thấy tệp tại kho",
  UPLOAD_FAILED: "Tải lên lỗi",
};
export type BackupResolutionAction = "UPLOAD_ANYWAY" | "IGNORE" | "RETRY" | "ACCEPT_RESTORED";
export const BACKUP_RESOLUTION_ACTION: Record<BackupResolutionAction, string> = {
  UPLOAD_ANYWAY: "Vẫn sao lưu",
  IGNORE: "Bỏ qua",
  RETRY: "Thử lại ngay",
  ACCEPT_RESTORED: "Chấp nhận khi kiểm khôi phục",
};

/** Thông báo (02 §5.2 `notify_channel.type`, `notify_message.status`). Nhãn N01..N10 lấy từ API-170 (không chép cứng). */
export type NotifyChannelType = "TELEGRAM" | "ZALO_OA";
export const NOTIFY_CHANNEL_TYPE: Record<NotifyChannelType, string> = {
  TELEGRAM: "Telegram",
  ZALO_OA: "Zalo OA",
};
export type NotifyMessageStatus = "QUEUED" | "HELD" | "SENT" | "RETRYING" | "DROPPED" | "SKIPPED";
export const NOTIFY_MESSAGE_STATUS: Record<NotifyMessageStatus, [string, ChipTone]> = {
  QUEUED: ["Đang chờ", "neutral"],
  HELD: ["Tạm giữ", "warning"],
  SENT: ["Đã gửi", "success"],
  RETRYING: ["Lỗi · thử lại", "error"],
  DROPPED: ["Bị bỏ", "neutral"],
  SKIPPED: ["Trùng, bỏ qua", "neutral"],
};
/** "Lỗi · thử lại {n}" (02b-admin §9) — `n` = số lần đã thử. */
export const notifyMessageStatus = (status: NotifyMessageStatus, attempts = 0): string =>
  status === "RETRYING" && attempts > 0 ? `Lỗi · thử lại ${attempts}` : NOTIFY_MESSAGE_STATUS[status][0];

/** Trạng thái station trên D2 (01 §10.5: Rảnh / Đang đóng gói / Lệch mã / Chờ duyệt). */
export const STATION_STATE: Record<string, [string, ChipTone]> = {
  READY: ["Rảnh", "success"],
  PACKING: ["Đang đóng gói", "primary"],
  MISMATCH: ["Lệch mã", "error"],
  WAITING_APPROVAL: ["Chờ duyệt", "warning"],
  INSPECTING: ["Đang kiểm hoàn", "primary"],
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

/** Vai trò (01 §5.1, FR-10.01). */
export const ROLE_LABEL = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  CSKH: "CSKH",
  STATION: "Station",
} as const;

/** Hành động nhật ký (02 §6.2 API-92). Mã lạ → hiện nguyên mã. */
export const AUDIT_ACTION: Record<string, string> = {
  LOGIN: "Đăng nhập",
  VIEW_CLIP: "Xem clip",
  EXPORT_CLIP: "Xuất clip",
  DOWNLOAD_EXPORT: "Tải file xuất",
  HOLD_CLIP: "Giữ clip",
  UNHOLD_CLIP: "Bỏ giữ clip",
  DELETE_CLIP: "Xóa clip",
  REBUILD_CLIP: "Cắt lại clip",
  APPROVAL_DECISION: "Xử lý yêu cầu duyệt",
  IMPORT_COMMIT: "Nhập đơn từ file",
  SETTINGS_UPDATE: "Đổi cài đặt",
  STATION_UPDATE: "Sửa station",
  CAMERA_UPDATE: "Sửa camera",
  USER_UPDATE: "Sửa tài khoản",
  SESSIONS_REVOKED: "Thu hồi đăng nhập",
  SHOP_CONNECT: "Kết nối shop",
  ORDER_OVERWRITTEN_BY_API: "Shopee ghi đè đơn từ file",
  // item 02 (02 §6.2 API-92, §6.3 #19, §6.5 #1)
  STATION_WORK_MODE: "Đổi chế độ bàn",
  STATION_OPERATOR: "Đổi người kiểm",
  INSPECTION_CORRECT: "Sửa kết luận phiên hoàn",
  RETURN_LINK_ORDER: "Gắn đơn cho hàng hoàn",
  RECON_RESOLVE: "Xử lý cảnh báo lệch",
  WAREHOUSE_STATUS_ADJUST: "Điều chỉnh trạng thái kho",
  CLAIM_CREATE: "Tạo hồ sơ khiếu nại",
  CLAIM_UPDATE: "Sửa hồ sơ khiếu nại",
  CLAIM_EVIDENCE_UPDATE: "Sửa bằng chứng hồ sơ",
  EXPORT_CLAIM_PACK: "Xuất gói bằng chứng",
  DOWNLOAD_CLAIM_PACK: "Tải gói bằng chứng",
  VIEW_SNAPSHOT: "Xem ảnh",
  RETENTION_REDUCED: "Giảm thời gian lưu",
  CLIP_PROTECTION_MIGRATED: "Chuyển cờ giữ clip sang hồ sơ",
  RETENTION_RAISED_TO_MINIMUM: "Nâng thời gian lưu lên mức tối thiểu",
  RETURN_CASE_MERGED: "Gộp hồ sơ hàng hoàn",
  RETURN_FORCE_NEW: "Ghi hình kiện khác cùng mã",
  // item 03 (02 §6.2 API-92, 02b-admin §9)
  SHOP_DISCONNECT: "Ngắt kết nối shop",
  SHARE_CREATE: "Tạo link chia sẻ",
  SHARE_REVOKE: "Thu hồi link",
  SHARE_EXPIRE: "Link hết hạn",
  NOTIFY_CHANNEL_CREATE: "Thêm kênh thông báo",
  NOTIFY_CHANNEL_UPDATE: "Sửa kênh thông báo",
  NOTIFY_CHANNEL_DELETE: "Xóa kênh thông báo",
  NOTIFY_TEST: "Gửi thử thông báo",
  NOTIFY_SETTINGS_UPDATE: "Đổi giờ yên lặng",
  BACKUP_SETTINGS_UPDATE: "Đổi cài đặt sao lưu",
  BACKUP_KEY_CONFIRM: "Xác nhận cất khóa sao lưu",
  BACKUP_TEST: "Kiểm tra kết nối kho lưu",
  BACKUP_RUN_NOW: "Sao lưu DB ngay",
  REPORT_EXPORT: "Xuất CSV báo cáo",
  CLAIM_EVIDENCE_REMOVE: "Bỏ bằng chứng",
  BACKUP_REUPLOAD_OLD_KEY: "Tải lại bằng chứng bằng khóa mới",
  BACKUP_ISSUE_RESOLVE: "Xử lý tệp lệch mã băm",
  BACKUP_RESTORE_VERIFIED: "Kiểm khôi phục đạt",
  SESSION_WRONG_SCAN_MARK: "Đánh dấu phiên quét nhầm",
  SESSION_WRONG_SCAN_UNMARK: "Bỏ đánh dấu quét nhầm",
  SESSION_RETURN_CONFIRM: "Xác nhận phiên hoàn thật",
  MEDIA_MARK_MISSING: "Đánh dấu thiếu tệp",
  MEDIA_MISSING_RECOVERED: "Tệp có lại",
  PACKAGE_CANCEL_REVERT: "Trả lại kiện sau yêu cầu hủy không thành",
  BACKUP_VERIFY_ACCEPT: "Chấp nhận khi kiểm khôi phục",
};

/** Loại đối tượng nhật ký (`audit_log.object_type` do BE ghi). */
export const AUDIT_OBJECT: Record<string, string> = {
  USER: "Tài khoản",
  CLIP: "Clip",
  SESSION: "Phiên",
  EXPORT: "Bản xuất",
  STATION: "Station",
  CAMERA: "Camera",
  SETTING: "Cài đặt",
  SHOP: "Shop",
  ORDER: "Đơn",
  PACKAGE: "Kiện",
  CSV_IMPORT: "Lần nhập file",
  APPROVAL_REQUEST: "Yêu cầu duyệt",
  // item 02
  RETURN_CASE: "Hồ sơ hàng hoàn",
  CLAIM: "Hồ sơ khiếu nại",
  RECON_ALERT: "Cảnh báo lệch",
  SNAPSHOT: "Ảnh",
  EVIDENCE_PACK: "Gói bằng chứng",
  // item 03 (đối tượng mới của API-92 — tên BE dự kiến; mã lạ vẫn hiện nguyên mã)
  SHARE_LINK: "Link chia sẻ",
  NOTIFY_CHANNEL: "Kênh thông báo",
  BACKUP: "Sao lưu",
  BACKUP_OBJECT: "Tệp sao lưu",
  REPORT: "Báo cáo",
};
