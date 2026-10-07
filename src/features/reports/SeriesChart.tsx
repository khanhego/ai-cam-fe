import { useState } from "react";

import type { SeriesGranularity, SeriesPoint } from "@/lib/api/reports";

import { REPORT_COPY } from "./reportCopy";
import { num } from "./reportFormat";

const C = REPORT_COPY.chart;

function bucketLabel(bucket: string, g: SeriesGranularity): string {
  const [y, m, d] = bucket.split("-");
  if (g === "month") return `${m}/${y}`;
  return g === "week" ? `Tuần ${d}/${m}` : `${d}/${m}`;
}

/**
 * Biểu đồ cột một chuỗi theo thời gian (FR-09.07, mức C; 02b-admin §10: tự vẽ, không thêm thư viện). Một chuỗi → không
 * legend (tiêu đề gọi tên); cột mảnh bo 4 px đầu, cách nhau 2 px, màu primary; trục / lưới nhạt. Rê chuột lên cột → dòng
 * đọc số (aria-live); người dùng trình đọc màn hình có bảng ẩn cùng số liệu. `series` rỗng → không vẽ.
 */
export function SeriesChart({
  title,
  series,
  granularity,
  pick,
}: {
  title: string;
  series: SeriesPoint[];
  granularity: SeriesGranularity;
  pick: (p: SeriesPoint) => number;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (series.length === 0) return null;
  const values = series.map(pick);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const shown = active ?? null;
  return (
    <section className="card p-4" aria-label={title}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-title-md text-on-surface">
          {title} <span className="text-body-md text-on-surface-variant">({C.granularity[granularity]})</span>
        </h2>
        <p className="text-body-md tabular-nums text-on-surface-variant" aria-live="polite">
          {shown === null
            ? C.total(total)
            : C.bar(bucketLabel(series[shown]!.bucket, granularity), values[shown]!)}
        </p>
      </div>
      <div className="flex gap-2" aria-hidden="true">
        <div className="flex h-32 flex-col justify-between text-right text-label-sm tabular-nums text-on-surface-variant">
          <span>{num(max)}</span>
          <span>0</span>
        </div>
        <div
          className="relative flex h-32 flex-1 items-end gap-[2px] border-b border-outline-variant"
          onMouseLeave={() => setActive(null)}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-outline-variant" />
          {series.map((p, i) => (
            <div
              key={p.bucket}
              className="flex h-full min-w-0 flex-1 cursor-default items-end"
              onMouseEnter={() => setActive(i)}
            >
              <div
                className={
                  active === i
                    ? "w-full rounded-t-[4px] bg-primary"
                    : "w-full rounded-t-[4px] bg-primary opacity-80"
                }
                style={{ height: values[i]! > 0 ? `max(2px, ${(values[i]! / max) * 100}%)` : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div
        className="ml-8 mt-1 flex justify-between text-label-sm text-on-surface-variant"
        aria-hidden="true"
      >
        <span>{bucketLabel(series[0]!.bucket, granularity)}</span>
        {series.length > 1 && <span>{bucketLabel(series.at(-1)!.bucket, granularity)}</span>}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {series.map((p, i) => (
            <tr key={p.bucket}>
              <th scope="row">{bucketLabel(p.bucket, granularity)}</th>
              <td>{num(values[i]!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
