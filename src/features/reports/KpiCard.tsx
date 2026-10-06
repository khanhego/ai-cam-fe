import { Link } from "react-router-dom";

import { fmtNumber } from "@/shared/format";
import { cx, Icon } from "@/shared/ui";

/**
 * Thẻ số D2 (02b-admin §3): bấm → màn lọc sẵn (D3 / D14 / D15 / D16). `warn` khi cần chú ý (icon + màu, không chỉ
 * màu) — mặc định khi số > 0; `detail` là dòng phụ ("3 có vấn đề", "1 Cao · 6 khác").
 */
export function KpiCard({
  label,
  value,
  to,
  warn,
  detail,
}: {
  label: string;
  value: number;
  to: string;
  warn?: boolean;
  detail?: string;
}) {
  const alert = warn && value > 0;
  return (
    <Link
      to={to}
      aria-label={`${label}: ${fmtNumber(value)}${detail ? `, ${detail}` : ""}. Xem danh sách`}
      className={cx(
        "state-layer card flex flex-col gap-1 p-4",
        alert && "border-warning bg-warning-container text-on-warning-container",
      )}
    >
      <span className={cx("flex items-center gap-1 text-label-lg", !alert && "text-on-surface-variant")}>
        {label}
        {alert && <Icon name="warning" size={16} filled />}
      </span>
      <span className={cx("text-display-sm tabular-nums", !alert && "text-on-surface")}>
        {fmtNumber(value)}
      </span>
      {detail && <span className={cx("text-body-sm", !alert && "text-on-surface-variant")}>{detail}</span>}
    </Link>
  );
}
