import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { isApiError } from "@/lib/api/errors";
import { sharesApi } from "@/lib/api/shares";
import { toast } from "@/shared/ui";

import { COPY } from "./copy";
import { sharePoll, useBackgroundShares } from "./shareProgress";

/** API-162 trả 4xx (403 mất quyền, 404 link không còn…) → thôi theo dõi (không thử lại — G3-FE-2). */
const gone = (e: unknown) => isApiError(e) && e.status >= 400 && e.status < 500;

/**
 * Hook toàn cục `useShareCompletionToast` (02b-admin §3 ShareLinkDialog, DEC-487): link đóng dialog khi đang tạo → poll
 * API-162 (WS `share.updated` cũng invalidate `["share", id]`) → Toast khi `ACTIVE` / `FAILED` / `REVOKED` / `EXPIRED`
 * (G3-FE-2: Toast riêng cho thu hồi / hết hạn), làm mới D4 / D17 / D21. API-162 lỗi 4xx → bỏ khỏi danh sách, dừng poll.
 * Gắn một lần trong `AppShell`.
 */
export function ShareCompletionWatcher() {
  const pending = useBackgroundShares((s) => s.pending);
  const remove = useBackgroundShares((s) => s.remove);
  const qc = useQueryClient();
  const ids = Object.keys(pending);
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["share", id],
      queryFn: () => sharesApi.get(id),
      refetchInterval: (q: { state: { data?: { status: string }; error: unknown } }) =>
        gone(q.state.error)
          ? false
          : q.state.data?.status === "CREATING" || !q.state.data
            ? sharePoll.ms
            : false,
    })),
  });
  const statuses = results.map((r) => (gone(r.error) ? "GONE" : (r.data?.status ?? ""))).join("|");
  useEffect(() => {
    results.forEach((r, i) => {
      const id = ids[i]!;
      if (gone(r.error)) {
        remove(id);
        return;
      }
      const st = r.data?.status;
      if (!st || st === "CREATING") return;
      const recipient = pending[id] ?? "";
      toast(
        st === "ACTIVE"
          ? COPY.doneToast(recipient)
          : st === "REVOKED"
            ? COPY.revokedToast(recipient)
            : st === "EXPIRED"
              ? COPY.expiredToast(recipient)
              : COPY.failedToast(recipient),
      );
      remove(id);
      for (const k of [["shares"], ["claim"], ["package"]]) void qc.invalidateQueries({ queryKey: k });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy khi trạng thái đổi
  }, [statuses]);
  return null;
}
