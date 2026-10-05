import type { AlreadyResolvedDetails, ApprovalItem } from "@/lib/api/approvals";
import { fmtHourMinute } from "@/shared/format";

import { COPY } from "./copy";

/** Khay còn phiếu sai → "Đóng phiên có ghi chú" bị khóa + cảnh báo (02b-admin §3 `ApprovalCard`). */
export const trayStillWrong = (item: ApprovalItem) =>
  item.type !== "REPACK" &&
  (item.context?.tray_match === "DIFFERENT" || item.context?.tray_match === "MULTIPLE");

/** Câu ALREADY_RESOLVED theo `details.status` (02 §6.2 API-21, 02b-admin §8). */
export function alreadyResolvedText(details: AlreadyResolvedDetails): string {
  if (details.status === "WITHDRAWN") return COPY.withdrawn;
  return COPY.alreadyResolved(
    details.decided_by?.display_name ?? "người khác",
    fmtHourMinute(details.decided_at),
  );
}
