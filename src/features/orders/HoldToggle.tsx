import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clipsApi, type HoldResult } from "@/lib/api/clips";
import { isApiError } from "@/lib/api/errors";
import type { PackageDetail } from "@/lib/api/packages";
import { CAMERA_ROLE } from "@/shared/labels";
import { Button, toast } from "@/shared/ui";

import { COPY } from "./copy";

type Outcome = { id: string; result: PromiseSettledResult<HoldResult> };

const errText = (e: unknown) => (isApiError(e) ? e.message : COPY.generic);

/**
 * "Giữ clip" / "Bỏ giữ" (API-42, FR-02.09) cho các clip READY của phiên đang chọn.
 * Optimistic (02b-admin §4): đảo ngay trong cache `['package', id]`. Mỗi clip một lời gọi, kết quả từng clip độc lập
 * (`allSettled`, review G3 F33): clip lỗi được hoàn tác riêng và toast nêu rõ camera nào lỗi.
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
  const roleOf = (id: string, pkg: PackageDetail | undefined) => {
    const clip = pkg?.sessions.flatMap((s) => s.clips).find((c) => c.id === id);
    return clip ? CAMERA_ROLE[clip.camera_role] : id;
  };
  const patch = (
    fn: (clipId: string, held: boolean) => Partial<{ held: boolean; retention_until: string | null }> | null,
  ) => {
    const cur = qc.getQueryData<PackageDetail>(key);
    if (!cur) return;
    qc.setQueryData<PackageDetail>(key, {
      ...cur,
      sessions: cur.sessions.map((s) => ({
        ...s,
        clips: s.clips.map((c) => {
          const p = fn(c.id, c.held);
          return p ? { ...c, ...p } : c;
        }),
      })),
    });
  };

  const mutation = useMutation({
    mutationFn: async (next: boolean): Promise<Outcome[]> => {
      const results = await Promise.allSettled(clipIds.map((id) => clipsApi.hold(id, next)));
      return results.map((result, i) => ({ id: clipIds[i]!, result }));
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<PackageDetail>(key);
      patch((id) => (clipIds.includes(id) ? { held: next } : null));
      return { before };
    },
    onSuccess: (outcomes, next, ctx) => {
      const prev = new Map(
        ctx?.before?.sessions.flatMap((s) => s.clips).map((c) => [c.id, c] as const) ?? [],
      );
      const byId = new Map(outcomes.map((o) => [o.id, o.result] as const));
      patch((id) => {
        const r = byId.get(id);
        if (!r) return null;
        if (r.status === "fulfilled") return { held: r.value.held, retention_until: r.value.retention_until };
        const old = prev.get(id);
        return old ? { held: old.held, retention_until: old.retention_until } : null;
      });
      const failed = outcomes.filter((o) => o.result.status === "rejected");
      if (failed.length === 0) return toast(next ? COPY.detail.holdOk : COPY.detail.unholdOk);
      const reason = (failed[0]!.result as PromiseRejectedResult).reason;
      const ok = outcomes.filter((o) => o.result.status === "fulfilled");
      toast(
        COPY.detail.holdFailed(
          next,
          failed.map((o) => roleOf(o.id, ctx?.before)),
          ok.map((o) => roleOf(o.id, ctx?.before)),
          errText(reason),
        ),
      );
    },
    onError: (err, _next, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before);
      toast(errText(err));
    },
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
