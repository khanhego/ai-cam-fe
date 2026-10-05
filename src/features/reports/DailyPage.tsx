import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { reportsApi, type DailyCounts } from "@/lib/api/reports";
import { fmtDate, vnDay } from "@/shared/format";
import { Alert, Button, PageHeader, Skeleton } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { navFor } from "../shell/nav";
import { AttentionList } from "./AttentionList";
import { COPY } from "./copy";
import { KpiCard } from "./KpiCard";
import { StationStatusList } from "./StationStatusList";

/** Link thẻ số → D3 (02b-admin §3 `KpiCard`). Thẻ theo ngày lọc cả `date_from` = `date_to` = ngày đang xem. */
function kpiLink(key: keyof DailyCounts, date: string): string {
  const day = `date_from=${date}&date_to=${date}`;
  switch (key) {
    case "packed":
      return `/admin/packages?session_status=COMPLETED&${day}`;
    case "had_mismatch":
      return `/admin/packages?session_flag=HAD_MISMATCH&${day}`;
    case "abandoned":
      return `/admin/packages?session_status=ABANDONED&${day}`;
    case "cancelled":
      return `/admin/packages?session_status=CANCELLED&${day}`;
    case "packed_not_handed_over":
      return "/admin/packages?warehouse_status=PACKED";
    case "cancelled_after_pack":
      return "/admin/packages?warehouse_status=CANCELLED_AFTER_PACK";
  }
}

const KPI_ORDER: (keyof DailyCounts)[] = [
  "packed",
  "had_mismatch",
  "abandoned",
  "cancelled",
  "packed_not_handed_over",
  "cancelled_after_pack",
];
const WARN = new Set<keyof DailyCounts>(["had_mismatch", "abandoned", "cancelled_after_pack"]);

/** D2 — Tổng quan ngày (01 §10.5, FR-09.01). Ngày ở URL `?date=`; tự làm mới qua WS-02 `report.updated`. */
export default function DailyPage() {
  const me = useAuth((s) => s.me)!;
  const [params, setParams] = useSearchParams();
  const today = vnDay();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : today;
  const report = useQuery({
    queryKey: ["daily", date],
    queryFn: () => reportsApi.daily(date),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const navPaths = new Set(navFor(me.role).map((n) => n.to));
  const data = report.data;
  const counts = data?.counts;
  const noSessions =
    counts && counts.packed + counts.had_mismatch + counts.abandoned + counts.cancelled === 0;

  const datePicker = (
    <label className="flex items-center gap-2 text-label-lg text-on-surface-variant">
      {COPY.dateLabel}
      <input
        type="date"
        aria-label={COPY.dateLabel}
        className="md-input md-input-sm w-40"
        value={date}
        max={today}
        onChange={(e) => {
          const v = e.target.value;
          setParams(v && v !== today ? { date: v } : {}, { replace: true });
        }}
      />
    </label>
  );

  return (
    <>
      <PageHeader
        title={COPY.title}
        subtitle={date === today ? COPY.today(fmtDate(date)) : COPY.day(fmtDate(date))}
        actions={datePicker}
      />
      {report.isError && (
        <Alert
          kind="error"
          action={
            <Button variant="text" onClick={() => report.refetch()}>
              {COPY.retry}
            </Button>
          }
        >
          {COPY.error}
        </Alert>
      )}
      {report.isPending && (
        <div aria-busy="true" aria-label="Đang tải">
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {KPI_ORDER.map((k) => (
              <div key={k} className="card p-4">
                <Skeleton lines={2} className="h-6" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <Skeleton lines={3} className="h-8" />
            </div>
            <div className="card p-4">
              <Skeleton lines={3} className="h-8" />
            </div>
          </div>
        </div>
      )}
      {data && counts && (
        <>
          <section
            aria-label="Số liệu ngày"
            className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          >
            {KPI_ORDER.map((k) => (
              <KpiCard
                key={k}
                label={COPY.kpi[k]}
                value={counts[k]}
                to={kpiLink(k, date)}
                warn={WARN.has(k)}
              />
            ))}
          </section>
          {noSessions && (
            <Alert kind="info">
              <span>{COPY.empty}</span>
            </Alert>
          )}
          <div className="grid gap-4 *:min-w-0 lg:grid-cols-2">
            <section className="card p-4" aria-labelledby="d2-stations">
              <h2 id="d2-stations" className="mb-1 text-title-md text-on-surface">
                {COPY.stations}
              </h2>
              <StationStatusList stations={data.stations} />
            </section>
            <section className="card p-4" aria-labelledby="d2-attention">
              <h2 id="d2-attention" className="mb-1 text-title-md text-on-surface">
                {COPY.attention}
              </h2>
              <AttentionList items={data.attention} canOpen={(p) => navPaths.has(p)} />
            </section>
          </div>
        </>
      )}
    </>
  );
}
