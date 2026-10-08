import type { ShareUnavailableReason } from "@/lib/api/shares";
import { fmtDate, fmtDuration, fmtShort } from "@/shared/format";
import { EVIDENCE_EXCLUSION_MARKED, type EvidenceExclusion } from "@/shared/labels";

/** Chữ ShareLinkDialog — nguyên văn 01 §10.5 "ShareLinkDialog" (DEC-17). */
export const COPY = {
  open: "Tạo link chia sẻ",
  openFor: (label: string) => `Tạo link chia sẻ ${label}`,
  title: "Tạo link chia sẻ bằng chứng",
  headerClaim: (claim: string, tracking: string) => `Hồ sơ ${claim} · Kiện ${tracking}`,
  headerSession: (tracking: string) => `Kiện ${tracking}`,
  sessions: (max: number) => `Phiên gửi kèm (tối đa ${max})`,
  pack: "Đóng gói",
  ret: "Mở hoàn",
  prior: "phiên trước",
  primary: "Phiên chính",
  review: "Cần soát",
  /** mới (G3-FE-5, BR-39) — phiên bị loại nhưng thêm tay vào bằng chứng; `reason` = nhãn lý do như chip D17. */
  excluded: (reason: string | null) =>
    reason ? `Bị loại khỏi bằng chứng — ${reason}` : "Bị loại khỏi bằng chứng",
  /**
   * G3V-3 (DEC-935) — lý do theo API-164 `evidence_exclusion` (không có lý do hủy chi tiết như D17). "Hủy tại trạm" **mới**
   * (chờ PO); hai nhãn còn lại như D17.
   */
  exclusion: {
    MARKED: EVIDENCE_EXCLUSION_MARKED,
    STATION_CANCEL: "Hủy tại trạm",
    SUPERVISOR_CANCEL: "Quản lý hủy",
  } satisfies Record<EvidenceExclusion, string>,
  unavailable: {
    CLIP_PENDING: () => "Chưa có clip",
    CLIP_FAILED: () => "Clip lỗi",
    CLIP_DELETED: (at: string | null) =>
      at ? `Clip đã bị xóa ngày ${fmtShort(at).slice(0, 5)}` : "Clip đã bị xóa",
    CLIP_MISSING: () => "Clip thiếu tệp",
  },
  /**
   * mới (G3-EV-4) — Cam 1 phiên chính không `READY` (API-132 / API-164 `primary_unavailable`); D17 + ShareLinkDialog.
   * `CLIP_MISSING` (hoặc không rõ lý do) → chữ chính; lý do khác → kèm nhãn lý do như hàng xám của dialog.
   */
  primaryUnavailable: (reason: ShareUnavailableReason | null | undefined, at: string | null = null) =>
    !reason || reason === "CLIP_MISSING"
      ? "Phiên chính thiếu tệp Cam 1 — khôi phục từ sao lưu hoặc chọn phiên khác."
      : `Phiên chính chưa dùng được Cam 1 (${COPY.unavailable[reason](at)}) — chọn phiên khác.`,
  /** mới (API-160 409 SESSION_EXCLUDED — dùng khi server không có `message`). */
  sessionExcluded: "Phiên này đã bị loại khỏi bằng chứng (quét nhầm / hủy) — không tạo link được.",
  /** mới (G3V-2) — D4: tooltip nút "Tạo link chia sẻ" khi phiên bị loại / Cần soát chưa xác nhận. */
  heldBack:
    "Phiên mở hoàn bị loại khỏi bằng chứng (quét nhầm / cần soát) — xác nhận ở hồ sơ khiếu nại trước khi gửi link.",
  /** mới (G3V-2) — D4: chữ ngắn cạnh nút bị khóa. */
  heldBackShort: "Bị loại / cần soát — chưa gửi link được",
  layout: "Góc quay",
  snapshots: (n: number) => `Kèm ảnh (${n})`,
  recipient: "Gửi cho *",
  recipientHint: "Ví dụ: CSKH Shopee – phiếu 98765",
  expires: "Hết hạn sau",
  days: (n: number) => `${n} ngày`,
  privacy:
    "Video Cam 2 có thể thấy nhãn vận đơn (tên, SĐT người mua). Chỉ gửi link cho sàn / ĐVVC của đơn này.",
  cancel: "Hủy",
  create: "Tạo link",
  noSessions: "Chưa có phiên nào có clip.",
  loadError: "Không tải được danh sách phiên.",
  retry: "Thử lại",
  minSessions: "Chọn ít nhất 1 phiên.",
  maxSessions: "Chọn tối đa 4 phiên.",
  maxDuration: "Tổng thời lượng tối đa 30 phút.",
  recipientRule: "Ghi rõ gửi cho ai (3–100 ký tự).",
  cloudMissing: "Chưa cấu hình kho lưu cloud. Admin: Cài đặt → Sao lưu.",
  reviewPending: (n: number) =>
    `Hồ sơ còn ${n} phiên mở hoàn Cần soát chưa xử lý — xem ở chi tiết hồ sơ trước khi gửi link.`,
  noOpeningVideo: "Chưa chọn video mở hộp nào — link chỉ có video đóng gói.",
  progress: "Tiến độ tạo link",
  rendering: (i: number, n: number) => `Đang dựng video (${i}/${n})…`,
  uploading: "Đang tải lên…",
  close: "Đóng",
  background: "Link tiếp tục được tạo khi đóng. Kết quả có ở Link chia sẻ.",
  ready: "Link đã sẵn sàng",
  linkLabel: "Link chia sẻ",
  copy: "Sao chép link",
  copied: "Đã sao chép link.",
  expiresAt: (at: string) => `Hết hạn ${fmtDate(at)} ${fmtShort(at).slice(6)}`,
  sentTo: (r: string) => `Gửi cho: ${r}`,
  uploadFailed: "Không tải được lên kho lưu cloud. Kiểm tra Internet rồi bấm Thử lại.",
  renderFailed: "Không dựng được video. Bấm Thử lại; nếu vẫn lỗi, báo Admin kèm mã hồ sơ.",
  /** mới (G3-FE-1) — link thu hồi / hết hạn khi dialog đang mở. */
  revoked: "Link đã bị thu hồi.",
  /** mới (G3-FE-1) */
  expired: "Link đã hết hạn.",
  doneToast: (r: string) => `Link chia sẻ cho "${r}" đã sẵn sàng.`,
  failedToast: (r: string) => `Không tạo được link chia sẻ cho "${r}". Mở Link chia sẻ để xem lỗi.`,
  /** mới (G3-FE-2) — link chạy nền bị thu hồi trước khi xong. */
  revokedToast: (r: string) => `Link chia sẻ cho "${r}" đã bị thu hồi.`,
  /** mới (G3-FE-2) */
  expiredToast: (r: string) => `Link chia sẻ cho "${r}" đã hết hạn.`,
  duration: (s: number) => fmtDuration(s),
};

/** Chữ D21 Link chia sẻ + khối Link ở D4 / D17 + thu hồi / sao chép — 01 §10.5 D21 (chữ đánh dấu "mới" chưa có ở 01 — chờ PO, DEC-701). */
export const LIST = {
  title: "Link chia sẻ",
  /** mới */
  subtitle: "Link bằng chứng đã gửi cho sàn / ĐVVC — sao chép lại hoặc thu hồi.",
  tabs: "Trạng thái link",
  tab: { ACTIVE: "Đang hoạt động", REVOKED: "Đã thu hồi", EXPIRED: "Hết hạn", ALL: "Tất cả" },
  q: "Tìm mã kiện / mã hồ sơ / gửi cho",
  search: "Tìm",
  creator: "Người tạo",
  creatorAll: "Tất cả",
  mine: "Của tôi",
  /** mới */
  sourceFilter: (label: string) => `Nguồn: ${label}`,
  /** mới */
  sourceFilterUnknown: "Đang lọc theo một hồ sơ / kiện",
  /** mới */
  clear: "Bỏ lọc",
  caption: "Danh sách link chia sẻ",
  col: {
    created: "Tạo lúc",
    creator: "Người tạo",
    recipient: "Gửi cho",
    source: "Nguồn",
    sessions: "Phiên",
    expires: "Hết hạn",
    status: "Trạng thái",
    actions: "Thao tác",
  },
  empty: "Chưa có link chia sẻ nào.",
  emptyHint: "Tạo link từ hồ sơ khiếu nại hoặc chi tiết đơn.",
  /** mới */
  emptyFiltered: "Không có link nào khớp bộ lọc.",
  /** mới — tab trống nhưng tab khác có link. */
  emptyTab: "Không có link nào ở mục này.",
  error: "Không tải được danh sách link chia sẻ.",
  retry: "Thử lại",
  loading: "Đang tải",
  revokedBy: (who: string | null, at: string) => (who ? `${who}, ${at}` : at),
  revokePending: "Đang thu hồi — chờ Internet",
  revokePendingInfo: "Link vẫn mở được trên cloud tới khi kho có mạng lại hoặc hết hạn.",
  copy: "Sao chép",
  copyAria: (r: string) => `Sao chép link gửi ${r}`,
  copied: "Đã sao chép link.",
  /** mới */
  copyFailed: "Không sao chép được link. Mở Link chia sẻ trên trình duyệt khác rồi thử lại.",
  revoke: "Thu hồi",
  revokeAria: (r: string) => `Thu hồi link gửi ${r}`,
  /** Khối D4 / D17. */
  block: (n: number) => `Link chia sẻ (${n} đang hoạt động)`,
  blockAll: "Xem tất cả",
  /** mới */
  blockEmpty: "Chưa có link chia sẻ nào.",
  expiresShort: (at: string) => `Hết hạn ${at}`,
  sessionCount: (n: number) => `${n} phiên`,
} as const;

/** Dialog "Thu hồi link?" — 01 §10.5 D21. */
export const REVOKE = {
  title: "Thu hồi link?",
  body: "Người nhận sẽ không mở được link này nữa (trong vòng 1 phút). Không hoàn tác được.",
  confirm: "Thu hồi link",
  cancel: "Hủy",
  done: "Đã thu hồi link.",
  /** mới — lỗi mạng (không có `message` server). */
  failed: "Không thu hồi được link. Thử lại.",
} as const;
