import { fmtDateTime, fmtShort } from "@/shared/format";
import { deadlineText } from "@/shared/returns/labels";
import { cx } from "@/shared/ui";

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
}: {
  at: string | null;
  active?: boolean;
  dueSoon?: boolean;
  full?: boolean;
}) {
  if (!at) return <span>—</span>;
  const d = active ? deadlineText(at) : null;
  const urgent = d ? d.overdue || (dueSoon ?? d.urgent) : false;
  const date = full ? fmtDateTime(at).slice(0, 16) : fmtShort(at);
  return (
    <span className={cx("tabular-nums", urgent && "font-medium text-error")}>
      {date}
      {d && (full ? ` (${d.text})` : ` · ${d.text}`)}
    </span>
  );
}
