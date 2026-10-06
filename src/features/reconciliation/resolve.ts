import type { ClaimType, Counterparty } from "@/lib/api/claims";
import type { ReconAlreadyResolved, ReconRule } from "@/lib/api/recon";
import { fmtHourMinute } from "@/shared/format";

import { COPY } from "./copy";

const C = COPY.resolve;

/** Hàng hoàn chưa về / sàn đã hoàn mà kho chưa nhận → "Thất lạc" gửi ĐVVC (01 §10.5 D15, BR-12, BR-19). */
const LOST_RULES = new Set<ReconRule>(["RETURN_OVERDUE", "RETURN_DONE_NOT_RECEIVED"]);
export const claimDefaults = (rule: ReconRule): { type: ClaimType; counterparty: Counterparty } =>
  LOST_RULES.has(rule)
    ? { type: "LOST_IN_TRANSIT", counterparty: "CARRIER" }
    : { type: "BUYER_CLAIM", counterparty: "PLATFORM" };

/** Chữ xung đột (01 §10.5 D15): "đã được Nguyễn B xử lý lúc 14:31." / "đã tự hết lúc 14:30.". */
export function alreadyResolvedText(d: ReconAlreadyResolved): string {
  const at = fmtHourMinute(d.closed_at ?? null);
  if (d.status === "AUTO_RESOLVED") return C.autoResolved(at);
  return C.resolvedBy(d.resolved_by?.display_name ?? "người khác", at);
}
