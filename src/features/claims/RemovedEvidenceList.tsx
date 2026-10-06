import type { RemovedEvidence } from "@/lib/api/claims";
import { fmtDate, fmtShort } from "@/shared/format";
import { Button, Icon } from "@/shared/ui";

import { COPY } from "./copy";
import { evidenceLabel } from "./evidenceChips";

const E = COPY.evidence;

/**
 * "Bằng chứng đã bỏ ({n})" thu gọn (01 §10.5 D17, BR-38): ai bỏ, lúc nào, lý do, giữ tới; "Thêm lại" (API-134 — thêm lại
 * id = khôi phục). Ẩn khi rỗng; `editable = false` (hồ sơ Đóng) → không có nút.
 */
export function RemovedEvidenceList({
  items,
  editable,
  busy,
  onRestore,
}: {
  items: RemovedEvidence[];
  editable: boolean;
  busy: boolean;
  onRestore: (ev: RemovedEvidence) => void;
}) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-md border border-outline-variant px-3 py-2">
      <summary className="cursor-pointer text-title-sm text-on-surface">
        {E.removedTitle(items.length)}
      </summary>
      <ul className="mt-2 divide-y divide-outline-variant">
        {items.map((ev) => {
          const label = evidenceLabel(ev);
          return (
            <li key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body-md">
              <Icon name="remove_circle_outline" size={20} className="text-on-surface-variant" />
              <span className="text-on-surface">{label}</span>
              <span className="text-body-sm text-on-surface-variant">
                {E.removedBy(ev.removed.by?.display_name ?? E.systemUser, fmtShort(ev.removed.at))} ·{" "}
                {E.removedReason(ev.removed.reason)}
                {ev.removed.keep_until ? ` · ${E.removedKeep(fmtDate(ev.removed.keep_until))}` : ""}
              </span>
              {editable && (
                <Button
                  variant="text"
                  size="sm"
                  icon="undo"
                  className="ml-auto"
                  disabled={busy}
                  aria-label={E.restoreFor(label)}
                  onClick={() => onRestore(ev)}
                >
                  {E.restore}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
