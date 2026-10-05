import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { usersApi, type AuditFilters, type AuditLogItem } from "@/lib/api/users";
import { fmtDateTime } from "@/shared/format";
import { AUDIT_ACTION, AUDIT_OBJECT } from "@/shared/labels";
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  SelectField,
  Skeleton,
  TextField,
} from "@/shared/ui";

import { COPY } from "./copy";

const KEYS = ["user_id", "action", "date_from", "date_to"] as const;
const actionLabel = (a: string) => AUDIT_ACTION[a] ?? a;

function ObjectCell({ row }: { row: AuditLogItem }) {
  if (!row.object_type && !row.object_id) return <>—</>;
  const type = row.object_type ? (AUDIT_OBJECT[row.object_type] ?? row.object_type) : "";
  const id = row.object_id ?? "";
  return (
    <span>
      {type}{" "}
      {id && (
        <span className="font-mono text-on-surface-variant" title={id}>
          {id.length > 12 ? `${id.slice(0, 8)}…` : id}
        </span>
      )}
    </span>
  );
}

/** D10 — Nhật ký thao tác (01 §10.5, FR-10.03; API-92). Bộ lọc ở URL như D3. Chỉ ADMIN. */
export default function AuditPage() {
  const [params, setParams] = useSearchParams();
  const filters: AuditFilters = {
    ...Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? undefined])),
    page: Number(params.get("page") ?? 1) || 1,
  };
  const badRange = Boolean(filters.date_from && filters.date_to && filters.date_from > filters.date_to);
  const filtered = KEYS.some((k) => filters[k]);

  const people = useQuery({ queryKey: ["users", "all"], queryFn: usersApi.all, staleTime: 60_000 });
  const logs = useQuery({
    queryKey: ["audit", filters],
    queryFn: () => usersApi.audit(filters),
    enabled: !badRange,
    placeholderData: (prev) => prev,
  });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  // Khoảng ngày sai: không hiện kết quả của bộ lọc trước (placeholderData) — chỉ lỗi dưới ô (G3 F36).
  const data = badRange ? undefined : logs.data;
  const rows = data?.items ?? [];
  const who = (r: AuditLogItem) => r.user?.display_name ?? COPY.system;

  return (
    <>
      <PageHeader title={COPY.title} subtitle={COPY.subtitle} />
      <div className="mb-2 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          name="user_id"
          label={COPY.user}
          value={filters.user_id ?? ""}
          onChange={(e) => update("user_id", e.target.value)}
        >
          <option value="">{COPY.allUsers}</option>
          {people.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name} ({u.username})
            </option>
          ))}
        </SelectField>
        <SelectField
          name="action"
          label={COPY.action}
          value={filters.action ?? ""}
          onChange={(e) => update("action", e.target.value)}
        >
          <option value="">{COPY.allActions}</option>
          {Object.entries(AUDIT_ACTION).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField
          name="date_from"
          type="date"
          label={COPY.from}
          value={filters.date_from ?? ""}
          onChange={(e) => update("date_from", e.target.value)}
        />
        <TextField
          name="date_to"
          type="date"
          label={COPY.to}
          error={badRange ? COPY.rangeInvalid : undefined}
          value={filters.date_to ?? ""}
          onChange={(e) => update("date_to", e.target.value)}
        />
      </div>
      {filtered && (
        <div className="mb-4">
          <Button variant="text" icon="filter_alt_off" onClick={() => setParams({}, { replace: true })}>
            {COPY.clear}
          </Button>
        </div>
      )}

      {logs.isPending && !badRange && (
        <div className="card p-4">
          <Skeleton lines={8} className="h-8" />
        </div>
      )}
      {logs.isError && !badRange && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => logs.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {COPY.loadError}
        </Alert>
      )}
      {data?.total === 0 && <EmptyState icon="history" title={filtered ? COPY.emptyFiltered : COPY.empty} />}
      {data && data.total > 0 && (
        <div className="card overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="md-table" aria-label={COPY.title}>
              <thead>
                <tr>
                  <th className="pl-4">{COPY.col.at}</th>
                  <th>{COPY.col.user}</th>
                  <th>{COPY.col.action}</th>
                  <th>{COPY.col.object}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.at}-${i}`}>
                    <td className="pl-4 tabular-nums">{fmtDateTime(r.at)}</td>
                    <td>{who(r)}</td>
                    <td>{actionLabel(r.action)}</td>
                    <td>
                      <ObjectCell row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-outline-variant md:hidden" aria-label={COPY.title}>
            {rows.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex flex-col gap-0.5 px-4 py-3">
                <p className="text-title-sm text-on-surface">{actionLabel(r.action)}</p>
                <p className="text-body-sm text-on-surface-variant tabular-nums">
                  {fmtDateTime(r.at)} · {who(r)}
                </p>
                <p className="text-body-sm text-on-surface-variant">
                  <ObjectCell row={r} />
                </p>
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            onPage={(p) => update("page", String(p))}
          />
        </div>
      )}
    </>
  );
}
