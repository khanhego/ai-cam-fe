import { useEffect, useState } from "react";

import { fmtShort } from "@/shared/format";
import { cx, Icon, StatusChip } from "@/shared/ui";

import { DUE_COPY, HOUR, MINUTE, remainingText } from "./dueText";

/** Giờ hiện tại, tự cập nhật mỗi `everyMs` (mặc định 1 phút). */
function useNow(everyMs: number, fixed?: number) {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs, fixed]);
  return fixed ?? now;
}

/**
 * Hạn phản hồi Chỉ hoàn tiền (02b-admin §3, 01 §10.5 D14 — FR-08.08, BR-40): đếm ngược, đỏ khi ≤ `warnHours` (48), chip
 * "Quá hạn" khi qua; `source = DEFAULT` (sàn không trả hạn) → ⓘ giải thích. `now` chỉ để test.
 */
export function DueCountdown({
  dueAt,
  source,
  warnHours = 48,
  defaultHours = 48,
  now,
}: {
  dueAt: string | null;
  source?: "PLATFORM" | "DEFAULT" | null;
  warnHours?: number;
  defaultHours?: number;
  now?: number;
}) {
  const nowMs = useNow(MINUTE, now);
  if (!dueAt) return <span>—</span>;
  const due = Date.parse(dueAt);
  const text = remainingText(due, nowMs);
  const urgent = text !== null && due - nowMs <= warnHours * HOUR;
  const info = source === "DEFAULT" ? DUE_COPY.defaultInfo(defaultHours) : null;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" title={fmtShort(dueAt)}>
      {text === null ? (
        <StatusChip tone="error">{DUE_COPY.overdue}</StatusChip>
      ) : (
        <span className={cx(urgent && "font-medium text-error")} data-urgent={urgent || undefined}>
          {text}
        </span>
      )}
      {info && (
        <span
          role="img"
          tabIndex={0}
          aria-label={`${DUE_COPY.defaultInfoButton}: ${info}`}
          title={info}
          className="inline-flex text-on-surface-variant"
        >
          <Icon name="info" size={16} />
        </span>
      )}
    </span>
  );
}
