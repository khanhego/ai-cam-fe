import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { cx } from "@/shared/ui";

import { REPORT_COPY } from "./reportCopy";

export type Column<T> = {
  key: string;
  header: string;
  /** Ô số căn phải, `tabular-nums` (02b-admin §9 a11y). */
  numeric?: boolean;
  cell: (row: T) => ReactNode;
};

/**
 * Bảng báo cáo D20 (02b-admin §3 `ReportTable`): `md-table` có `<caption>` ẩn (tên bảng), ô số căn phải, cột đầu cố định
 * khi cuộn ngang (mobile — 01 §10.5 D20). `rowLink` → ô đầu là link tới màn chi tiết đã lọc ("bấm dòng").
 * Không có dòng → "Không có dữ liệu trong kỳ này.".
 */
export function ReportTable<T>({
  title,
  columns,
  rows,
  rowKey,
  rowLink,
  rowLinkLabel,
  className,
}: {
  title: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  rowLink?: (row: T) => string | null;
  rowLinkLabel?: (row: T) => string;
  className?: string;
}) {
  return (
    <section className={cx("card flex min-w-0 flex-col", className)} aria-label={title}>
      <h2 className="px-4 pt-4 pb-2 text-title-md text-on-surface">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-body-md text-on-surface-variant">{REPORT_COPY.emptyTable}</p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <table className="md-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cx(
                      "px-3",
                      i === 0 && "sticky left-0 z-[1] bg-surface-container-lowest pl-4",
                      c.numeric && "text-right",
                    )}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const link = rowLink?.(row) ?? null;
                return (
                  <tr key={rowKey(row, ri)} className="group">
                    {columns.map((c, i) => {
                      const content = c.cell(row);
                      if (i === 0)
                        return (
                          <th
                            key={c.key}
                            scope="row"
                            className="sticky left-0 z-[1] border-b border-outline-variant bg-surface-container-lowest px-3 py-2.5 pl-4 text-left align-top font-normal group-last:border-b-0"
                          >
                            {link ? (
                              <Link
                                to={link}
                                className="md-link"
                                aria-label={rowLinkLabel ? rowLinkLabel(row) : undefined}
                              >
                                {content}
                              </Link>
                            ) : (
                              content
                            )}
                          </th>
                        );
                      return (
                        <td
                          key={c.key}
                          className={cx("px-3", c.numeric && "text-right tabular-nums whitespace-nowrap")}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
