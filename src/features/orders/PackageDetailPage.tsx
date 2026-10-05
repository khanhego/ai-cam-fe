import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { isApiError } from "@/lib/api/errors";
import { packagesApi, type PackageDetail, type PackageSession } from "@/lib/api/packages";
import { fmtDuration, fmtShort } from "@/shared/format";
import { platformStatus, SESSION_STATUS, SOURCE, WAREHOUSE_STATUS } from "@/shared/labels";
import { Alert, Button, cx, EmptyState, Skeleton, StatusChip, TrackingNumber } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { COPY } from "./copy";
import { ExportDialog } from "./ExportDialog";
import { exportLayouts } from "./exportLayouts";
import { HoldToggle } from "./HoldToggle";
import { SessionPanel } from "./SessionPanel";

const C = COPY.detail;
const hasPending = (p: PackageDetail | undefined) =>
  Boolean(p?.sessions.some((s) => s.clips.some((c) => c.status === "PENDING")));

function SessionList({
  sessions,
  selected,
  onSelect,
}: {
  sessions: PackageSession[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {sessions.map((s) => {
        const [label, tone] = SESSION_STATUS[s.status] ?? ["—", "neutral"];
        const active = s.id === selected;
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(s.id)}
              className={cx(
                "state-layer flex w-full items-start gap-3 rounded-md px-3 py-2 text-left",
                active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface",
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary",
                  active && "bg-primary",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-body-md tabular-nums">
                  {fmtShort(s.started_at)} {s.station_name}
                </span>
                <span className="flex items-center gap-2">
                  <StatusChip tone={tone}>{label}</StatusChip>
                  <span className="text-body-sm tabular-nums">{fmtDuration(s.duration_s)}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function timelineText(t: PackageDetail["timeline"][number]) {
  const status =
    t.source === "PLATFORM"
      ? `${C.platform}: ${platformStatus(t.to_status)}`
      : `${C.warehouse}: ${WAREHOUSE_STATUS[t.to_status as keyof typeof WAREHOUSE_STATUS]?.[0] ?? "—"}`;
  return t.actor ? `${status} · ${t.actor}` : status;
}

/** D4 — Chi tiết đơn (01 §10.5, FR-07.02, 02.09): clip Cam 1 / Cam 2 / Ghép, phiên, sản phẩm, dòng thời gian. */
export default function PackageDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const me = useAuth((s) => s.me)!;
  const query = useQuery({
    queryKey: ["package", id],
    queryFn: () => packagesApi.get(id),
    // Clip đang cắt → tự làm mới để player hiện khi xong (TC-02.11; WS-02 chưa có sự kiện clip — DEC-71).
    refetchInterval: (q) => (hasPending(q.state.data) ? 10_000 : false),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Đang tải">
        <Skeleton className="mb-2 h-8 w-72" />
        <Skeleton className="mb-6 h-4 w-96" />
        <div className="card p-4">
          <div className="md-skeleton aspect-video w-full" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    if (isApiError(query.error) && query.error.status === 404) {
      return (
        <EmptyState
          icon="search_off"
          title={C.notFound}
          action={
            <Button variant="tonal" onClick={() => navigate("/admin/packages")}>
              {C.back}
            </Button>
          }
        />
      );
    }
    return (
      <Alert
        kind="error"
        action={
          <Button variant="text" onClick={() => query.refetch()}>
            {COPY.search.retry}
          </Button>
        }
      >
        {C.error}
      </Alert>
    );
  }

  const pkg = query.data;
  const sessions = [...pkg.sessions].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const session = sessions.find((s) => s.id === picked) ?? sessions[0];
  const [whLabel, whTone] = WAREHOUSE_STATUS[pkg.warehouse_status] ?? ["—", "neutral"];
  const ready = session?.clips.filter((c) => c.status === "READY") ?? [];
  const held = ready.length > 0 && ready.every((c) => c.held);
  const order = pkg.order;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-headline-sm text-on-surface">
            <TrackingNumber value={pkg.tracking_number} size="lg" />
            <StatusChip tone={whTone}>{whLabel}</StatusChip>
            {order?.platform_status && (
              <StatusChip>
                {C.platform}: {platformStatus(order.platform_status)}
              </StatusChip>
            )}
            {!pkg.verified && <StatusChip tone="warning">{C.unverified}</StatusChip>}
          </h1>
          {order && (
            <p className="mt-1 text-body-md text-on-surface-variant">
              {C.orderSn} <span className="font-mono text-on-surface">{order.platform_order_sn}</span> ·{" "}
              {C.source} {SOURCE[order.source] ?? "—"}
              {order.buyer_note && (
                <>
                  {" "}
                  · {C.note}: “{order.buyer_note}”
                </>
              )}
            </p>
          )}
        </div>
        {session && ready.length > 0 && (
          <HoldToggle packageId={pkg.id} clipIds={ready.map((c) => c.id)} held={held} />
        )}
      </div>

      <div className="mb-4 grid gap-4 *:min-w-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card p-4" aria-labelledby="d4-clip">
          <h2 id="d4-clip" className="mb-3 text-title-md text-on-surface">
            {C.clip}
          </h2>
          {session ? (
            <SessionPanel
              packageId={pkg.id}
              session={session}
              canRebuild={me.role === "ADMIN" || me.role === "SUPERVISOR"}
              actions={
                exportLayouts(session).length > 0 && (
                  <Button icon="ios_share" onClick={() => setExporting(true)}>
                    {C.export}
                  </Button>
                )
              }
            />
          ) : (
            <EmptyState icon="inventory_2" title={C.noSession} />
          )}
        </section>
        <section className="card p-4" aria-labelledby="d4-sessions">
          <h2 id="d4-sessions" className="mb-3 text-title-md text-on-surface">
            {C.sessions}
          </h2>
          {session ? (
            <SessionList sessions={sessions} selected={session.id} onSelect={setPicked} />
          ) : (
            <p className="text-body-md text-on-surface-variant">{C.noSession}</p>
          )}
        </section>
      </div>

      {exporting && session && <ExportDialog session={session} onClose={() => setExporting(false)} />}

      <section className="card mb-4 p-4" aria-labelledby="d4-items">
        <h2 id="d4-items" className="mb-2 text-title-md text-on-surface">
          {C.items}
        </h2>
        {order && order.items.length > 0 ? (
          <ul className="grid gap-x-6 gap-y-1 text-body-md text-on-surface sm:grid-cols-2">
            {order.items.map((it, i) => (
              <li key={i}>
                {[it.product_name, it.variation].filter(Boolean).join(" · ")} ·{" "}
                <span className="tabular-nums">× {it.quantity}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-md text-on-surface-variant">{C.noItems}</p>
        )}
      </section>

      <section className="card p-4" aria-labelledby="d4-timeline">
        <h2 id="d4-timeline" className="mb-2 text-title-md text-on-surface">
          {C.timeline}
        </h2>
        <ol className="flex flex-col gap-1 text-body-md text-on-surface">
          {pkg.timeline.map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-24 shrink-0 text-on-surface-variant tabular-nums">{fmtShort(t.at)}</span>
              <span>{timelineText(t)}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
