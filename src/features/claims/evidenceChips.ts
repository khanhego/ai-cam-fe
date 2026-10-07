import type { ClaimEvidence, RemovedEvidence } from "@/lib/api/claims";
import { fmtShort } from "@/shared/format";
import {
  CANCEL_CAUSE,
  EVIDENCE_EXCLUSION_MARKED,
  RETURN_CANCEL_REASON,
  REVIEW_NEEDED_LABEL,
} from "@/shared/labels";
import type { ChipTone } from "@/shared/ui";

import { COPY } from "./copy";

export type SessionEvidence = Extract<ClaimEvidence, { kind: "SESSION" }>;
export type EvidenceChip = { label: string; tone: ChipTone };

/**
 * Chip dòng phiên bằng chứng D17 (02b-admin §3 `EvidenceList`, §9; BR-39): "Phiên chính" chỉ theo `primary` của server
 * (FE không tự tính — DEC-511); `evidence_exclusion` ưu tiên ("Đã đánh dấu quét nhầm" / "Hủy: quét nhầm" / "Quản lý hủy:
 * …"); rồi `review_needed` ("Cần soát…"); rồi phiên mở hoàn trước; còn lại phiên hoàn bị hủy → nhãn lý do.
 */
export function sessionChips(ev: SessionEvidence): EvidenceChip[] {
  const s = ev.session;
  const out: EvidenceChip[] = [];
  if (ev.primary) out.push({ label: COPY.evidence.primary, tone: "primary" });
  if (s.type !== "RETURN") return out;
  const reason = (): string | null =>
    s.cancel_cause
      ? CANCEL_CAUSE[s.cancel_cause]
      : s.cancel_reason
        ? (RETURN_CANCEL_REASON[s.cancel_reason] ?? null)
        : null;
  if (s.evidence_exclusion === "MARKED") out.push({ label: EVIDENCE_EXCLUSION_MARKED, tone: "warning" });
  else if (s.evidence_exclusion) {
    const r = reason();
    if (r) out.push({ label: r, tone: "warning" });
  } else if (s.review_needed) out.push({ label: REVIEW_NEEDED_LABEL, tone: "warning" });
  else if (ev.prior_return) out.push({ label: COPY.evidence.prior(s.status), tone: "info" });
  else if (s.status === "CANCELLED" && !s.return_confirmed) {
    const r = reason();
    if (r) out.push({ label: r, tone: "neutral" });
  }
  // T-266 (v0.5 — DEC-529): đã gỡ lý do hủy / đã xác nhận "Cần soát".
  if (s.return_confirmed) out.push({ label: COPY.evidence.returnConfirmed, tone: "success" });
  return out;
}

/** Đã có chip mô tả trạng thái phiên (khỏi lặp chip "Bỏ dở" / "Đã hủy"). */
export const hasStatusChip = (ev: SessionEvidence) =>
  ev.session.type === "RETURN" &&
  (Boolean(ev.session.evidence_exclusion) ||
    ev.session.review_needed ||
    ev.prior_return ||
    (ev.session.status === "CANCELLED" &&
      !ev.session.return_confirmed &&
      Boolean(ev.session.cancel_cause ?? ev.session.cancel_reason)));

/** Tên một dòng bằng chứng ("Phiên mở hoàn 06/10 08:51", "Ảnh 06/10 10:16"). */
export const evidenceLabel = (ev: Pick<RemovedEvidence, "kind"> & Partial<RemovedEvidence>): string => {
  if (ev.kind === "SNAPSHOT" && "snapshot" in ev && ev.snapshot)
    return COPY.evidence.snapshot(fmtShort(ev.snapshot.taken_at));
  if (ev.kind === "SESSION" && "session" in ev && ev.session)
    return `${ev.session.type === "RETURN" ? COPY.evidence.return : COPY.evidence.pack} ${fmtShort(ev.session.started_at)}`;
  return "—";
};
