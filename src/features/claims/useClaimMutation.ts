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

/** Người sửa gần nhất theo ghi chú (VERSION_CONFLICT chỉ có `details.current` — BE DEC-312 a). */
export const lastEditor = (claim: ClaimDetail) =>
  [...claim.notes].reverse().find((n) => n.kind !== "SYSTEM" && n.author)?.author?.display_name ?? null;

/**
 * Mutation sửa hồ sơ (API-133 / 134) chờ server, không optimistic (DEC-241). Thành công → ghi thẳng
 * `['claim', id]` + làm mới D16 / D4 / D2. `VERSION_CONFLICT` → thay dữ liệu bằng `details.current` + toast
 * "Hồ sơ vừa được {người} cập nhật. Đã tải lại."; nơi gọi giữ form mở với giá trị đang nhập. `INVALID_TRANSITION` /
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
