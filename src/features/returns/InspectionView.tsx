import { useId, useState, type ReactNode } from "react";

import type { PackageSession } from "@/lib/api/packages";
import { fmtDateTime, fmtShort } from "@/shared/format";
import { CONCLUSION_LABEL, CONDITION_LABEL, conclusionTone } from "@/shared/returns/inspection";
import type { Inspection } from "@/shared/returns/types";
import { Button, StatusChip } from "@/shared/ui";

import { COPY } from "./copy";

const C = COPY.inspection;

/** Bảng dòng chỉ đọc (01 §10.5 D4: "Áo thun Đen/L yêu cầu 2 · nhận 0 · Thiếu"). */
function Lines({ inspection }: { inspection: Inspection }) {
  if (inspection.lines.length === 0) return <p>{C.noLines}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="md-table">
        <caption className="sr-only">
          {C.result}
          {inspection.lines_mode === "REFERENCE" ? ` (${C.reference})` : ""}
        </caption>
        <thead>
          <tr>
            <th className="pl-4">{C.product}</th>
            <th className="text-right">{C.requested}</th>
            <th className="text-right">{C.received}</th>
            <th className="pr-4">{C.condition}</th>
          </tr>
        </thead>
        <tbody>
          {inspection.lines.map((l) => (
            <tr key={l.order_item_id}>
              <td className="pl-4">{[l.product_name, l.variation].filter(Boolean).join(" · ")}</td>
              <td className="text-right tabular-nums">{l.quantity_requested}</td>
              <td className="text-right tabular-nums">{l.quantity_received}</td>
              <td className="pr-4">{l.condition ? CONDITION_LABEL[l.condition] : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Kết quả kiểm một phiên hoàn (01 §10.5 D4, FR-07.02): dòng chỉ đọc (`REFERENCE` → "Chỉ tham khảo"), kết luận, người
 * kiểm, cờ "Tự đóng", "Đã sửa {n} lần" mở lịch sử `corrections[]` (người, giờ, lý do, kết luận trước — DEC-261).
 */
export function InspectionView({ session, actions }: { session: PackageSession; actions?: ReactNode }) {
  const [showHistory, setShowHistory] = useState(false);
  const historyId = useId();
  const inspection = session.inspection;
  if (!inspection) return null;
  const corrections = inspection.corrections ?? [];
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
        <span className="tabular-nums">
          {C.result} {fmtShort(session.ended_at ?? session.started_at)} · {session.station_name}
          {session.operator_name ? ` · ${C.operator(session.operator_name)}` : ""}
        </span>
        {inspection.conclusion && (
          <StatusChip tone={conclusionTone(inspection.conclusion)}>
            {CONCLUSION_LABEL[inspection.conclusion]}
          </StatusChip>
        )}
        {session.flags.includes("AUTO_CLOSED") && <StatusChip tone="warning">{C.autoClosed}</StatusChip>}
        {inspection.lines_mode === "REFERENCE" && <StatusChip>{C.reference}</StatusChip>}
        {corrections.length > 0 && (
          <Button
            variant="text"
            size="sm"
            icon="history"
            aria-expanded={showHistory}
            aria-controls={historyId}
            onClick={() => setShowHistory((v) => !v)}
          >
            {C.corrected(corrections.length)}
          </Button>
        )}
        {actions}
      </p>
      {showHistory && (
        <ol
          id={historyId}
          aria-label={C.history}
          className="flex flex-col gap-1 rounded-md bg-surface-container p-3"
        >
          {corrections.map((c, i) => (
            <li key={i} className="text-body-sm text-on-surface">
              <span className="tabular-nums">{fmtDateTime(c.at)}</span> · {c.by?.display_name || "—"} ·{" "}
              {C.reason}: “{c.reason}” · {C.before}:{" "}
              {c.before.conclusion ? CONCLUSION_LABEL[c.before.conclusion] : "—"}
              {c.before.note ? ` (${c.before.note})` : ""}
            </li>
          ))}
        </ol>
      )}
      <Lines inspection={inspection} />
      {inspection.note && (
        <p className="text-body-md text-on-surface-variant">
          {C.note}: “{inspection.note}”
        </p>
      )}
    </div>
  );
}
