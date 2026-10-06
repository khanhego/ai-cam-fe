import { fmtDateTime, fmtShort } from "@/shared/format";
import { DEADLINE_PLATFORM_PASSED } from "@/shared/labels";
import { deadlineText } from "@/shared/returns/labels";

/** Chip D17 (01 §10.5 D17 "Hạn (BR-42)"). */
const PLATFORM_PASSED_CHIP = "Hạn sàn đã qua";
import { cx, StatusChip } from "@/shared/ui";

/**
 * Hạn hồ sơ (01 §10.5 D16 / D17). Danh sách: "08/10 17:00 · còn 2 ngày"; chi tiết (`full`): "08/10/2026 17:00 (còn 2
 * ngày)". Đỏ khi ≤ 48 giờ (cờ `due_soon` của server nếu có) hoặc "Quá hạn …". Hồ sơ không còn chờ (`active = false` —
 * Thắng / Thua / Đóng) chỉ hiện ngày.
 */
export function Deadline({
  at,
  active = true,
  dueSoon,
  full = false,
  source,
}: {
  at: string | null;
  active?: boolean;
  dueSoon?: boolean;
  full?: boolean;
  /** item 03 (BR-42): `DEFAULT_PLATFORM_PASSED` → chip "Hạn sàn đã qua" cạnh hạn (D17). */
  source?: string | null;
}) {
  if (!at) return <span>—</span>;
  const d = active ? deadlineText(at) : null;
  const urgent = d ? d.overdue || (dueSoon ?? d.urgent) : false;
  const date = full ? fmtDateTime(at).slice(0, 16) : fmtShort(at);
  const text = (
    <span className={cx("tabular-nums", urgent && "font-medium text-error")}>
      {date}
      {d && (full ? ` (${d.text})` : ` · ${d.text}`)}
    </span>
  );
  if (source !== "DEFAULT_PLATFORM_PASSED") return text;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {text}
      <StatusChip tone="warning" icon="history" title={DEADLINE_PLATFORM_PASSED}>
        {PLATFORM_PASSED_CHIP}
      </StatusChip>
    </span>
  );
}
