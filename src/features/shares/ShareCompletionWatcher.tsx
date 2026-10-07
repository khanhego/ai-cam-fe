import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { sharesApi } from "@/lib/api/shares";
import { toast } from "@/shared/ui";

import { COPY } from "./copy";
import { sharePoll, useBackgroundShares } from "./shareProgress";

/**
 * Hook toàn cục `useShareCompletionToast` (02b-admin §3 ShareLinkDialog, DEC-487): link đóng dialog khi đang tạo → poll
 * API-162 (WS `share.updated` cũng invalidate `["share", id]`) → Toast khi `ACTIVE` / `FAILED`, làm mới D4 / D17 / D21.
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
      refetchInterval: (q: { state: { data?: { status: string } } }) =>
        q.state.data?.status === "CREATING" || !q.state.data ? sharePoll.ms : false,
    })),
  });
  const statuses = results.map((r) => r.data?.status ?? "").join("|");
  useEffect(() => {
    results.forEach((r, i) => {
      const id = ids[i]!;
      const st = r.data?.status;
      if (!st || st === "CREATING") return;
      const recipient = pending[id] ?? "";
      toast(st === "ACTIVE" ? COPY.doneToast(recipient) : COPY.failedToast(recipient));
      remove(id);
      for (const k of [["shares"], ["claim"], ["package"]]) void qc.invalidateQueries({ queryKey: k });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy khi trạng thái đổi
  }, [statuses]);
  return null;
}
