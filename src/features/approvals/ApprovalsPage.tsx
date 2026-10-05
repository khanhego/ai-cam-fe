import { useEffect, useState } from "react";

import { Alert, Button, EmptyState, IconButton, PageHeader, Skeleton } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { navFor } from "../shell/nav";
import { ApprovalCard } from "./ApprovalCard";
import { COPY } from "./copy";
import { usePendingApprovals } from "./usePendingApprovals";

/** Đồng hồ cho "Chờ n phút" (cập nhật mỗi 30 giây). */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** D13 — Yêu cầu duyệt (01 §10.5, FR-03.10, 03.12, UC-08). Chỉ ADMIN, SUPERVISOR (guard ở routes). */
export default function ApprovalsPage() {
  const me = useAuth((s) => s.me)!;
  const approvals = usePendingApprovals();
  const now = useNow();
  const [conflict, setConflict] = useState<string | null>(null);
  const canLive = navFor(me.role).some((n) => n.to === "/admin/live");
  const items = approvals.data?.items ?? [];

  return (
    <>
      <PageHeader title={COPY.title} subtitle={COPY.subtitle} />
      {conflict && (
        <Alert
          kind="info"
          action={<IconButton icon="close" label="Ẩn thông báo" onClick={() => setConflict(null)} />}
        >
          {conflict}
        </Alert>
      )}
      {approvals.isPending ? (
        <Skeleton lines={3} className="h-32" />
      ) : approvals.isError ? (
        <Alert
          kind="error"
          action={
            <Button variant="elevated" size="sm" onClick={() => void approvals.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {COPY.error}
        </Alert>
      ) : items.length === 0 ? (
        <EmptyState icon="task_alt" title={COPY.empty} />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              now={now}
              liveHref={canLive ? `/admin/live?station=${item.station.id}` : undefined}
              onConflict={setConflict}
            />
          ))}
        </div>
      )}
    </>
  );
}
