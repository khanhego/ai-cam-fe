import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";

import { shouldRetryQuery } from "@/app/queryClient";
import { isApiError } from "@/lib/api/errors";
import { reportsApi, type ReportByTab, type ReportTab } from "@/lib/api/reports";
import type { Role } from "@/lib/api/session";
import { fmtDateTime, vnDay } from "@/shared/format";
import { Alert, Button, LinearProgress, PageHeader, Skeleton, Tabs } from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { ClaimsReportView } from "./ClaimsReportView";
import { ExportCsvButton } from "./ExportCsvButton";
import { ProductivityReportView } from "./ProductivityReportView";
import { REPORT_COPY } from "./reportCopy";
import {
  DEFAULT_REPORT_TAB,
  hasErrors,
  paramsFromReportFilters,
  reportFiltersFromParams,
  toReportQuery,
  validatePeriod,
  type PeriodErrors,
  type ReportUrlFilters,
} from "./reportParams";
import { ReportFilters } from "./ReportFilters";
import { fmtDay } from "./reportFormat";
import { ReturnsReportView } from "./ReturnsReportView";

const C = REPORT_COPY;

/** Tab theo vai (01 §5.10, 02b-admin §7): Năng suất chỉ ADMIN, SUPERVISOR (server vẫn chặn 403). */
const canSeeProductivity = (role: Role | undefined) => role === "ADMIN" || role === "SUPERVISOR";
const tabsFor = (role: Role | undefined): ReportTab[] =>
  canSeeProductivity(role) ? ["returns", "claims", "productivity"] : ["returns", "claims"];

/** `location.state` khi chuyển CSKH từ `tab=productivity` về tab Hàng hoàn (Alert không quyền). */
type ReportsLocationState = { reportForbidden?: boolean } | null;

/** `REPORT_TIMEOUT` (server đã chờ 15 giây) không tự thử lại — người dùng bấm "Thử lại" (02b-admin §8). */
const retryReport = (n: number, e: unknown) =>
  !(isApiError(e) && e.code === "REPORT_TIMEOUT") && shouldRetryQuery(n, e);

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={C.loading}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card flex flex-col gap-2 p-4">
            <Skeleton className="w-24" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="w-28" />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="card p-4">
          <Skeleton lines={5} />
        </div>
      ))}
    </div>
  );
}

function ReportBody({ tab, data, filters }: { tab: ReportTab; data: unknown; filters: ReportUrlFilters }) {
  if (tab === "returns") return <ReturnsReportView data={data as ReportByTab["returns"]} filters={filters} />;
  if (tab === "claims") return <ClaimsReportView data={data as ReportByTab["claims"]} filters={filters} />;
  return <ProductivityReportView data={data as ReportByTab["productivity"]} filters={filters} />;
}

/**
 * D20 Báo cáo (`/admin/reports`, 01 §10.5 D20, UC-15, FR-09.02..07; 02b-admin §3). Bộ lọc + tab trong URL; mỗi tab một
 * query `["report", tab, query]` (`staleTime` 60 giây khớp cache server, đổi lọc giữ số cũ mờ + `LinearProgress`).
 */
export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const me = useAuth((s) => s.me);
  const tabs = tabsFor(me?.role);
  const raw = reportFiltersFromParams(params);
  const denied = raw.tab === "productivity" && Boolean(me) && !canSeeProductivity(me?.role);
  const filters: ReportUrlFilters = tabs.includes(raw.tab) ? raw : { ...raw, tab: DEFAULT_REPORT_TAB };
  const forbiddenAlert = (location.state as ReportsLocationState)?.reportForbidden === true;
  const periodErrors = validatePeriod(filters.from, filters.to);
  const valid = !hasErrors(periodErrors);
  const query = toReportQuery(filters);

  const report = useQuery({
    queryKey: ["report", filters.tab, query],
    queryFn: () => reportsApi.report(filters.tab, query),
    enabled: valid && Boolean(me),
    staleTime: 60_000,
    retry: retryReport,
    // Giữ số cũ (mờ) khi đổi lọc trong cùng tab; đổi tab không giữ (khác shape).
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === filters.tab ? prev : undefined),
  });

  // Bộ lọc Station (chỉ tab Năng suất): API-60 chỉ ADMIN → lấy từ API-32 như D3 (DEC-75), cùng query key.
  const today = vnDay();
  const daily = useQuery({
    queryKey: ["daily", today],
    queryFn: () => reportsApi.daily(today),
    enabled: filters.tab === "productivity",
  });
  const stations =
    filters.tab === "productivity"
      ? (daily.data?.stations.map((s) => ({ id: s.id, name: s.name })) ?? [])
      : undefined;

  const apply = (next: Partial<ReportUrlFilters>) =>
    setParams(paramsFromReportFilters({ ...filters, ...next }));

  if (denied) {
    const next = new URLSearchParams(paramsFromReportFilters({ ...raw, tab: DEFAULT_REPORT_TAB }));
    return (
      <Navigate
        to={{ pathname: location.pathname, search: `?${next}` }}
        replace
        state={{ reportForbidden: true } satisfies ReportsLocationState}
      />
    );
  }

  const serverErrors: PeriodErrors | undefined =
    isApiError(report.error) && report.error.code === "VALIDATION_ERROR"
      ? { from: report.error.fieldErrors.from, to: report.error.fieldErrors.to }
      : undefined;

  let body: ReactNode;
  if (!valid) body = <Alert kind="warning">{C.invalid}</Alert>;
  else if (report.isError && !serverErrors)
    body = (
      <Alert
        kind="error"
        action={
          <Button variant="text" onClick={() => void report.refetch()}>
            {C.retry}
          </Button>
        }
      >
        {C.error}
      </Alert>
    );
  else if (serverErrors) body = <Alert kind="warning">{C.invalid}</Alert>;
  else if (!report.data) body = <LoadingSkeleton />;
  else
    body = (
      <div className="relative">
        {report.isPlaceholderData && (
          <div className="absolute inset-x-0 -top-2">
            <LinearProgress label={C.refreshing} />
          </div>
        )}
        <div className={report.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
          <p className="mb-3 text-body-sm text-on-surface-variant">
            {C.generatedAt(
              `${fmtDay(report.data.period.from)} – ${fmtDay(report.data.period.to)}`,
              fmtDateTime(report.data.generated_at),
            )}
          </p>
          <ReportBody tab={filters.tab} data={report.data} filters={filters} />
        </div>
      </div>
    );

  return (
    <>
      <PageHeader
        title={C.title}
        actions={<ExportCsvButton tab={filters.tab} query={query} disabled={!valid || !report.data} />}
      />
      {forbiddenAlert && (
        <div className="mb-4">
          <Alert kind="warning">{C.forbiddenProductivity}</Alert>
        </div>
      )}
      <Tabs
        label={C.tabsLabel}
        items={tabs.map((t) => [t, C.tab[t]])}
        value={filters.tab}
        onChange={(tab) => apply({ tab })}
      />
      <ReportFilters filters={filters} onChange={apply} serverErrors={serverErrors} stations={stations} />
      {body}
    </>
  );
}
