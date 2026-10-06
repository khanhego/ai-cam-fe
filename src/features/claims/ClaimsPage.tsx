import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  claimsApi,
  CLAIM_STATUSES,
  type ClaimListItem,
  type ClaimType,
  type Counterparty,
} from "@/lib/api/claims";
import { fmtShort } from "@/shared/format";
import { CLAIM_SOURCE, CLAIM_STATUS, CLAIM_TYPE, COUNTERPARTY } from "@/shared/returns/labels";
import { useScanListener } from "@/shared/scan/useScanListener";
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
  TrackingNumber,
} from "@/shared/ui";

import { screenReady } from "../shell/nav";
import { COPY } from "./copy";
import { CreateClaimDialog } from "./CreateClaimDialog";
import { Deadline } from "./Deadline";
import {
  claimFiltersFromParams,
  hasClaimFilters,
  PAGE_SIZE,
  paramsFromClaimFilters,
  toApiClaimFilters,
  type ClaimTab,
  type ClaimUrlFilters,
} from "./filters";
import { claimPath } from "./paths";

const L = COPY.list;
const ACTIVE = new Set(["NEW", "SUBMITTED", "WAITING"]);

function CodeCell({ c }: { c: ClaimListItem }) {
  return screenReady("D17") ? (
    <Link to={claimPath(c.id)} className="font-mono text-primary hover:underline">
      {c.code}
    </Link>
  ) : (
    <span className="font-mono">{c.code}</span>
  );
}

function StatusCell({ c }: { c: ClaimListItem }) {
  const [label, tone] = CLAIM_STATUS[c.status];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

/** Bảng D16 (01 §10.5): từ `md`; card dưới `md` (không cuộn ngang ở 360px). */
function ClaimTable({ items }: { items: ClaimListItem[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="md-table">
          <caption className="sr-only">{L.caption}</caption>
          <thead>
            <tr>
              <th className="pl-4">{COPY.col.code}</th>
              <th>{COPY.col.package}</th>
              <th>{COPY.col.type}</th>
              <th>{COPY.col.counterparty}</th>
              <th>{COPY.col.status}</th>
              <th>{COPY.col.owner}</th>
              <th>{COPY.col.deadline}</th>
              <th>{COPY.col.created}</th>
              <th className="pr-4">{COPY.col.source}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td className="pl-4">
                  <CodeCell c={c} />
                </td>
                <td>
                  <TrackingNumber value={c.package.tracking_number} to={`/admin/packages/${c.package.id}`} />
                </td>
                <td>{CLAIM_TYPE[c.type]}</td>
                <td>{COUNTERPARTY[c.counterparty]}</td>
                <td>
                  <StatusCell c={c} />
                </td>
                <td>{c.owner?.display_name ?? COPY.noOwner}</td>
                <td>
                  <Deadline at={c.deadline_at} active={ACTIVE.has(c.status)} dueSoon={c.due_soon} />
                </td>
                <td className="tabular-nums">{fmtShort(c.created_at)}</td>
                <td className="pr-4">{CLAIM_SOURCE[c.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-outline-variant md:hidden" aria-label={L.results}>
        {items.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <CodeCell c={c} />
              <StatusCell c={c} />
            </div>
            <p className="text-body-md text-on-surface">
              {CLAIM_TYPE[c.type]} · {COUNTERPARTY[c.counterparty]}
            </p>
            <p className="flex flex-wrap gap-x-2 text-body-sm text-on-surface-variant">
              <span className="font-mono">{c.package.tracking_number}</span>
              <Deadline at={c.deadline_at} active={ACTIVE.has(c.status)} dueSoon={c.due_soon} />
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * D16 — Hồ sơ khiếu nại (01 §10.5, FR-08.01, 08.03, 08.04, UC-04): tab trạng thái có số (`status_counts`), lọc loại /
 * bên nhận / "Của tôi" / hạn / mã (máy quét được), bảng / card, "Tạo hồ sơ" (Dialog nhập mã kiện). Bộ lọc ở URL.
 * WS `claim.updated` → invalidate `['claims']` (`useDashboardSocket`).
 */
export default function ClaimsPage() {
  const [params, setParams] = useSearchParams();
  const filters = claimFiltersFromParams(params);
  const api = toApiClaimFilters(filters);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState(filters.q ?? "");
  const [qFor, setQFor] = useState(params.toString());
  // URL đổi từ ngoài (Back, thẻ D2) → ô tìm theo URL.
  if (qFor !== params.toString()) {
    setQFor(params.toString());
    setQ(filters.q ?? "");
  }

  const result = useQuery({
    queryKey: ["claims", api],
    queryFn: () => claimsApi.list(api),
    placeholderData: keepPreviousData,
  });
  const apply = (next: Partial<ClaimUrlFilters>) =>
    setParams(paramsFromClaimFilters({ ...filters, page: undefined, ...next }));
  const clear = () => setParams(paramsFromClaimFilters({ status: filters.status }));
  useScanListener((code) => apply({ q: code }));

  const data = result.data;
  const counts = data?.status_counts;
  const tabs: [ClaimTab, string][] = [
    ...CLAIM_STATUSES.map((s): [ClaimTab, string] => [
      s,
      counts ? `${CLAIM_STATUS[s][0]} ${counts[s] ?? 0}` : CLAIM_STATUS[s][0],
    ]),
    ["ALL", L.all],
  ];
  const submitQ = (e: FormEvent) => {
    e.preventDefault();
    apply({ q: q.trim() || undefined });
  };

  return (
    <>
      <PageHeader
        title={L.title}
        subtitle={L.subtitle}
        actions={
          <Button icon="add" onClick={() => setCreating(true)}>
            {L.create}
          </Button>
        }
      />
      <Tabs label={L.tabs} items={tabs} value={filters.status} onChange={(status) => apply({ status })} />
      <form
        onSubmit={submitQ}
        className="mb-2 grid gap-x-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]"
        role="search"
      >
        <TextField
          name="claims-q"
          label={L.q}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={64}
        />
        <SelectField
          name="claims-type"
          label={L.type}
          value={filters.type ?? ""}
          onChange={(e) => apply({ type: (e.target.value || undefined) as ClaimType | undefined })}
        >
          <option value="">{L.any}</option>
          {(Object.keys(CLAIM_TYPE) as ClaimType[]).map((t) => (
            <option key={t} value={t}>
              {CLAIM_TYPE[t]}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="claims-counterparty"
          label={L.counterparty}
          value={filters.counterparty ?? ""}
          onChange={(e) => apply({ counterparty: (e.target.value || undefined) as Counterparty | undefined })}
        >
          <option value="">{L.any}</option>
          {(Object.keys(COUNTERPARTY) as Counterparty[]).map((c) => (
            <option key={c} value={c}>
              {COUNTERPARTY[c]}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="claims-due"
          label={L.due}
          value={filters.due ?? ""}
          onChange={(e) => apply({ due: (e.target.value || undefined) as "soon" | "overdue" | undefined })}
        >
          <option value="">{L.any}</option>
          <option value="soon">{L.dueSoon}</option>
          <option value="overdue">{L.overdue}</option>
        </SelectField>
        <div className="mb-5 flex items-center gap-2">
          <Button type="submit" variant="tonal">
            {L.search}
          </Button>
        </div>
      </form>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-body-md text-on-surface">
          <input
            type="checkbox"
            checked={filters.owner === "me"}
            onChange={(e) => apply({ owner: e.target.checked ? "me" : undefined })}
          />
          {L.mine}
        </label>
        {hasClaimFilters(filters) && (
          <Button variant="text" size="sm" onClick={clear}>
            {L.clear}
          </Button>
        )}
      </div>

      {result.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => result.refetch()}>
              {L.retry}
            </Button>
          }
        >
          {L.error}
        </Alert>
      )}
      {result.isPending && (
        <div className="card p-4" aria-busy="true" aria-label={L.loading}>
          <Skeleton lines={8} className="h-8" />
        </div>
      )}
      {data && data.total === 0 && !result.isError && (
        <EmptyState
          icon="gavel"
          title={hasClaimFilters(filters) ? L.emptyFiltered : L.empty}
          action={
            hasClaimFilters(filters) ? (
              <Button variant="tonal" onClick={clear}>
                {L.clear}
              </Button>
            ) : (
              <Button variant="tonal" icon="add" onClick={() => setCreating(true)}>
                {L.create}
              </Button>
            )
          }
        />
      )}
      {data && data.total > 0 && !result.isError && (
        <div className="card" aria-busy={result.isFetching}>
          <ClaimTable items={data.items} />
          <Pagination
            page={data.page}
            pageSize={data.page_size || PAGE_SIZE}
            total={data.total}
            onPage={(page) => setParams(paramsFromClaimFilters({ ...filters, page }))}
          />
        </div>
      )}
      {creating && <CreateClaimDialog onClose={() => setCreating(false)} />}
    </>
  );
}
