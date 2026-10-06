import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { reportsApi, type DailyCounts, type DailyReport } from "@/lib/api/reports";
import { fmtDate, vnDay } from "@/shared/format";
import { Alert, Button, PageHeader, Skeleton } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { useRuleThresholds } from "../reconciliation/useRuleThresholds";
import { navFor } from "../shell/nav";
import { AttentionList } from "./AttentionList";
import { COPY } from "./copy";
import { KpiCard } from "./KpiCard";
import { StationStatusList } from "./StationStatusList";

type DayKey = keyof DailyCounts | "label_on_tray" | "cam2_unverified";

/** Link thẻ số → D3 (02b-admin §3 `KpiCard`). Thẻ theo ngày lọc cả `date_from` = `date_to` = ngày đang xem. */
function kpiLink(key: DayKey, date: string): string {
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
    // item 02 (FR-03.14, AC-29): D3 lọc cờ phiên + ngày.
    case "label_on_tray":
      return `/admin/packages?session_flag=LABEL_ON_TRAY&${day}`;
    case "cam2_unverified":
      return `/admin/packages?session_flag=CAM2_UNVERIFIED&${day}`;
  }
}

const KPI_ORDER: DayKey[] = [
  "packed",
  "had_mismatch",
  "abandoned",
  "cancelled",
  "packed_not_handed_over",
  "cancelled_after_pack",
  "label_on_tray",
  "cam2_unverified",
];
const WARN = new Set<DayKey>([
  "had_mismatch",
  "abandoned",
  "cancelled_after_pack",
  "label_on_tray",
  "cam2_unverified",
]);

/**
 * Thẻ hàng hoàn / lệch / hồ sơ (01 §10.5 D2 EXTEND, FR-09.01): "Hoàn đã nhận" theo ngày đang xem (không đếm kiện tạm
 * — số chưa xác định ở dòng phụ), các thẻ còn lại là số hiện tại. Bấm → D14 / D15 / D16 lọc sẵn.
 */
function returnCards(c: DailyReport["counts"]) {
  const otherRecon = c.recon_open.MEDIUM + c.recon_open.LOW;
  const received = [COPY.kpiDetail.issue(c.returns_received_issue)];
  if (c.returns_unidentified > 0) received.push(COPY.kpiDetail.unidentified(c.returns_unidentified));
  return [
    {
      key: "returns_received",
      value: c.returns_received,
      to: "/admin/returns?tab=RECEIVED",
      detail: received.join(" · "),
    },
    { key: "returns_expected", value: c.returns_expected, to: "/admin/returns" },
    { key: "returns_missing", value: c.returns_missing, to: "/admin/returns?tab=MISSING", warn: true },
    {
      key: "recon_open",
      value: c.recon_open.HIGH + otherRecon,
      to: "/admin/recon",
      warn: c.recon_open.HIGH > 0,
      detail: COPY.kpiDetail.recon(c.recon_open.HIGH, otherRecon),
    },
    {
      key: "claims_open",
      value: c.claims_open,
      to: "/admin/claims?status=ALL",
      warn: c.claims_due_soon > 0,
      detail: COPY.kpiDetail.dueSoon(c.claims_due_soon),
    },
  ] as const;
}

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
  const thresholds = useRuleThresholds();
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
            aria-label={COPY.dailySection}
            className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
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
          <section
            aria-label={COPY.returnsSection}
            className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {returnCards(counts)
              .filter((card) => navPaths.has(card.to.split("?")[0]!))
              .map((card) => (
                <KpiCard
                  key={card.key}
                  label={COPY.kpi[card.key]}
                  value={card.value}
                  to={card.to}
                  warn={"warn" in card ? card.warn : false}
                  detail={"detail" in card ? card.detail : undefined}
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
              <AttentionList
                items={data.attention}
                canOpen={(p) => navPaths.has(p)}
                missingDays={thresholds.return_missing_days}
              />
            </section>
          </div>
        </>
      )}
    </>
  );
}
