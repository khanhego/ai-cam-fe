import type { ClaimDetail } from "@/lib/api/claims";
import { fmtShort } from "@/shared/format";
import { Alert, Button } from "@/shared/ui";

import { COPY } from "./copy";

const E = COPY.evidence;

/**
 * Alert đầu khối Bằng chứng D17 (01 §10.5 D17, BR-39; 02b-admin §3): (1) phiên mở hoàn trước đã đưa vào bằng chứng
 * ("là phiên chính" theo `primary` server); (2) phiên bị loại vì quét nhầm — không vào bằng chứng, nút "Thêm vào bằng
 * chứng" cho phiên chưa có (`in_evidence = false`). Hành động đánh dấu / Cần soát: T-264.
 */
export function PriorReturnAlert({
  claim,
  editable,
  busy,
  onAdd,
}: {
  claim: ClaimDetail;
  editable: boolean;
  busy: boolean;
  onAdd: (sessionId: string) => void;
}) {
  const byStart = <T extends { started_at: string }>(a: T, b: T) => a.started_at.localeCompare(b.started_at);
  const prior = [...claim.prior_return_sessions].sort(byStart);
  const primaryId = claim.evidence.find((e) => e.kind === "SESSION" && e.primary);
  const priorIsPrimary =
    primaryId?.kind === "SESSION" && prior.some((p) => p.session_id === primaryId.session.id);
  const excluded = [...claim.excluded_return_sessions].sort(byStart);
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
          {editable && excluded.some((x) => !x.in_evidence && x.has_clip) && (
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
            </div>
          )}
        </Alert>
      )}
    </>
  );
}
