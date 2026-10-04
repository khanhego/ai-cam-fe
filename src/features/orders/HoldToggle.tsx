import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clipsApi } from "@/lib/api/clips";
import { isApiError } from "@/lib/api/errors";
import type { PackageDetail } from "@/lib/api/packages";
import { Button, toast } from "@/shared/ui";

import { COPY } from "./copy";

/**
 * "Giữ clip" / "Bỏ giữ" (API-42, FR-02.09) cho các clip READY của phiên đang chọn.
 * Optimistic (02b-admin §4): đảo ngay trong cache `['package', id]`, lỗi → hoàn tác + toast.
 */
export function HoldToggle({
  packageId,
  clipIds,
  held,
}: {
  packageId: string;
  clipIds: string[];
  held: boolean;
}) {
  const qc = useQueryClient();
  const key = ["package", packageId];
  const mutation = useMutation({
    mutationFn: (next: boolean) => Promise.all(clipIds.map((id) => clipsApi.hold(id, next))),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<PackageDetail>(key);
      if (before) {
        qc.setQueryData<PackageDetail>(key, {
          ...before,
          sessions: before.sessions.map((s) => ({
            ...s,
            clips: s.clips.map((c) => (clipIds.includes(c.id) ? { ...c, held: next } : c)),
          })),
        });
      }
      return { before };
    },
    onError: (err, _next, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before);
      toast(isApiError(err) ? err.message : "Có lỗi hệ thống. Thử lại sau ít phút.");
    },
    onSuccess: (_d, next) => toast(next ? COPY.detail.holdOk : COPY.detail.unholdOk),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  return (
    <Button
      variant="tonal"
      icon={held ? "bookmark_remove" : "bookmark"}
      aria-pressed={held}
      disabled={mutation.isPending || clipIds.length === 0}
      onClick={() => mutation.mutate(!held)}
    >
      {held ? COPY.detail.unhold : COPY.detail.hold}
    </Button>
  );
}
