import { CONCLUSIONS, CONDITION_LABEL, INSPECTION_LIMITS, isLineIssue } from "@/shared/returns/inspection";
import type { InspectionLine, LineCondition, LinesMode } from "@/shared/returns/types";
import { cx, Icon } from "@/shared/ui";

import { COPY } from "../copy";

const C = COPY.returns.inspecting;

/** − / + cao 56px (bàn hoàn có chuột / cảm ứng — AS-08), giữ trong 0–999. */
function QuantityStepper({
  value,
  label,
  invalid,
  onChange,
}: {
  value: number;
  label: string;
  invalid?: boolean;
  onChange: (v: number) => void;
}) {
  const { quantityMin: min, quantityMax: max } = INSPECTION_LIMITS;
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  const btn =
    "state-layer inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface disabled:opacity-38";
  return (
    <div
      role="group"
      aria-label={label}
      className={cx("inline-flex items-center gap-2 rounded-full", invalid && "ring-2 ring-error")}
    >
      <button
        type="button"
        className={btn}
        aria-label={`Giảm ${lower}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon name="remove" size={24} />
      </button>
      <output aria-live="polite" className="w-10 text-center text-title-lg tabular-nums">
        {value}
      </output>
      <button
        type="button"
        className={btn}
        aria-label={`Tăng ${lower}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon name="add" size={24} />
      </button>
    </div>
  );
}

/**
 * Bảng dòng sản phẩm R2 (01 §10.4, FR-04.03, 04.09). `REFERENCE` (giao thất bại đơn > 1 kiện — 02 §6.3 #7): chỉ xem,
 * không gửi dòng thay đổi. Dòng yêu cầu trả 0 hiện xám "(không trả)" nhưng vẫn sửa được (khách gửi thừa).
 */
export function InspectionTable({
  lines,
  mode,
  packageCount,
  errors,
  onChange,
}: {
  lines: InspectionLine[];
  mode: LinesMode;
  packageCount: number;
  errors: Record<string, string>;
  onChange: (lines: InspectionLine[]) => void;
}) {
  if (lines.length === 0) return <p className="text-title-lg">{C.noLines}</p>;
  const readOnly = mode === "REFERENCE";
  const update = (i: number, patch: Partial<InspectionLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="flex min-h-0 flex-col gap-3">
      {readOnly && <p className="text-title-lg">{C.referenceOnly(packageCount)}</p>}
      <div className="max-h-[28rem] overflow-y-auto rounded-md bg-surface-container-lowest text-on-surface">
        <table className="w-full text-title-lg">
          <thead className="sticky top-0 bg-surface-container-lowest text-left text-title-md text-on-surface-variant">
            <tr>
              <th className="p-3">{C.columns.product}</th>
              <th className="p-3 text-right">{C.columns.sent}</th>
              <th className="p-3 text-right">{C.columns.requested}</th>
              <th className="p-3 text-center">{C.columns.received}</th>
              <th className="p-3">{C.columns.condition}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {lines.map((line, i) => {
              const name = [line.product_name, line.variation].filter(Boolean).join(" · ");
              const qtyError = errors[`lines.${i}.quantity_received`];
              const notReturned = line.quantity_requested === 0;
              return (
                <tr
                  key={line.order_item_id ?? i}
                  className={cx(notReturned && "text-on-surface-variant")}
                  data-issue={!readOnly && isLineIssue(line) ? "true" : undefined}
                >
                  <td className="p-3">
                    <span className="flex items-center gap-3">
                      {line.image_url ? (
                        <img src={line.image_url} alt="" className="h-16 w-16 rounded-sm object-cover" />
                      ) : (
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm bg-surface-container-high text-on-surface-variant">
                          <Icon name="inventory_2" size={28} />
                        </span>
                      )}
                      <span>
                        {line.product_name}
                        {line.variation && (
                          <span className="block text-body-lg text-on-surface-variant">{line.variation}</span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">{line.quantity_sent}</td>
                  <td className="p-3 text-right tabular-nums">
                    {line.quantity_requested}
                    {notReturned && <span className="block text-body-md">{C.notReturned}</span>}
                  </td>
                  <td className="p-3 text-center">
                    {readOnly ? (
                      <span className="tabular-nums">{line.quantity_received}</span>
                    ) : (
                      <>
                        <QuantityStepper
                          value={line.quantity_received}
                          label={C.lineQuantity(name)}
                          invalid={!!qtyError}
                          onChange={(v) => update(i, { quantity_received: v })}
                        />
                        {qtyError && <p className="text-body-md text-error">{qtyError}</p>}
                      </>
                    )}
                  </td>
                  <td className="p-3">
                    {readOnly ? (
                      line.condition && CONDITION_LABEL[line.condition]
                    ) : (
                      <select
                        aria-label={`${C.columns.condition} ${name}`}
                        className="md-input h-14 min-w-44"
                        value={line.condition ?? "OK"}
                        onChange={(e) => update(i, { condition: e.target.value as LineCondition })}
                      >
                        {CONCLUSIONS.map((c) => (
                          <option key={c} value={c}>
                            {CONDITION_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
