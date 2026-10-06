import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { hasPermission } from "@/lib/api/auth";
import type { ClaimType } from "@/lib/api/claims";
import { isApiError } from "@/lib/api/errors";
import { packagesApi, type PackageDetail, type PackageSession } from "@/lib/api/packages";
import { settingsApi } from "@/lib/api/settings";
import { fmtDuration, fmtShort } from "@/shared/format";
import { platformStatus, SESSION_STATUS, SOURCE, WAREHOUSE_STATUS } from "@/shared/labels";
import { RECON_SEVERITY, RECON_STATUS, reconRuleLabel, SESSION_TYPE } from "@/shared/returns/labels";
import { Alert, Button, cx, EmptyState, Skeleton, StatusChip, TrackingNumber } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { ClaimChips } from "../claims/ClaimChips";
import { CreateClaimDialog } from "../claims/CreateClaimDialog";
import { ReturnCaseSection } from "../returns/ReturnCaseSection";
import { screenReady } from "../shell/nav";
import { COPY as CLAIM_COPY } from "../claims/copy";
import { COPY as RETURN_COPY } from "../returns/copy";
import { COPY } from "./copy";
import { ExportDialog } from "./ExportDialog";
import { exportLayouts } from "./exportLayouts";
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
        const type = s.type ?? "PACK";
        // Phiên hoàn hoàn tất không phải "Đã đóng gói" (item 02).
        const [label, tone] =
          type === "RETURN" && s.status === "COMPLETED"
            ? ([C.returnDone, "success"] as const)
            : (SESSION_STATUS[s.status] ?? ["—", "neutral"]);
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
                <span className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={type === "RETURN" ? "primary" : "neutral"}>
                    {SESSION_TYPE[type]}
                  </StatusChip>
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

/**
 * D4 — Chi tiết đơn (01 §10.5, FR-07.02, 02.06, 02.09, 02.11, 08.01): khối Hàng hoàn (kết quả kiểm, ảnh, hồ sơ khiếu
 * nại), cảnh báo lệch, clip Cam 1 / Cam 2 / Ghép + chip bảo vệ (thay "Giữ clip"), phiên (chip Mở hoàn / Đóng gói),
 * hồ sơ khiếu nại, sản phẩm, dòng thời gian; "Tạo hồ sơ khiếu nại".
 */
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
  const [creatingClaim, setCreatingClaim] = useState(false);
  // Tên quy tắc có số cấu hình ("quá {N} ngày") lấy từ API-80 — vai đọc được cài đặt (02b-admin §9).
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    enabled: me.role === "ADMIN" || me.role === "SUPERVISOR",
  });
  // Ảnh không tải được (URL ký hết hạn — 02b-admin §4): tải lại API-31 một lần.
  const reloadedForImage = useRef(false);
  const onSnapshotExpired = () => {
    if (reloadedForImage.current) return;
    reloadedForImage.current = true;
    void query.refetch();
  };

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
  const order = pkg.order;
  const returnCases = pkg.return_cases ?? [];
  const alerts = pkg.recon_alerts ?? [];
  const canClaim = hasPermission(me, "claims.manage");
  const latestCase = returnCases[0];
  // Loại mặc định theo kết luận phiên hoàn gần nhất có vấn đề, không thì "Khách báo thiếu / sai" (01 §10.5 D4).
  const lastIssue = sessions.find(
    (s) => s.type === "RETURN" && s.inspection?.conclusion && s.inspection.conclusion !== "OK",
  )?.inspection?.conclusion;
  const defaultType: ClaimType = lastIssue && lastIssue !== "OK" ? lastIssue : "BUYER_CLAIM";
  const sessionsOf = (caseId: string) => {
    const own = sessions.filter((s) => s.return_case_id === caseId);
    return own.length > 0 || returnCases.length > 1 ? own : sessions.filter((s) => s.type === "RETURN");
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-headline-sm text-on-surface">
            <TrackingNumber value={pkg.tracking_number} size="lg" />
            <StatusChip tone={whTone}>{whLabel}</StatusChip>
            {pkg.is_placeholder && <StatusChip tone="warning">{C.placeholder}</StatusChip>}
            {order?.platform_status && (
              <StatusChip>
                {C.platform}: {platformStatus(order.platform_status)}
              </StatusChip>
            )}
            {!pkg.verified && !pkg.is_placeholder && <StatusChip tone="warning">{C.unverified}</StatusChip>}
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
        {canClaim && (
          <div className="flex flex-wrap gap-2">
            <Button variant="tonal" icon="gavel" onClick={() => setCreatingClaim(true)}>
              {CLAIM_COPY.create.open}
            </Button>
          </div>
        )}
      </div>

      {returnCases.map((rc) => (
        <section key={rc.id} className="card mb-4 p-4" aria-labelledby={`d4-return-${rc.id}`}>
          <h2 id={`d4-return-${rc.id}`} className="mb-3 text-title-md text-on-surface">
            {RETURN_COPY.section.title}
          </h2>
          <ReturnCaseSection
            returnCase={rc}
            sessions={sessionsOf(rc.id)}
            onSnapshotExpired={onSnapshotExpired}
          />
        </section>
      ))}

      {alerts.length > 0 && (
        <section className="card mb-4 p-4" aria-labelledby="d4-recon">
          <h2 id="d4-recon" className="mb-2 flex items-center gap-2 text-title-md text-on-surface">
            {C.recon}
            {screenReady("D15") && (
              <Link to="/admin/recon" className="text-label-lg text-primary hover:underline">
                {C.reconLink}
              </Link>
            )}
          </h2>
          <ul className="flex flex-col gap-1 text-body-md text-on-surface">
            {alerts.map((a) => {
              const [sev, sevTone] = RECON_SEVERITY[a.severity];
              const [st, stTone] = RECON_STATUS[a.status];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={sevTone}>{sev}</StatusChip>
                  <span>
                    {a.br} {reconRuleLabel(a.rule, settings.data ?? {})}
                  </span>
                  <StatusChip tone={stTone}>{st}</StatusChip>
                  <span className="text-on-surface-variant tabular-nums">
                    {fmtShort(a.closed_at ?? a.detected_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
              onSnapshotExpired={onSnapshotExpired}
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
      {creatingClaim && (
        <CreateClaimDialog
          packageId={pkg.id}
          returnCaseId={latestCase?.id ?? null}
          defaultType={defaultType}
          defaultCounterparty={latestCase?.kind === "FAILED_DELIVERY" ? "CARRIER" : "PLATFORM"}
          onClose={() => setCreatingClaim(false)}
        />
      )}

      {pkg.claims && (
        <section className="card mb-4 p-4" aria-labelledby="d4-claims">
          <h2 id="d4-claims" className="mb-2 text-title-md text-on-surface">
            {C.claims}
          </h2>
          {pkg.claims.length > 0 ? (
            <ClaimChips claims={pkg.claims} />
          ) : (
            <p className="text-body-md text-on-surface-variant">{C.noClaims}</p>
          )}
        </section>
      )}

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
