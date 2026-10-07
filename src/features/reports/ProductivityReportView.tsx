import type { OperatorProductivity, ProductivityReport } from "@/lib/api/reports";

import { RateCard } from "./RateCard";
import { REPORT_COPY } from "./reportCopy";
import { fmtPct, fmtSeconds, nullNameLast, num } from "./reportFormat";
import { packagesLink, type ReportUrlFilters } from "./reportParams";
import { ReportTable, type Column } from "./ReportTable";

const P = REPORT_COPY.productivity;

const name = (n: string | null) => n ?? REPORT_COPY.noName;

type PackRow = Omit<OperatorProductivity, "operator_name">;
const packColumns = <T extends PackRow>(): Column<T>[] => [
  { key: "packed", header: P.col.packed, numeric: true, cell: (r) => num(r.packed) },
  { key: "avg", header: P.col.avg, numeric: true, cell: (r) => fmtSeconds(r.avg_seconds) },
  { key: "mismatch", header: P.col.mismatch, numeric: true, cell: (r) => num(r.mismatch) },
  { key: "abandoned", header: P.col.abandoned, numeric: true, cell: (r) => num(r.abandoned) },
  { key: "cancelled", header: P.col.cancelled, numeric: true, cell: (r) => num(r.cancelled) },
  { key: "repacked", header: P.col.repacked, numeric: true, cell: (r) => num(r.repacked) },
];

/**
 * Tab Năng suất D20 (01 §10.5 D20, FR-09.02, FR-03.16, BR-41; API-152 — chỉ ADMIN, SUPERVISOR): 4 thẻ + 3 bảng;
 * thẻ / dòng station → D3 đã lọc (kỳ ≤ 92 ngày — DEC-612).
 */
export function ProductivityReportView({
  data,
  filters,
}: {
  data: ProductivityReport;
  filters: ReportUrlFilters;
}) {
  const { cards } = data;
  const station = filters.station ?? undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <RateCard
          label={P.cards.packed}
          value={num(cards.packed)}
          formula={P.formula.packed}
          to={packagesLink(filters, {
            session_type: "PACK",
            session_status: "COMPLETED",
            station_id: station,
          })}
        />
        <RateCard
          label={P.cards.packAvg}
          value={fmtSeconds(cards.pack_avg_seconds)}
          formula={P.formula.packAvg}
        />
        <RateCard
          label={P.cards.inspected}
          value={num(cards.returns_inspected)}
          formula={P.formula.inspected}
          to={packagesLink(filters, {
            session_type: "RETURN",
            session_status: "COMPLETED",
            station_id: station,
          })}
        />
        <RateCard
          label={P.cards.returnAvg}
          value={fmtSeconds(cards.return_avg_seconds)}
          formula={P.formula.returnAvg}
        />
      </div>

      <ReportTable
        title={P.sections.byStation}
        rows={data.by_station}
        rowKey={(r) => r.station_id}
        rowLink={(r) => packagesLink(filters, { session_type: "PACK", station_id: r.station_id })}
        columns={[{ key: "station", header: P.col.station, cell: (r) => r.station_name }, ...packColumns()]}
      />
      <ReportTable
        title={P.sections.byOperator}
        rows={nullNameLast(data.by_operator)}
        rowKey={(r, i) => r.operator_name ?? `none-${i}`}
        columns={[
          { key: "name", header: P.col.operator, cell: (r) => name(r.operator_name) },
          ...packColumns(),
        ]}
      />
      <ReportTable
        title={P.sections.returnByOperator}
        rows={nullNameLast(data.return_by_operator)}
        rowKey={(r, i) => r.operator_name ?? `none-${i}`}
        columns={[
          { key: "name", header: P.col.inspector, cell: (r) => name(r.operator_name) },
          { key: "inspected", header: P.col.inspected, numeric: true, cell: (r) => num(r.inspected) },
          { key: "avg", header: P.col.avg, numeric: true, cell: (r) => fmtSeconds(r.avg_seconds) },
          {
            key: "issue",
            header: P.col.issue,
            numeric: true,
            cell: (r) =>
              r.issue_rate.value == null
                ? "—"
                : `${fmtPct(r.issue_rate.value)} (${num(r.issue_rate.numerator)} / ${num(r.issue_rate.denominator)})`,
          },
        ]}
      />
    </div>
  );
}
