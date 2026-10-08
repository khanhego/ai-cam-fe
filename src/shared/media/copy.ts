import { isApiError } from "@/lib/api/errors";
import { fmtDate } from "@/shared/format";

/** Chữ trạng thái clip (01 §10.5 D4), dùng chung station và dashboard. */
export const CLIP_COPY = {
  pending: "Clip đang được cắt, sẵn sàng trong khoảng 1 phút.",
  deleted: (date?: string | null, days?: number | null) =>
    date
      ? `Clip đã bị xóa ngày ${fmtDate(date)} theo chính sách lưu trữ${days ? ` ${days} ngày` : ""}.`
      : "Clip đã bị xóa theo chính sách lưu trữ.",
  failed: "Không tạo được clip cho phiên này.",
  /** API-40 / 43 trả `409 CLIP_NOT_READY` `details.status = FAILED` (02 v0.3 DEC-57). */
  failedRebuild: "Clip cắt lỗi — Admin/Supervisor có thể cắt lại.",
  playError: "Không phát được clip. Bấm Thử lại; nếu vẫn lỗi, tải lại trang.",
  /** item 03 (01 §10.5 "Clip / ảnh Thiếu tệp" v0.5): `clip.status = MISSING` (EX-K8 / K9). */
  missing: "Thiếu tệp clip trên máy chủ — không phát được.",
  retry: "Thử lại",
};

/** Chữ dải ảnh (SnapshotStrip). */
export const STRIP_COPY = {
  deleted: "Ảnh đã bị xóa",
  loadFailed: "Không tải được ảnh",
  /** item 03: `snapshot.status = MISSING`. */
  missing: "Thiếu tệp ảnh",
  retry: "Thử lại",
};

export type ClipStateError =
  | { kind: "pending" }
  | { kind: "failed" }
  | { kind: "missing" }
  | { kind: "deleted"; deletedAt: string | null; days: number | null };

/**
 * Lỗi trạng thái clip của API-40 / 41 / 43 (02 §6.2): `409 CLIP_NOT_READY` (`details.status` PENDING / FAILED),
 * `410 CLIP_DELETED` (`details.deleted_at`, `retention_clip_days`); item 03: `details.status = MISSING` (thiếu tệp trên máy
 * chủ). Lỗi khác → null.
 */
export function clipStateError(e: unknown): ClipStateError | null {
  if (!isApiError(e)) return null;
  if (e.code === "CLIP_DELETED") {
    const at = e.details.deleted_at;
    const days = e.details.retention_clip_days;
    return {
      kind: "deleted",
      deletedAt: typeof at === "string" ? at : null,
      days: typeof days === "number" ? days : null,
    };
  }
  if (e.code === "CLIP_NOT_READY")
    return {
      kind: e.details.status === "FAILED" ? "failed" : e.details.status === "MISSING" ? "missing" : "pending",
    };
  return null;
}
