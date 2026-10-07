import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { sharesApi, SHARE_LIST_STATUSES, type Share, type ShareListStatus } from "@/lib/api/shares";
import { fmtShort } from "@/shared/format";
import { useScanListener } from "@/shared/scan/useScanListener";
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  SegmentedButtons,
  Skeleton,
  StatusChip,
  Tabs,
  TextField,
} from "@/shared/ui";

import { claimPath } from "../claims/paths";
import { screenReady } from "../shell/nav";
import { LIST } from "./copy";
import {
  hasShareFilters,
  PAGE_SIZE,
  paramsFromShareFilters,
  shareFiltersFromParams,
  toApiShareFilters,
  type ShareUrlFilters,
} from "./filters";
import { ShareActions } from "./ShareActions";
import { ShareExpires, ShareStatusChip } from "./ShareStatus";

/** Nguồn: mã hồ sơ → D17 (khi có), mã kiện → D4. */
function SourceCell({ s }: { s: Share }) {
  const src = s.source;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 font-mono text-body-sm">
      {src.claim_code && src.claim_id && screenReady("D17") ? (
        <Link to={claimPath(src.claim_id)} className="text-primary hover:underline">
          {src.claim_code}
        </Link>
      ) : (
        src.claim_code && <span>{src.claim_code}</span>
      )}
      {src.claim_code && <span aria-hidden="true">·</span>}
      <Link to={`/admin/packages/${src.package_id}`} className="text-primary hover:underline">
        {src.tracking_number}
      </Link>
    </span>
  );
}

/** Bảng D21 từ `md`; card dưới `md` (01 §10.5 D21 "Mobile": nguồn, gửi cho, hạn, trạng thái, 2 nút). */
function ShareTable({ items }: { items: Share[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="md-table">
          <caption className="sr-only">{LIST.caption}</caption>
          <thead>
            <tr>
              <th className="pl-4">{LIST.col.created}</th>
              <th>{LIST.col.creator}</th>
              <th>{LIST.col.recipient}</th>
              <th>{LIST.col.source}</th>
              <th className="text-right">{LIST.col.sessions}</th>
              <th>{LIST.col.expires}</th>
              <th>{LIST.col.status}</th>
              <th className="pr-4">
                <span className="sr-only">{LIST.col.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap pl-4 tabular-nums">{fmtShort(s.created_at)}</td>
                <td>{s.created_by?.display_name ?? "—"}</td>
                <td className="max-w-64 break-words">{s.recipient}</td>
                <td>
                  <SourceCell s={s} />
                </td>
                <td className="text-right tabular-nums">{s.session_count}</td>
                <td className="whitespace-nowrap">
                  <ShareExpires share={s} />
                </td>
                <td>
                  <ShareStatusChip share={s} />
                </td>
                <td className="pr-4">
                  <ShareActions share={s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-outline-variant md:hidden" aria-label={LIST.caption}>
        {items.map((s) => (
          <li key={s.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <SourceCell s={s} />
              <ShareStatusChip share={s} />
            </div>
            <p className="break-words text-body-md text-on-surface">{s.recipient}</p>
            <p className="flex flex-wrap gap-x-2 text-body-sm text-on-surface-variant">
              <span>
                {fmtShort(s.created_at)} · {s.created_by?.display_name ?? "—"}
              </span>
              <span>{LIST.sessionCount(s.session_count)}</span>
              <ShareExpires share={s} prefix />
            </p>
            <ShareActions share={s} />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * D21 — Link chia sẻ (01 §10.5 D21, FR-07.08, 07.09, UC-16 / 17; API-161 / 163): tab trạng thái có số (`counts`), tìm
 * (mã kiện / mã hồ sơ / gửi cho — máy quét được), Người tạo Tất cả / Của tôi, lọc nguồn từ "Xem tất cả" ở D4 / D17
 * (`claim_id` / `package_id`), bảng / card, [Sao chép] (Đang hoạt động) [Thu hồi] (`can_revoke`). Bộ lọc ở URL. WS
 * `share.updated` → invalidate `["shares"]` (`useDashboardSocket`).
 */
export default function SharesPage() {
  const [params, setParams] = useSearchParams();
  const filters = shareFiltersFromParams(params);
  const api = toApiShareFilters(filters);
  const [q, setQ] = useState(filters.q ?? "");
  const [qFor, setQFor] = useState(params.toString());
  if (qFor !== params.toString()) {
    setQFor(params.toString());
    setQ(filters.q ?? "");
  }

  const result = useQuery({
    queryKey: ["shares", api],
    queryFn: () => sharesApi.list(api),
    placeholderData: keepPreviousData,
  });
  const apply = (next: Partial<ShareUrlFilters>) =>
    setParams(paramsFromShareFilters({ ...filters, page: undefined, ...next }));
  const clear = () => setParams(paramsFromShareFilters({ status: filters.status }));
  useScanListener((code) => apply({ q: code }));
  const submitQ = (e: FormEvent) => {
    e.preventDefault();
    apply({ q: q.trim() || undefined });
  };

  const data = result.data;
  const tabs: [ShareListStatus, string][] = SHARE_LIST_STATUSES.map((s) => [
    s,
    data ? `${LIST.tab[s]} ${data.counts[s] ?? 0}` : LIST.tab[s],
  ]);
  const sourceFiltered = Boolean(filters.claim_id || filters.package_id);
  const first = data?.items[0]?.source;
  const sourceLabel = first
    ? filters.claim_id && first.claim_code
      ? first.claim_code
      : first.tracking_number
    : null;

  return (
    <>
      <PageHeader title={LIST.title} subtitle={LIST.subtitle} />
      <Tabs label={LIST.tabs} items={tabs} value={filters.status} onChange={(status) => apply({ status })} />
      <form
        onSubmit={submitQ}
        role="search"
        className="mb-2 flex flex-wrap items-start gap-x-3 [&>*:first-child]:min-w-60 [&>*:first-child]:flex-1"
      >
        <TextField
          name="shares-q"
          label={LIST.q}
          value={q}
          maxLength={64}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mb-5 flex items-center gap-2 pt-2">
          <Button type="submit" variant="tonal">
            {LIST.search}
          </Button>
        </div>
      </form>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-label-lg text-on-surface-variant">{LIST.creator}</span>
        <SegmentedButtons
          label={LIST.creator}
          options={[
            ["all", LIST.creatorAll],
            ["mine", LIST.mine],
          ]}
          value={filters.mine ? "mine" : "all"}
          onChange={(v) => apply({ mine: v === "mine" || undefined })}
        />
        {sourceFiltered && (
          <StatusChip tone="primary" icon="filter_alt">
            {sourceLabel ? LIST.sourceFilter(sourceLabel) : LIST.sourceFilterUnknown}
          </StatusChip>
        )}
        {hasShareFilters(filters) && (
          <Button variant="text" size="sm" onClick={clear}>
            {LIST.clear}
          </Button>
        )}
      </div>

      {result.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => void result.refetch()}>
              {LIST.retry}
            </Button>
          }
        >
          {LIST.error}
        </Alert>
      )}
      {result.isPending && (
        <div className="card p-4" aria-busy="true" aria-label={LIST.loading}>
          <Skeleton lines={8} className="h-8" />
        </div>
      )}
      {data && data.total === 0 && !result.isError && (
        <EmptyState
          icon="link"
          title={
            hasShareFilters(filters) ? LIST.emptyFiltered : data.counts.ALL > 0 ? LIST.emptyTab : LIST.empty
          }
          action={
            hasShareFilters(filters) ? (
              <Button variant="tonal" onClick={clear}>
                {LIST.clear}
              </Button>
            ) : undefined
          }
        >
          {hasShareFilters(filters) || data.counts.ALL > 0 ? undefined : LIST.emptyHint}
        </EmptyState>
      )}
      {data && data.total > 0 && !result.isError && (
        <div className="card" aria-busy={result.isFetching}>
          <ShareTable items={data.items} />
          <Pagination
            page={data.page}
            pageSize={data.page_size || PAGE_SIZE}
            total={data.total}
            onPage={(page) => setParams(paramsFromShareFilters({ ...filters, page }))}
          />
        </div>
      )}
    </>
  );
}
