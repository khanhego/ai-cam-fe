import type { ReturnsReport } from "@/lib/api/reports";
import { PLATFORM_SHORT } from "@/shared/labels";
import { CONCLUSION_LABEL, RETURN_KIND } from "@/shared/returns/labels";

import { RateCard } from "./RateCard";
import { REPORT_COPY } from "./reportCopy";
import { returnsLink, type ReportUrlFilters } from "./reportParams";
import { fmtPct, num } from "./reportFormat";
import { ReportTable } from "./ReportTable";
import { SeriesChart } from "./SeriesChart";

const R = REPORT_COPY.returns;

/** Tab Hàng hoàn D20 (01 §10.5 D20, FR-09.03, BR-41; API-150): 4 thẻ + 4 bảng; bấm số → D14 đã lọc (DEC-488). */
export function ReturnsReportView({ data, filters }: { data: ReturnsReport; filters: ReportUrlFilters }) {
  const { cards } = data;
  const rr = cards.return_rate;
  const ir = cards.issue_rate;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <RateCard
          label={R.cards.returnRate}
          value={fmtPct(rr.value)}
          detail={
            rr.value == null ? R.emptyRate.returnRate : R.detail.returnRate(rr.numerator, rr.denominator)
          }
          formula={R.formula.returnRate}
          to={returnsLink(filters, { tab: "ALL" })}
        />
        <RateCard
          label={R.cards.issueRate}
          value={fmtPct(ir.value)}
          detail={ir.value == null ? R.emptyRate.issueRate : R.detail.issueRate(ir.numerator, ir.denominator)}
          formula={R.formula.issueRate}
          to={returnsLink(filters, { tab: "RECEIVED" })}
        />
        <RateCard
          label={R.cards.refundOnly}
          value={num(cards.refund_only.count)}
          detail={
            cards.refund_only.rate_of_handed_over == null
              ? R.emptyRate.refundOnly
              : R.detail.refundOnly(fmtPct(cards.refund_only.rate_of_handed_over))
          }
          formula={R.formula.refundOnly}
          to={returnsLink(filters, { tab: "NO_PARCEL" })}
        />
        <RateCard
          label={R.cards.expected}
          value={num(cards.expected_now)}
          detail={R.detail.expected}
          formula={R.formula.expected}
          to={returnsLink(filters, { tab: "EXPECTED", period: false })}
        />
      </div>

      <SeriesChart
        title={REPORT_COPY.chart.returns}
        series={data.series}
        granularity={data.series_granularity}
        pick={(p) => p.return_cases}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ReportTable
          title={R.sections.byKind}
          rows={data.by_kind}
          rowKey={(r) => r.kind}
          rowLink={(r) => returnsLink(filters, { tab: "ALL", kind: r.kind })}
          columns={[
            { key: "kind", header: R.col.kind, cell: (r) => RETURN_KIND[r.kind]?.[0] ?? r.kind },
            { key: "count", header: R.col.count, numeric: true, cell: (r) => num(r.count) },
            {
              key: "share",
              header: R.col.share,
              numeric: true,
              cell: (r) => (r.share == null ? "" : fmtPct(r.share)),
            },
          ]}
        />
        <ReportTable
          title={R.sections.reason}
          rows={data.reason_by_conclusion.rows}
          rowKey={(r, i) => r.reason ?? `none-${i}`}
          columns={[
            {
              key: "reason",
              header: R.col.reason,
              cell: (r) => r.reason_label ?? r.reason ?? REPORT_COPY.noReason,
            },
            ...data.reason_by_conclusion.conclusions.map((c) => ({
              key: c,
              header: CONCLUSION_LABEL[c] ?? c,
              numeric: true,
              cell: (r: (typeof data.reason_by_conclusion.rows)[number]) => num(r.counts[c] ?? 0),
            })),
            { key: "total", header: R.col.total, numeric: true, cell: (r) => num(r.total) },
          ]}
        />
      </div>

      <ReportTable
        title={R.sections.top}
        rows={data.top_products}
        rowKey={(r, i) => r.sku ?? `${r.product_name}|${r.variation ?? ""}|${i}`}
        columns={[
          {
            key: "product",
            header: R.col.product,
            cell: (r) => (
              <span className="flex flex-col">
                <span>{r.product_name}</span>
                {r.sku && <span className="font-mono text-body-sm text-on-surface-variant">{r.sku}</span>}
              </span>
            ),
          },
          { key: "variation", header: R.col.variation, cell: (r) => r.variation ?? "—" },
          { key: "shipped", header: R.col.shipped, numeric: true, cell: (r) => num(r.shipped) },
          { key: "requests", header: R.col.requests, numeric: true, cell: (r) => num(r.return_requests) },
          { key: "rate", header: R.col.rate, numeric: true, cell: (r) => fmtPct(r.rate) },
          { key: "issue", header: R.col.issue, numeric: true, cell: (r) => num(r.issue) },
        ]}
      />

      <ReportTable
        title={R.sections.byShop}
        rows={data.by_shop}
        rowKey={(r) => r.shop_id}
        rowLink={(r) => returnsLink(filters, { tab: "ALL", platform: r.platform, shop: r.shop_id })}
        columns={[
          { key: "shop", header: R.col.shop, cell: (r) => `${PLATFORM_SHORT[r.platform]} · ${r.shop_name}` },
          { key: "handed", header: R.col.handedOver, numeric: true, cell: (r) => num(r.handed_over) },
          { key: "cases", header: R.col.cases, numeric: true, cell: (r) => num(r.return_cases) },
          { key: "rate", header: R.col.rate, numeric: true, cell: (r) => fmtPct(r.rate) },
        ]}
      />
    </div>
  );
}
