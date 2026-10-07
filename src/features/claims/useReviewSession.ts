import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  claimsApi,
  type AffectedShare,
  type ClaimDetail,
  type ReturnSessionReviewBody,
} from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { toast } from "@/shared/ui";

import { COPY } from "./copy";
import { lastEditor, ownClaimVersions } from "./useClaimMutation";

export type ReviewVars = { sessionId: string; override?: boolean } & Omit<ReturnSessionReviewBody, "version">;

/**
 * API-189 (02 §6.2; 02b-admin §4 "Đánh dấu quét nhầm / xác nhận phiên"): chờ server (`version`), set `["claim", id]` từ
 * response (FE không tự tính phiên chính — DEC-525), làm mới D16 / D4 / D2 (hồ sơ khác cùng kiện đổi bằng chứng). Lỗi:
 * `VERSION_CONFLICT` → dữ liệu mới + Toast; `SESSION_NOT_ELIGIBLE` / `CLAIM_CLOSED` / `NOT_FOUND` / `FORBIDDEN` → Toast
 * `message` + tải lại + đóng dialog (`onClosed`); `VALIDATION_ERROR` → lỗi dưới ô (dialog đọc `error`). T-266: response
 * `affected_shares` khác rỗng (chỉ `MARK_WRONG_SCAN`) → không Toast, trả cho nơi gọi mở `AffectedSharesDialog` (DEC-531).
 */
export function useReviewSession(
  claimId: string,
  done: (vars: ReviewVars, affected: AffectedShare[]) => void,
) {
  const qc = useQueryClient();
  const key = ["claim", claimId];
  return useMutation({
    mutationFn: ({ sessionId, action, reason_code, note }: ReviewVars) => {
      const c = qc.getQueryData<ClaimDetail>(key)!;
      return claimsApi.reviewReturnSession(claimId, sessionId, {
        action,
        ...(reason_code !== undefined ? { reason_code } : {}),
        note,
        version: c.version,
      });
    },
    onSuccess: (res, vars) => {
      // `affected_shares` → `AffectedSharesDialog`; hồ sơ = phần còn lại (API-132).
      const { affected_shares: affected = [], ...claim } = res;
      ownClaimVersions.set(claimId, claim.version);
      qc.setQueryData(key, claim);
      for (const k of [["claims"], ["package"], ["daily"]]) void qc.invalidateQueries({ queryKey: k });
      const R = COPY.review;
      if (affected.length === 0)
        toast(
          vars.action === "MARK_WRONG_SCAN"
            ? R.marked
            : vars.action === "UNMARK_WRONG_SCAN"
              ? R.unmarked
              : vars.override
                ? R.overridden
                : R.confirmed,
        );
      if (affected.length > 0) void qc.invalidateQueries({ queryKey: ["shares"] });
      done(vars, affected);
    },
    onError: (err, vars) => {
      if (!isApiError(err)) return toast(COPY.generic);
      if (err.code === "VALIDATION_ERROR") return;
      if (err.code === "VERSION_CONFLICT" && err.details.current) {
        const current = err.details.current as ClaimDetail;
        ownClaimVersions.set(claimId, current.version);
        qc.setQueryData(key, current);
        return toast(COPY.detail.conflict(lastEditor(current)));
      }
      toast(err.message);
      void qc.invalidateQueries({ queryKey: key });
      done(vars, []);
    },
  });
}
