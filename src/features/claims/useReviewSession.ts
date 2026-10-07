import { useMutation, useQueryClient } from "@tanstack/react-query";

import { claimsApi, type ClaimDetail, type ReturnSessionReviewBody } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { toast } from "@/shared/ui";

import { COPY } from "./copy";
import { lastEditor, ownClaimVersions } from "./useClaimMutation";

export type ReviewVars = { sessionId: string } & Omit<ReturnSessionReviewBody, "version">;

/**
 * API-189 (02 §6.2; 02b-admin §4 "Đánh dấu quét nhầm / xác nhận phiên"): chờ server (`version`), set `["claim", id]` từ
 * response (FE không tự tính phiên chính — DEC-525), làm mới D16 / D4 / D2 (hồ sơ khác cùng kiện đổi bằng chứng). Lỗi:
 * `VERSION_CONFLICT` → dữ liệu mới + Toast; `SESSION_NOT_ELIGIBLE` / `CLAIM_CLOSED` / `NOT_FOUND` / `FORBIDDEN` → Toast
 * `message` + tải lại + đóng dialog (`onClosed`); `VALIDATION_ERROR` → lỗi dưới ô (dialog đọc `error`).
 */
export function useReviewSession(claimId: string, done: (vars: ReviewVars) => void) {
  const qc = useQueryClient();
  const key = ["claim", claimId];
  return useMutation({
    mutationFn: ({ sessionId, ...body }: ReviewVars) => {
      const c = qc.getQueryData<ClaimDetail>(key)!;
      return claimsApi.reviewReturnSession(claimId, sessionId, { ...body, version: c.version });
    },
    onSuccess: (res, vars) => {
      // `affected_shares` → `AffectedSharesDialog` ở T-266; hồ sơ = phần còn lại (API-132).
      const claim: ClaimDetail = { ...res };
      delete (claim as Partial<typeof res>).affected_shares;
      ownClaimVersions.set(claimId, claim.version);
      qc.setQueryData(key, claim);
      for (const k of [["claims"], ["package"], ["daily"]]) void qc.invalidateQueries({ queryKey: k });
      const R = COPY.review;
      toast(
        vars.action === "MARK_WRONG_SCAN"
          ? R.marked
          : vars.action === "UNMARK_WRONG_SCAN"
            ? R.unmarked
            : R.confirmed,
      );
      done(vars);
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
      done(vars);
    },
  });
}
