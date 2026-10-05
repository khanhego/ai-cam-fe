import { useQuery } from "@tanstack/react-query";

import { approvalsApi, PENDING_APPROVALS_KEY } from "@/lib/api/approvals";

/**
 * API-20 `status=PENDING` (02b-admin §4): một query dùng chung cho D13 và badge trên drawer.
 * WS-02 `approval.*` invalidate (useDashboardSocket); poll 60 giây dự phòng khi mất WS.
 */
export function usePendingApprovals(enabled = true) {
  return useQuery({
    queryKey: PENDING_APPROVALS_KEY,
    queryFn: approvalsApi.pending,
    refetchInterval: 60_000,
    enabled,
  });
}
