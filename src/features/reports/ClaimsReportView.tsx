import type { ClaimsReport } from "@/lib/api/reports";
import { PLATFORM_SHORT } from "@/shared/labels";
import { CLAIM_STATUS, CLAIM_TYPE, COUNTERPARTY, fmtVnd } from "@/shared/returns/labels";

import { RateCard } from "./RateCard";
import { REPORT_COPY } from "./reportCopy";
import { fmtPct, num } from "./reportFormat";
import { claimsLink, type ReportUrlFilters } from "./reportParams";
import { ReportTable } from "./ReportTable";
import { SeriesChart } from "./SeriesChart";

const K = REPORT_COPY.claims;

/** Tab Khiếu nại D20 (01 §10.5 D20, FR-09.04, BR-41 / BR-42; API-151): 5 thẻ + 4 bảng; bấm số → D16 đã lọc. */
export function ClaimsReportView({ data, filters }: { data: ClaimsReport; filters: ReportUrlFilters }) {
  const { cards } = data;
  const win = cards.win_rate;
  const sent = cards.submitted_before_deadline;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <RateCard
          label={K.cards.created}
          value={num(cards.created)}
          formula={K.formula.created}
          to={claimsLink(filters, { status: "ALL" })}
        />
        <RateCard
          label={K.cards.winRate}
          value={fmtPct(win.value)}
          detail={win.value == null ? K.emptyRate.winRate : K.detail.winRate(win.numerator, win.denominator)}
          formula={K.formula.winRate}
          to={claimsLink(filters, { status: "WON" })}
        />
        <RateCard
          label={K.cards.recovered}
          value={fmtVnd(cards.recovered_amount).replace(" đ", "\u00a0đ")}
          formula={K.formula.recovered}
        />
        <RateCard
          label={K.cards.beforeDeadline}
          value={fmtPct(sent.value)}
          detail={
            sent.value == null
              ? K.emptyRate.beforeDeadline
              : K.detail.beforeDeadline(sent.numerator, sent.denominator)
          }
          formula={K.formula.beforeDeadline}
        />
        <RateCard
          label={K.cards.overdue}
          value={num(cards.overdue_unsent_now)}
          detail={K.detail.now}
          formula={K.formula.overdue}
          alert={cards.overdue_unsent_now > 0}
          to={claimsLink(filters, { status: "NEW", due: "overdue" })}
        />
      </div>

      <SeriesChart
        title={REPORT_COPY.chart.claims}
        series={data.series}
        granularity={data.series_granularity}
        pick={(p) => p.claims}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportTable
          title={K.sections.byStatus}
          rows={data.by_status}
          rowKey={(r) => r.status}
          rowLink={(r) => claimsLink(filters, { status: r.status })}
          columns={[
            { key: "status", header: K.col.status, cell: (r) => CLAIM_STATUS[r.status]?.[0] ?? r.status },
            { key: "count", header: K.col.count, numeric: true, cell: (r) => num(r.count) },
          ]}
        />
        <ReportTable
          title={K.sections.byType}
          rows={data.by_type_result}
          rowKey={(r) => r.type}
          rowLink={(r) => claimsLink(filters, { status: "ALL", type: r.type })}
          columns={[
            { key: "type", header: K.col.type, cell: (r) => CLAIM_TYPE[r.type] ?? r.type },
            { key: "won", header: K.col.won, numeric: true, cell: (r) => num(r.won) },
            { key: "lost", header: K.col.lost, numeric: true, cell: (r) => num(r.lost) },
            { key: "pending", header: K.col.pending, numeric: true, cell: (r) => num(r.pending) },
          ]}
        />
        <ReportTable
          title={K.sections.byCounterparty}
          rows={data.by_counterparty}
          rowKey={(r) => r.counterparty}
          rowLink={(r) => claimsLink(filters, { status: "ALL", counterparty: r.counterparty })}
          columns={[
            {
              key: "cp",
              header: K.col.counterparty,
              cell: (r) => COUNTERPARTY[r.counterparty] ?? r.counterparty,
            },
            { key: "count", header: K.col.count, numeric: true, cell: (r) => num(r.count) },
            { key: "won", header: K.col.won, numeric: true, cell: (r) => num(r.won) },
            { key: "lost", header: K.col.lost, numeric: true, cell: (r) => num(r.lost) },
            {
              key: "amount",
              header: K.col.recovered,
              numeric: true,
              cell: (r) => fmtVnd(r.recovered_amount),
            },
          ]}
        />
        <ReportTable
          title={K.sections.byShop}
          rows={data.by_shop}
          rowKey={(r) => r.shop_id}
          rowLink={(r) => claimsLink(filters, { status: "ALL", platform: r.platform, shop: r.shop_id })}
          columns={[
            {
              key: "shop",
              header: K.col.shop,
              cell: (r) => `${PLATFORM_SHORT[r.platform]} · ${r.shop_name}`,
            },
            { key: "count", header: K.col.count, numeric: true, cell: (r) => num(r.count) },
            { key: "won", header: K.col.won, numeric: true, cell: (r) => num(r.won) },
            { key: "lost", header: K.col.lost, numeric: true, cell: (r) => num(r.lost) },
            {
              key: "amount",
              header: K.col.recovered,
              numeric: true,
              cell: (r) => fmtVnd(r.recovered_amount),
            },
          ]}
        />
      </div>
    </div>
  );
}
