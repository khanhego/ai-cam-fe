import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { hasPermission } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/errors";
import { packagesApi } from "@/lib/api/packages";
import { reconApi, type ReconAlert, type ReconAlreadyResolved } from "@/lib/api/recon";
import { fmtShort } from "@/shared/format";
import { platformStatus, WAREHOUSE_STATUS } from "@/shared/labels";
import { RECON_SEVERITY, reconRuleLabel } from "@/shared/returns/labels";
import {
  Alert,
  Button,
  Dialog,
  SegmentedButtons,
  Skeleton,
  StatusChip,
  TextAreaField,
  toast,
} from "@/shared/ui";

import { useAuth } from "../auth/useAuth";
import { CreateClaimForm } from "../claims/CreateClaimDialog";
import { timelineText } from "../orders/timeline";
import { AdjustStatusForm } from "./AdjustStatusForm";
import { COPY } from "./copy";
import { alreadyResolvedText, claimDefaults } from "./resolve";
import { useRuleThresholds } from "./useRuleThresholds";

const C = COPY.resolve;
const NOTE_MAX = 500;
type Action = "RESOLVE" | "ADJUST_STATUS" | "OPEN_CLAIM";

function HistoryList({ packageId }: { packageId: string }) {
  const pkg = useQuery({ queryKey: ["package", packageId], queryFn: () => packagesApi.get(packageId) });
  if (pkg.isPending) return <Skeleton lines={3} className="h-5" />;
  if (pkg.isError) return null;
  // API-31: dòng thời gian cũ trước → 5 dòng gần nhất, mới trước.
  const rows = pkg.data.timeline.slice(-5).reverse();
  if (rows.length === 0) return <p className="text-body-sm">{C.noHistory}</p>;
  return (
    <ol className="flex flex-col gap-1 text-body-sm">
      {rows.map((t, i) => (
        <li key={`${t.at}-${i}`} className="flex gap-2">
          <span className="shrink-0 tabular-nums">{fmtShort(t.at)}</span>
          <span className="text-on-surface">{timelineText(t)}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Dialog "Xử lý cảnh báo" (01 §10.5 D15, FR-06.03, 06.05, 08.01; UC-06): thông tin kiện + trạng thái kho / sàn + lịch
 * sử 5 dòng gần nhất + link D4; ba hành động (`SegmentedButtons`): "Đánh dấu đã xử lý" (ghi chú bắt buộc, API-121),
 * "Điều chỉnh trạng thái kho" (`AdjustStatusForm`, API-122 + `recon_alert_id`), "Tạo hồ sơ khiếu nại" (`CreateClaimForm`,
 * API-131 + `recon_alert_id`; BR-12 / 19 mặc định "Thất lạc" gửi ĐVVC). `409 ALREADY_RESOLVED` → chữ xung đột, khóa nút.
 */
export function ResolveAlertDialog({ alert, onClose }: { alert: ReconAlert; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.me);
  const thresholds = useRuleThresholds();
  const canAdjust = hasPermission(me, "warehouse_status.adjust") && alert.allowed_status_targets.length > 0;
  const canClaim = hasPermission(me, "claims.manage");
  const [action, setAction] = useState<Action>("RESOLVE");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const invalidate = () => {
    for (const key of [["recon"], ["daily"], ["package", alert.package.id]])
      void qc.invalidateQueries({ queryKey: key });
  };
  const resolve = useMutation({
    mutationFn: () => reconApi.resolve(alert.id, note.trim()),
    onSuccess: () => {
      toast(C.done);
      invalidate();
      onClose();
    },
    onError: (err) => {
      if (isApiError(err) && err.code === "ALREADY_RESOLVED") {
        setConflict(alreadyResolvedText(err.details as ReconAlreadyResolved));
        invalidate();
      }
    },
  });

  const noteText = note.trim();
  const noteError = noteText.length < 1 || noteText.length > NOTE_MAX ? C.noteRule : undefined;
  const err = resolve.error;
  const fieldNote = isApiError(err) && err.code === "VALIDATION_ERROR" ? err.fieldErrors.note : undefined;
  const otherError = err && !conflict && !fieldNote ? (isApiError(err) ? err.message : COPY.generic) : null;
  const [sev, sevTone] = RECON_SEVERITY[alert.severity];
  const ws = WAREHOUSE_STATUS[alert.package.warehouse_status];
  const options: [Action, string][] = [
    ["RESOLVE", COPY.list.action.RESOLVE],
    ...(canAdjust ? [["ADJUST_STATUS", COPY.list.action.ADJUST_STATUS] as [Action, string]] : []),
    ...(canClaim ? [["OPEN_CLAIM", COPY.list.action.OPEN_CLAIM] as [Action, string]] : []),
  ];
  const defaults = claimDefaults(alert.rule);

  return (
    <Dialog open wide title={C.title} onClose={onClose}>
      <section aria-label={C.package} className="mb-4 flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2 text-on-surface">
          <StatusChip tone={sevTone}>{sev}</StatusChip>
          <span>
            {alert.br} {reconRuleLabel(alert.rule, thresholds)}
          </span>
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          <dt>{C.package}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-on-surface">{alert.package.tracking_number}</span>
            <Link
              to={`/admin/packages/${alert.package.id}`}
              className="text-label-lg text-primary hover:underline"
            >
              {C.openPackage}
            </Link>
          </dd>
          <dt>{C.warehouse}</dt>
          <dd>
            <StatusChip tone={ws?.[1] ?? "neutral"}>{ws?.[0] ?? alert.package.warehouse_status}</StatusChip>
          </dd>
          <dt>{C.platform}</dt>
          <dd className="text-on-surface">{platformStatus(alert.package.platform_status)}</dd>
          <dt>{C.since}</dt>
          <dd className="tabular-nums text-on-surface">
            {fmtShort((alert.context.since as string | null | undefined) ?? alert.detected_at)}
          </dd>
        </dl>
        <h3 className="mt-2 text-title-sm text-on-surface">{C.history}</h3>
        <HistoryList packageId={alert.package.id} />
      </section>

      {conflict ? (
        <Alert kind="warning">{conflict}</Alert>
      ) : (
        <>
          <p className="mb-2 text-label-lg text-on-surface">{C.actions}</p>
          <div className="mb-4 max-w-full overflow-x-auto">
            <SegmentedButtons label={C.actions} options={options} value={action} onChange={setAction} />
          </div>
          {action === "RESOLVE" && (
            <div>
              <TextAreaField
                name="recon-note"
                label={C.note}
                hint={C.noteHint}
                rows={2}
                value={note}
                error={(touched ? noteError : undefined) ?? fieldNote}
                onChange={(e) => setNote(e.target.value)}
              />
              {otherError && <Alert kind="error">{otherError}</Alert>}
              <div className="mt-2 flex justify-end">
                <Button
                  disabled={resolve.isPending}
                  onClick={() => {
                    setTouched(true);
                    if (!noteError) resolve.mutate();
                  }}
                >
                  {C.submit}
                </Button>
              </div>
            </div>
          )}
          {action === "ADJUST_STATUS" && (
            <AdjustStatusForm
              packageId={alert.package.id}
              currentStatus={alert.package.warehouse_status}
              allowedTargets={alert.allowed_status_targets}
              alertId={alert.id}
              successMessage={(r) =>
                r.recon_alert?.resolution?.action === "ADJUST_STATUS" ? C.done : COPY.adjust.done
              }
              onDone={onClose}
            />
          )}
          {action === "OPEN_CLAIM" && (
            <CreateClaimForm
              packageId={alert.package.id}
              reconAlertId={alert.id}
              defaultType={defaults.type}
              defaultCounterparty={defaults.counterparty}
              submitLabel={C.submit}
              onClose={onClose}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
