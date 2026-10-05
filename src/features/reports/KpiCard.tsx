import { Link } from "react-router-dom";

import { fmtNumber } from "@/shared/format";
import { cx, Icon } from "@/shared/ui";

/** Thẻ số D2 (02b-admin §3): bấm → D3 lọc sẵn. `warn` khi số > 0 cần chú ý (icon + màu, không chỉ màu). */
export function KpiCard({
  label,
  value,
  to,
  warn,
}: {
  label: string;
  value: number;
  to: string;
  warn?: boolean;
}) {
  const alert = warn && value > 0;
  return (
    <Link
      to={to}
      aria-label={`${label}: ${fmtNumber(value)}. Xem danh sách`}
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
    </Link>
  );
}
