import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ClaimDetail } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { toast } from "@/shared/ui";

import { COPY } from "./copy";

/**
 * `version` do chính người này vừa ghi (API-133 / 134 trả về) — D17 dùng để không báo "Hồ sơ vừa được cập nhật." cho
 * thay đổi của chính mình khi WS `claim.updated` làm tải lại (02b-admin §4).
 */
export const ownClaimVersions = new Map<string, number>();

/**
 * Người sửa gần nhất khi VERSION_CONFLICT: chỉ tin `details.current.updated_by` (BE có thể thêm sau). Ghi chú cuối không
 * chắc là người vừa sửa (sửa trường không sinh ghi chú) → không đoán; null = chữ trung tính (G3-F20, DEC-354).
 */
export const lastEditor = (claim: ClaimDetail): string | null => {
  const by = (claim as ClaimDetail & { updated_by?: unknown }).updated_by;
  if (typeof by === "string") return by.trim() || null;
  if (by && typeof by === "object" && "display_name" in by) {
    const name = (by as { display_name?: unknown }).display_name;
    return typeof name === "string" && name.trim() ? name : null;
  }
  return null;
};

/**
 * Mutation sửa hồ sơ (API-133 / 134) chờ server, không optimistic (DEC-241). Thành công → ghi thẳng
 * `['claim', id]` + làm mới D16 / D4 / D2. `VERSION_CONFLICT` → thay dữ liệu bằng `details.current` + toast
 * "Hồ sơ vừa được người khác cập nhật. Đã tải lại." (có `updated_by` thì nêu tên); nơi gọi giữ form mở với giá trị đang nhập. `INVALID_TRANSITION` /
 * `CLAIM_CLOSED` → tải lại hồ sơ.
 */
export function useClaimMutation<V>(
  claimId: string,
  fn: (vars: V, claim: ClaimDetail) => Promise<ClaimDetail>,
  onDone?: (claim: ClaimDetail) => void,
) {
  const qc = useQueryClient();
  const key = ["claim", claimId];
  return useMutation({
    mutationFn: (vars: V) => fn(vars, qc.getQueryData<ClaimDetail>(key)!),
    onSuccess: (claim) => {
      ownClaimVersions.set(claimId, claim.version);
      qc.setQueryData(key, claim);
      for (const k of [["claims"], ["package"], ["daily"]]) void qc.invalidateQueries({ queryKey: k });
      toast(COPY.detail.updated);
      onDone?.(claim);
    },
    onError: (err) => {
      if (!isApiError(err)) return;
      if (err.code === "VERSION_CONFLICT" && err.details.current) {
        const current = err.details.current as ClaimDetail;
        ownClaimVersions.set(claimId, current.version);
        qc.setQueryData(key, current);
        toast(COPY.detail.conflict(lastEditor(current)));
      } else if (err.code === "INVALID_TRANSITION" || err.code === "CLAIM_CLOSED") {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** Lỗi hiển thị trong form / Dialog: `VALIDATION_ERROR` → theo field; `VERSION_CONFLICT` đã toast → không lặp. */
export function claimErrorText(err: unknown): string | null {
  if (!err || !isApiError(err)) return err ? COPY.generic : null;
  if (err.code === "VALIDATION_ERROR" || err.code === "VERSION_CONFLICT") return null;
  return err.message;
}
