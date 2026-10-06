import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { hasPermission } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/errors";
import { reconApi, RECON_RULES, type ReconAlert, type ReconRule, type ReconSeverity } from "@/lib/api/recon";
import { fmtShort } from "@/shared/format";
import { platformStatus, WAREHOUSE_STATUS } from "@/shared/labels";
import { RECON_SEVERITY, RECON_STATUS, reconRuleLabel, type RuleThresholds } from "@/shared/returns/labels";
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  SelectField,
  Skeleton,
  StatusChip,
  Tabs,
  TextField,
  toast,
} from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { claimPath } from "../claims/paths";
import { screenReady } from "../shell/nav";
import { COPY } from "./copy";
import {
  hasReconFilters,
  PAGE_SIZE,
  paramsFromReconFilters,
  RECON_TABS,
  reconFiltersFromParams,
  SEVERITIES,
  toApiReconFilters,
  type ReconTab,
  type ReconUrlFilters,
} from "./filters";
import { ResolveAlertDialog } from "./ResolveAlertDialog";
import { useRuleThresholds } from "./useRuleThresholds";

const L = COPY.list;

const since = (a: ReconAlert) => fmtShort((a.context.since as string | null | undefined) ?? a.detected_at);

function SeverityChip({ a }: { a: ReconAlert }) {
  const [label, tone] = RECON_SEVERITY[a.severity];
  return (
    <StatusChip tone={tone} icon={a.severity === "HIGH" ? "warning" : undefined}>
      {label}
    </StatusChip>
  );
}

function WarehouseCell({ a }: { a: ReconAlert }) {
  const ws = WAREHOUSE_STATUS[a.package.warehouse_status];
  return <>{ws?.[0] ?? a.package.warehouse_status}</>;
}

/** Kết quả xử lý (tab Đã xử lý / Tất cả): trạng thái + người + giờ + cách xử lý (link D17 khi tạo hồ sơ). */
function ResultCell({ a }: { a: ReconAlert }) {
  const [label, tone] = RECON_STATUS[a.status];
  if (a.status === "OPEN") return <StatusChip tone={tone}>{label}</StatusChip>;
  if (a.status === "AUTO_RESOLVED")
    return <span className="text-on-surface-variant">{L.autoResolved(fmtShort(a.closed_at))}</span>;
  const r = a.resolution;
  return (
    <div className="flex flex-col">
      <span className="flex flex-wrap items-center gap-1">
        <StatusChip tone={tone}>{label}</StatusChip>
        {r && <span className="text-body-sm">{L.action[r.action]}</span>}
        {r?.claim_id && screenReady("D17") && (
          <Link to={claimPath(r.claim_id)} className="text-body-sm text-primary hover:underline">
            {COPY.list.action.OPEN_CLAIM}
          </Link>
        )}
      </span>
      <span className="text-body-sm text-on-surface-variant">
        {L.by(r?.by?.display_name ?? "—", fmtShort(r?.at ?? a.closed_at))}
        {r?.note ? ` — ${r.note}` : ""}
      </span>
    </div>
  );
}

/** Bảng D15 (01 §10.5): từ `md`; card dưới `md`. CSKH không có cột / nút "Xử lý". */
function ReconTable({
  items,
  tab,
  thresholds,
  onResolve,
}: {
  items: ReconAlert[];
  tab: ReconTab;
  thresholds: RuleThresholds;
  onResolve: ((a: ReconAlert) => void) | null;
}) {
  const showResult = tab !== "OPEN";
  const resolveButton = (a: ReconAlert) =>
    onResolve && a.status === "OPEN" ? (
      <Button
        variant="tonal"
        size="sm"
        aria-label={L.resolveFor(a.package.tracking_number)}
        onClick={() => onResolve(a)}
      >
        {L.resolve}
      </Button>
    ) : null;
  const pkgLink = (a: ReconAlert) => (
    <Link to={`/admin/packages/${a.package.id}`} className="font-mono text-primary hover:underline">
      {a.package.tracking_number}
    </Link>
  );
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="md-table">
          <caption className="sr-only">{L.caption}</caption>
          <thead>
            <tr>
              <th className="pl-4">{L.col.severity}</th>
              <th>{L.col.rule}</th>
              <th>{L.col.package}</th>
              <th>{L.col.warehouse}</th>
              <th>{L.col.platform}</th>
              <th className={!showResult && !onResolve ? "pr-4" : undefined}>{L.col.since}</th>
              {showResult && <th className={onResolve ? undefined : "pr-4"}>{L.col.result}</th>}
              {onResolve && <th className="pr-4">{L.col.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td className="pl-4">
                  <SeverityChip a={a} />
                </td>
                <td>{reconRuleLabel(a.rule, thresholds)}</td>
                <td>{pkgLink(a)}</td>
                <td>
                  <WarehouseCell a={a} />
                </td>
                <td>{platformStatus(a.package.platform_status)}</td>
                <td className="tabular-nums">{since(a)}</td>
                {showResult && (
                  <td>
                    <ResultCell a={a} />
                  </td>
                )}
                {onResolve && <td className="pr-4">{resolveButton(a)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-outline-variant md:hidden" aria-label={L.results}>
        {items.map((a) => (
          <li key={a.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-body-md text-on-surface">{reconRuleLabel(a.rule, thresholds)}</span>
              <SeverityChip a={a} />
            </div>
            <p className="flex flex-wrap gap-x-2 text-body-sm text-on-surface-variant">
              {pkgLink(a)}
              <span>
                <WarehouseCell a={a} /> · {platformStatus(a.package.platform_status)}
              </span>
              <span className="tabular-nums">{since(a)}</span>
            </p>
            {showResult && <ResultCell a={a} />}
            {resolveButton(a) && <div className="mt-1">{resolveButton(a)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * D15 — Lệch trạng thái (01 §10.5 D15, FR-06.01..03, 05, 06; UC-06; API-120, 121, 123): tab Đang mở (số) / Đã xử lý
 * / Tất cả, lọc mức / quy tắc / ngày phát hiện ở URL, bảng / card; "Xử lý" (quyền `recon.resolve` — ADMIN,
 * SUPERVISOR) mở `ResolveAlertDialog`; "Chạy đối soát ngay" (API-123). WS `recon.updated` → invalidate `['recon']`
 * (`useDashboardSocket`) + poll 60 giây dự phòng (02b-admin §4).
 */
export default function ReconPage() {
  const me = useAuth((s) => s.me);
  const thresholds = useRuleThresholds();
  const [params, setParams] = useSearchParams();
  const filters = reconFiltersFromParams(params);
  const api = toApiReconFilters(filters);
  const [resolving, setResolving] = useState<ReconAlert | null>(null);
  const canResolve = hasPermission(me, "recon.resolve");

  const result = useQuery({
    queryKey: ["recon", api],
    queryFn: () => reconApi.list(api),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const run = useMutation({
    mutationFn: reconApi.run,
    onSuccess: () => toast(L.runQueued),
    onError: (err) =>
      toast(
        isApiError(err) && err.code === "RECON_IN_PROGRESS"
          ? L.runBusy
          : isApiError(err)
            ? err.message
            : COPY.generic,
      ),
  });
  const apply = (next: Partial<ReconUrlFilters>) =>
    setParams(paramsFromReconFilters({ ...filters, page: undefined, ...next }));
  const clear = () => setParams(paramsFromReconFilters({ status: filters.status }));

  const data = result.data;
  const open = data ? data.summary.open.HIGH + data.summary.open.MEDIUM + data.summary.open.LOW : null;
  const tabs: [ReconTab, string][] = RECON_TABS.map((t) => [
    t,
    t === "OPEN" && open !== null ? `${L.tab.OPEN} ${open}` : L.tab[t],
  ]);
  const rangeError =
    isApiError(result.error) && result.error.code === "VALIDATION_ERROR" ? L.rangeError : null;

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={L.subtitle}
        actions={
          canResolve ? (
            <Button variant="outlined" icon="sync" disabled={run.isPending} onClick={() => run.mutate()}>
              {L.run}
            </Button>
          ) : undefined
        }
      />
      <Tabs label={L.tabs} items={tabs} value={filters.status} onChange={(status) => apply({ status })} />
      <div className="mb-2 grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          name="recon-severity"
          label={L.severity}
          value={filters.severity ?? ""}
          onChange={(e) => apply({ severity: (e.target.value || undefined) as ReconSeverity | undefined })}
        >
          <option value="">{L.any}</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {RECON_SEVERITY[s][0]}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="recon-rule"
          label={L.rule}
          value={filters.rule ?? ""}
          onChange={(e) => apply({ rule: (e.target.value || undefined) as ReconRule | undefined })}
        >
          <option value="">{L.any}</option>
          {RECON_RULES.map((r) => (
            <option key={r} value={r}>
              {reconRuleLabel(r, thresholds)}
            </option>
          ))}
        </SelectField>
        <TextField
          name="recon-from"
          label={L.from}
          type="date"
          value={filters.from ?? ""}
          max={filters.to}
          onChange={(e) => apply({ from: e.target.value || undefined })}
        />
        <TextField
          name="recon-to"
          label={L.to}
          type="date"
          value={filters.to ?? ""}
          min={filters.from}
          onChange={(e) => apply({ to: e.target.value || undefined })}
        />
      </div>
      {hasReconFilters(filters) && (
        <div className="mb-4">
          <Button variant="text" size="sm" onClick={clear}>
            {L.clear}
          </Button>
        </div>
      )}

      {result.isError && (
        <Alert
          kind="error"
          action={
            rangeError ? undefined : (
              <Button variant="text" onClick={() => result.refetch()}>
                {L.retry}
              </Button>
            )
          }
        >
          {rangeError ?? L.error}
        </Alert>
      )}
      {result.isPending && (
        <div className="card p-4" aria-busy="true" aria-label={L.loading}>
          <Skeleton lines={8} className="h-8" />
        </div>
      )}
      {data && data.total === 0 && !result.isError && (
        <EmptyState
          icon="rule"
          title={
            hasReconFilters(filters) ? L.emptyFiltered : filters.status === "OPEN" ? L.empty : L.emptyOther
          }
          action={
            hasReconFilters(filters) ? (
              <Button variant="tonal" onClick={clear}>
                {L.clear}
              </Button>
            ) : undefined
          }
        />
      )}
      {data && data.total > 0 && !result.isError && (
        <div className="card" aria-busy={result.isFetching}>
          <ReconTable
            items={data.items}
            tab={filters.status}
            thresholds={thresholds}
            onResolve={canResolve ? setResolving : null}
          />
          <Pagination
            page={data.page}
            pageSize={data.page_size || PAGE_SIZE}
            total={data.total}
            onPage={(page) => setParams(paramsFromReconFilters({ ...filters, page }))}
          />
        </div>
      )}
      {resolving && <ResolveAlertDialog alert={resolving} onClose={() => setResolving(null)} />}
    </>
  );
}
