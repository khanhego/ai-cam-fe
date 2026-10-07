import { useId, useState } from "react";
import { Link } from "react-router-dom";

import { cx, Icon } from "@/shared/ui";

import { REPORT_COPY } from "./reportCopy";

/**
 * Thẻ số D20 (02b-admin §3 `RateCard`, mở rộng `KpiCard` D2): số + dòng phụ ("40 / 1.000 kiện") + ⓘ công thức BR-41.
 * Bấm thẻ → màn chi tiết đã lọc (khi có `to`). ⓘ là `button` riêng (không lồng trong link) có `aria-describedby`.
 * `alert`: số cần chú ý (vd "Quá hạn chưa gửi" > 0) — icon + màu, không chỉ màu.
 */
export function RateCard({
  label,
  value,
  detail,
  formula,
  to,
  alert,
}: {
  label: string;
  value: string;
  detail?: string;
  formula: string;
  to?: string;
  alert?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const body = (
    <>
      <span className={cx("flex items-center gap-1 pr-8 text-label-lg", !alert && "text-on-surface-variant")}>
        {label}
        {alert && <Icon name="error" size={16} filled />}
      </span>
      <span className={cx("text-display-sm tabular-nums", !alert && "text-on-surface")}>{value}</span>
      {detail && <span className={cx("text-body-sm", !alert && "text-on-surface-variant")}>{detail}</span>}
    </>
  );
  return (
    <div
      className={cx(
        "card relative flex flex-col",
        alert && "border-error bg-error-container text-on-error-container",
      )}
    >
      {to ? (
        <Link
          to={to}
          aria-label={`${label}: ${value}${detail ? `, ${detail}` : ""}. ${REPORT_COPY.viewList}`}
          className="state-layer flex flex-1 flex-col gap-1 rounded-[inherit] p-4"
        >
          {body}
        </Link>
      ) : (
        <div className="flex flex-1 flex-col gap-1 p-4">{body}</div>
      )}
      <button
        type="button"
        aria-label={REPORT_COPY.formulaButton(label)}
        aria-describedby={tipId}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="state-layer absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full"
      >
        <Icon name="info" size={18} />
      </button>
      <span
        id={tipId}
        role="tooltip"
        hidden={!open}
        className="absolute right-2 top-10 z-10 max-w-72 rounded-sm bg-inverse-surface px-3 py-2 text-body-sm text-inverse-on-surface shadow-elevation-2"
      >
        {formula}
      </span>
    </div>
  );
}
