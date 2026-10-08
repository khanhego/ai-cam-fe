import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type MouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { hasPermission } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/errors";
import { returnsApi, RETURN_TABS, type ReturnListItem, type ReturnTab } from "@/lib/api/returns";
import { PlatformFilter } from "@/shared/filters/PlatformFilter";
import { ShopChip } from "@/shared/filters/ShopChip";
import { fmtDate } from "@/shared/format";
import { CONCLUSION_LABEL, RETURN_CASE_STATUS, RETURN_KIND, RETURN_TAB } from "@/shared/returns/labels";
import type { ReturnKind } from "@/shared/returns/types";
import { useScanListener } from "@/shared/scan/useScanListener";
import { DueCountdown } from "@/shared/time/DueCountdown";
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
} from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { useRuleThresholds } from "../reconciliation/useRuleThresholds";
import { CreateClaimDialog } from "../claims/CreateClaimDialog";
import { claimPath } from "../claims/paths";
import { screenReady } from "../shell/nav";
import { COPY } from "./copy";
import {
  hasReturnFilters,
  PAGE_SIZE,
  paramsFromReturnFilters,
  returnFiltersFromParams,
  toApiReturnFilters,
  type ReturnUrlFilters,
} from "./filters";
import { LinkOrderDialog } from "./LinkOrderDialog";

const L = COPY.list;
/** Cột "Chờ" chỉ có nghĩa với kiện chưa về (01 §10.5 D14); "Kết luận" chỉ khi đã kiểm. */
const WAITING_TABS = new Set<ReturnTab>(["EXPECTED", "MISSING", "ALL"]);
const CONCLUSION_TABS = new Set<ReturnTab>(["RECEIVED", "UNIDENTIFIED", "ALL"]);

const packagePath = (rc: ReturnListItem) => (rc.packages[0] ? `/admin/packages/${rc.packages[0].id}` : null);

function StatusCell({ rc }: { rc: ReturnListItem }) {
  const [label, tone] = RETURN_CASE_STATUS[rc.status];
  return (
    <StatusChip tone={tone} icon={rc.status === "MISSING" ? "warning" : undefined}>
      {label}
    </StatusChip>
  );
}

function KindCell({ rc }: { rc: ReturnListItem }) {
  return <>{RETURN_KIND[rc.kind][0]}</>;
}

function TrackingCell({ rc }: { rc: ReturnListItem }) {
  const first = rc.packages[0];
  const path = packagePath(rc);
  return (
    <div className="flex flex-col">
      <span className="flex flex-wrap items-baseline gap-x-1">
        {first && path ? (
          <Link
            to={path}
            aria-label={L.open(first.tracking_number)}
            className="font-mono text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {first.tracking_number}
          </Link>
        ) : (
          "—"
        )}
        {rc.packages.length > 1 && (
          <span className="text-body-sm text-on-surface-variant">{L.packages(rc.packages.length)}</span>
        )}
      </span>
      {rc.return_tracking_number && (
        <span className="font-mono text-body-sm text-on-surface-variant">
          {L.returnTracking(rc.return_tracking_number)}
        </span>
      )}
    </div>
  );
}

function ClaimLinks({ rc }: { rc: ReturnListItem }) {
  if (rc.claims.length === 0) return <>—</>;
  const d17 = screenReady("D17");
  return (
    <span className="flex flex-wrap gap-x-2">
      {rc.claims.map((c) =>
        d17 ? (
          <Link
            key={c.id}
            to={claimPath(c.id)}
            className="font-mono text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {c.code}
          </Link>
        ) : (
          <span key={c.id} className="font-mono">
            {c.code}
          </span>
        ),
      )}
    </span>
  );
}

/**
 * Tab Chỉ hoàn tiền (item 03, 01 §10.5 D14): cột "Hồ sơ khiếu nại" = hồ sơ chưa đóng mới nhất của đơn (`claim`, API-110)
 * hoặc nút "Tạo hồ sơ khiếu nại" (quyền `claims.manage`).
 */
function RefundClaimCell({ rc, action }: { rc: ReturnListItem; action: RowAction }) {
  if (rc.claim) {
    return screenReady("D17") ? (
      <Link
        to={claimPath(rc.claim.id)}
        className="font-mono text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {rc.claim.code}
      </Link>
    ) : (
      <span className="font-mono">{rc.claim.code}</span>
    );
  }
  return action ? <ActionButton action={action} rc={rc} /> : <>—</>;
}

type RowAction = { label: string; icon: string; run: (rc: ReturnListItem) => void } | null;

function ActionButton({ action, rc }: { action: RowAction; rc: ReturnListItem }) {
  if (!action) return null;
  return (
    <Button
      variant="tonal"
      size="sm"
      icon={action.icon}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        action.run(rc);
      }}
    >
      {action.label}
    </Button>
  );
}

/** Bảng D14 (01 §10.5): từ `md`; card dưới `md` (không cuộn ngang ở 360px). Bấm dòng → D4 kiện đầu. */
function ReturnTable({
  items,
  tab,
  action: rowAction,
  defaultHours,
}: {
  items: ReturnListItem[];
  tab: ReturnTab;
  action: RowAction;
  defaultHours?: number;
}) {
  const navigate = useNavigate();
  const showWaiting = WAITING_TABS.has(tab);
  const showConclusion = CONCLUSION_TABS.has(tab);
  /** Tab Chỉ hoàn tiền: cột Hạn phản hồi + Hồ sơ khiếu nại (gộp nút Tạo) thay cột Thao tác. */
  const refund = tab === "NO_PARCEL";
  const action = refund ? null : rowAction;
  const due = (rc: ReturnListItem) => (
    <DueCountdown dueAt={rc.response_due_at} source={rc.response_due_source} defaultHours={defaultHours} />
  );
  const open = (rc: ReturnListItem) => {
    const path = packagePath(rc);
    if (path) navigate(path);
  };
  const waiting = (rc: ReturnListItem) => (rc.waiting_days == null ? "—" : L.waitingDays(rc.waiting_days));
  const conclusion = (rc: ReturnListItem) => (rc.conclusion ? CONCLUSION_LABEL[rc.conclusion] : "—");
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="md-table">
          <caption className="sr-only">{L.caption}</caption>
          <thead>
            <tr>
              <th className="pl-4">{L.col.order}</th>
              <th>{L.col.tracking}</th>
              <th>{L.col.shop}</th>
              <th>{L.col.kind}</th>
              <th>{L.col.reason}</th>
              <th>{L.col.reported}</th>
              {refund && <th>{L.col.due}</th>}
              {showWaiting && <th>{L.col.waiting}</th>}
              <th>{L.col.status}</th>
              {showConclusion && <th>{L.col.conclusion}</th>}
              <th className={action ? undefined : "pr-4"}>{L.col.claims}</th>
              {action && <th className="pr-4">{L.col.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((rc) => (
              <tr key={rc.id} className="state-layer cursor-pointer" onClick={() => open(rc)}>
                <td className="pl-4 font-mono">{rc.order?.platform_order_sn ?? L.noOrder}</td>
                <td>
                  <TrackingCell rc={rc} />
                </td>
                <td>
                  <ShopChip platform={rc.platform} shop={rc.shop} />
                </td>
                <td>
                  <KindCell rc={rc} />
                </td>
                <td>{rc.reason_label ?? "—"}</td>
                <td className="tabular-nums">{fmtDate(rc.reported_at)}</td>
                {refund && <td>{due(rc)}</td>}
                {showWaiting && <td className="tabular-nums">{waiting(rc)}</td>}
                <td>
                  <StatusCell rc={rc} />
                </td>
                {showConclusion && <td>{conclusion(rc)}</td>}
                <td className={action ? undefined : "pr-4"}>
                  {refund ? <RefundClaimCell rc={rc} action={rowAction} /> : <ClaimLinks rc={rc} />}
                </td>
                {action && (
                  <td className="pr-4">
                    <ActionButton action={action} rc={rc} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-outline-variant md:hidden" aria-label={L.results}>
        {items.map((rc) => (
          <li key={rc.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-title-sm text-on-surface">
                {rc.order?.platform_order_sn ?? L.noOrder}
              </span>
              <StatusCell rc={rc} />
            </div>
            <p className="flex flex-wrap items-center gap-x-1 text-body-md text-on-surface">
              <ShopChip platform={rc.platform} shop={rc.shop} />
              <KindCell rc={rc} />
              {rc.waiting_days != null && ` · ${L.waitingDays(rc.waiting_days)}`}
            </p>
            <TrackingCell rc={rc} />
            {refund && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-sm text-on-surface-variant">{L.col.due}:</span>
                {due(rc)}
              </div>
            )}
            {refund && (
              <div className="mt-1">
                <RefundClaimCell rc={rc} action={rowAction} />
              </div>
            )}
            {action && (
              <div className="mt-1">
                <ActionButton action={action} rc={rc} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * D14 — Hàng hoàn (01 §10.5 D14, FR-05.05, 05.11, 05.12, 04.13; API-110): tab có số (`tab_counts`), lọc loại / mã
 * (máy quét được) / ngày sàn báo, bảng / card; tab "Chỉ hoàn tiền" → "Tạo hồ sơ khiếu nại" mỗi dòng, tab "Chưa xác
 * định" → "Gắn đơn" (quyền `returns.link`). Bộ lọc ở URL; WS `return.updated` → invalidate `['returns']`
 * (`useDashboardSocket`, ≤ 1 lần / 2 giây).
 */
export default function ReturnsPage() {
  const me = useAuth((s) => s.me);
  const [params, setParams] = useSearchParams();
  const filters = returnFiltersFromParams(params);
  const api = toApiReturnFilters(filters);
  const [claimFor, setClaimFor] = useState<ReturnListItem | null>(null);
  const [linkFor, setLinkFor] = useState<ReturnListItem | null>(null);
  const [q, setQ] = useState(filters.q ?? "");
  const [qFor, setQFor] = useState(params.toString());
  // URL đổi từ ngoài (Back, thẻ D2) → ô tìm theo URL.
  if (qFor !== params.toString()) {
    setQFor(params.toString());
    setQ(filters.q ?? "");
  }

  const thresholds = useRuleThresholds();
  const result = useQuery({
    queryKey: ["returns", api],
    queryFn: () => returnsApi.list(api),
    placeholderData: keepPreviousData,
  });
  const apply = (next: Partial<ReturnUrlFilters>) =>
    setParams(paramsFromReturnFilters({ ...filters, page: undefined, ...next }));
  const clear = () => setParams(paramsFromReturnFilters({ tab: filters.tab }));
  useScanListener((code) => apply({ q: code }));

  const data = result.data;
  const counts = data?.tab_counts;
  const tabs: [ReturnTab, string][] = RETURN_TABS.map((t) => [
    t,
    t !== "ALL" && counts ? `${RETURN_TAB[t]} ${counts[t] ?? 0}` : RETURN_TAB[t],
  ]);
  const action: RowAction =
    filters.tab === "NO_PARCEL" && hasPermission(me, "claims.manage")
      ? { label: L.createClaim, icon: "gavel", run: setClaimFor }
      : filters.tab === "UNIDENTIFIED" && hasPermission(me, "returns.link")
        ? { label: L.link, icon: "link", run: setLinkFor }
        : null;
  const rangeError =
    isApiError(result.error) && result.error.code === "VALIDATION_ERROR" ? L.rangeError : null;
  const submitQ = (e: FormEvent) => {
    e.preventDefault();
    apply({ q: q.trim() || undefined });
  };

  return (
    <>
      <PageHeader title={L.title} subtitle={L.subtitle} />
      <Tabs label={L.tabs} items={tabs} value={filters.tab} onChange={(tab) => apply({ tab })} />
      <form
        onSubmit={submitQ}
        className="mb-2 grid gap-x-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto]"
        role="search"
      >
        <TextField
          name="returns-q"
          label={L.q}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={64}
        />
        <SelectField
          name="returns-kind"
          label={L.kind}
          value={filters.kind ?? ""}
          onChange={(e) => apply({ kind: (e.target.value || undefined) as ReturnKind | undefined })}
        >
          <option value="">{L.any}</option>
          {(Object.keys(RETURN_KIND) as ReturnKind[]).map((k) => (
            <option key={k} value={k}>
              {RETURN_KIND[k][0]}
            </option>
          ))}
        </SelectField>
        <TextField
          name="returns-from"
          label={L.from}
          type="date"
          value={filters.from ?? ""}
          max={filters.to}
          onChange={(e) => apply({ from: e.target.value || undefined })}
        />
        <TextField
          name="returns-to"
          label={L.to}
          type="date"
          value={filters.to ?? ""}
          min={filters.from}
          onChange={(e) => apply({ to: e.target.value || undefined })}
        />
        <PlatformFilter
          idPrefix="d14"
          platform={filters.platform ?? null}
          shopId={filters.shop ?? null}
          onChange={(v) => apply({ platform: v.platform, shop: v.shopId })}
        />
        <div className="mb-5 flex items-center gap-2">
          <Button type="submit" variant="tonal">
            {L.search}
          </Button>
        </div>
      </form>
      {(filters.tab === "NO_PARCEL" || hasReturnFilters(filters)) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {filters.tab === "NO_PARCEL" && (
            <button
              type="button"
              aria-pressed={Boolean(filters.pendingOnly)}
              className="state-layer rounded-sm"
              onClick={() => apply({ pendingOnly: !filters.pendingOnly })}
            >
              <StatusChip
                tone={filters.pendingOnly ? "primary" : "neutral"}
                icon={filters.pendingOnly ? "check" : "filter_list"}
              >
                {L.pendingOnly}
              </StatusChip>
            </button>
          )}
          {hasReturnFilters(filters) && (
            <Button variant="text" size="sm" onClick={clear}>
              {L.clear}
            </Button>
          )}
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
          icon="assignment_return"
          title={hasReturnFilters(filters) ? L.emptyFiltered : L.empty[filters.tab]}
          action={
            hasReturnFilters(filters) ? (
              <Button variant="tonal" onClick={clear}>
                {L.clear}
              </Button>
            ) : undefined
          }
        />
      )}
      {data && data.total > 0 && !result.isError && (
        <div className="card" aria-busy={result.isFetching}>
          <ReturnTable
            items={data.items}
            tab={filters.tab}
            action={action}
            defaultHours={thresholds.refund_only_default_hours}
          />
          <Pagination
            page={data.page}
            pageSize={data.page_size || PAGE_SIZE}
            total={data.total}
            onPage={(page) => setParams(paramsFromReturnFilters({ ...filters, page }))}
          />
        </div>
      )}
      {claimFor && claimFor.packages[0] && (
        <CreateClaimDialog
          packageId={claimFor.packages[0].id}
          returnCaseId={claimFor.id}
          onClose={() => setClaimFor(null)}
        />
      )}
      {linkFor && <LinkOrderDialog returnCase={linkFor} onClose={() => setLinkFor(null)} />}
    </>
  );
}
