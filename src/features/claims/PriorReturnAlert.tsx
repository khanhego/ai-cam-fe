import type { ClaimDetail } from "@/lib/api/claims";
import { fmtShort } from "@/shared/format";
import { Alert, Button } from "@/shared/ui";

import { COPY } from "./copy";

const E = COPY.evidence;

/**
 * Alert đầu khối Bằng chứng D17 (01 §10.5 D17, BR-39; 02b-admin §3): (1) phiên mở hoàn trước đã đưa vào bằng chứng
 * ("là phiên chính" theo `primary` server); (2) phiên bị loại vì quét nhầm — không vào bằng chứng, nút "Thêm vào bằng
 * chứng" cho phiên chưa có (`in_evidence = false`), "Bỏ đánh dấu" cho phiên `MARKED`; (3) T-264: Alert vàng "Cần soát" với
 * [Là phiên hoàn thật] [Quét nhầm] (API-189); (4) T-266 (v0.5 — DEC-529): phiên bị loại theo lý do hủy (`STATION_CANCEL` /
 * `SUPERVISOR_CANCEL`) có [Là phiên hoàn thật] chỉ với ADMIN / SUPERVISOR (`canOverride`) → chế độ `OVERRIDE`.
 */
export function PriorReturnAlert({
  claim,
  editable,
  busy,
  onAdd,
  onReview,
  canOverride = false,
}: {
  claim: ClaimDetail;
  editable: boolean;
  busy: boolean;
  onAdd: (sessionId: string) => void;
  /** T-264 (API-189): bỏ đánh dấu / xác nhận "Cần soát" / đánh dấu quét nhầm; T-266: gỡ lý do hủy. */
  onReview: (mode: "MARK" | "UNMARK" | "REVIEW" | "OVERRIDE", sessionId: string, startedAt: string) => void;
  /** ADMIN / SUPERVISOR — server vẫn 403 với CSKH. */
  canOverride?: boolean;
}) {
  const byStart = <T extends { started_at: string }>(a: T, b: T) => a.started_at.localeCompare(b.started_at);
  const prior = [...claim.prior_return_sessions].sort(byStart);
  const primaryId = claim.evidence.find((e) => e.kind === "SESSION" && e.primary);
  const priorIsPrimary =
    primaryId?.kind === "SESSION" && prior.some((p) => p.session_id === primaryId.session.id);
  const excluded = [...claim.excluded_return_sessions].sort(byStart);
  const review = [...claim.review_sessions].sort(byStart);
  return (
    <>
      {prior.length > 0 && (
        <Alert kind="info">
          {E.priorAlert(
            prior.length,
            prior.map((p) => E.priorItem(p.status, fmtShort(p.started_at))).join(", "),
            priorIsPrimary,
          )}
        </Alert>
      )}
      {excluded.length > 0 && (
        <Alert kind="info">
          <p>{E.excludedAlert(excluded.length, excluded.map((x) => fmtShort(x.started_at)).join(", "))}</p>
          {editable && (
            <div className="mt-1 flex flex-wrap gap-2">
              {excluded
                .filter((x) => !x.in_evidence && x.has_clip)
                .map((x) => (
                  <Button
                    key={x.session_id}
                    variant="text"
                    size="sm"
                    icon="add"
                    disabled={busy}
                    aria-label={E.addToEvidenceAt(fmtShort(x.started_at))}
                    onClick={() => onAdd(x.session_id)}
                  >
                    {excluded.length > 1 ? E.addToEvidenceAt(fmtShort(x.started_at)) : E.addToEvidence}
                  </Button>
                ))}
              {excluded
                .filter((x) => x.evidence_exclusion === "MARKED")
                .map((x) => (
                  <Button
                    key={`u-${x.session_id}`}
                    variant="text"
                    size="sm"
                    icon="undo"
                    disabled={busy}
                    aria-label={E.unmarkAt(fmtShort(x.started_at))}
                    onClick={() => onReview("UNMARK", x.session_id, x.started_at)}
                  >
                    {excluded.length > 1 ? E.unmarkAt(fmtShort(x.started_at)) : E.unmark}
                  </Button>
                ))}
              {canOverride &&
                excluded
                  .filter(
                    (x) =>
                      x.evidence_exclusion === "STATION_CANCEL" ||
                      x.evidence_exclusion === "SUPERVISOR_CANCEL",
                  )
                  .map((x) => (
                    <Button
                      key={`o-${x.session_id}`}
                      variant="text"
                      size="sm"
                      icon="verified"
                      disabled={busy}
                      aria-label={E.confirmReturnAt(fmtShort(x.started_at))}
                      onClick={() => onReview("OVERRIDE", x.session_id, x.started_at)}
                    >
                      {excluded.length > 1 ? E.confirmReturnAt(fmtShort(x.started_at)) : E.confirmReturn}
                    </Button>
                  ))}
            </div>
          )}
        </Alert>
      )}
      {review.length > 0 && (
        <Alert kind="warning">
          <p>{E.reviewAlert(review.length)}</p>
          {editable && (
            <div className="mt-1 flex flex-col gap-1">
              {review.map((r) => {
                const at = fmtShort(r.started_at);
                return (
                  <div
                    key={r.session_id}
                    role="group"
                    aria-label={E.reviewActionsFor(at)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    {review.length > 1 && <span className="text-body-sm">{E.reviewActionsFor(at)}</span>}
                    <Button
                      variant="tonal"
                      size="sm"
                      disabled={busy}
                      onClick={() => onReview("REVIEW", r.session_id, r.started_at)}
                    >
                      {E.confirmReturn}
                    </Button>
                    <Button
                      variant="outlined-danger"
                      size="sm"
                      disabled={busy}
                      onClick={() => onReview("MARK", r.session_id, r.started_at)}
                    >
                      {E.wrongScanShort}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Alert>
      )}
    </>
  );
}
