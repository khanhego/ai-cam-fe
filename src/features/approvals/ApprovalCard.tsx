import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import {
  actionsFor,
  PENDING_APPROVALS_KEY,
  approvalsApi,
  type AlreadyResolvedDetails,
  type ApprovalAction,
  type ApprovalItem,
  type CancelReturnReason,
} from "@/lib/api/approvals";
import { isApiError } from "@/lib/api/errors";
import { APPROVAL_TYPE } from "@/shared/labels";
import { CONCLUSION_LABEL, SESSION_TYPE } from "@/shared/returns/labels";
import {
  Alert,
  Button,
  Dialog,
  StatusChip,
  TextAreaField,
  TrackingNumber,
  toast,
  type ButtonVariant,
} from "@/shared/ui";

import { CancelReturnDialog } from "./CancelReturnDialog";
import { ACTION_DONE, ACTION_LABEL, COPY } from "./copy";
import { alreadyResolvedText, trayStillWrong } from "./decision";

const NOTE_MAX = 500;

const VARIANT: Record<ApprovalAction, ButtonVariant> = {
  CONTINUE: "filled",
  APPROVE_REPACK: "filled",
  CLOSE_WITH_NOTE: "tonal",
  CANCEL_SESSION: "outlined-danger",
  REJECT: "outlined",
};

/**
 * Một yêu cầu đang chờ trên D13 (01 §10.5): station, loại, mã vận đơn, mã vừa quét / Cam 2 thấy, thời gian chờ,
 * nút theo `type`. Quyết định chờ server (không optimistic — cần biết ALREADY_RESOLVED, 02b-admin §4).
 */
export function ApprovalCard({
  item,
  now,
  liveHref,
  onConflict,
}: {
  item: ApprovalItem;
  now: number;
  /** Link D11 của station (chỉ khi vai này có D11 — DEC-51). */
  liveHref?: string;
  onConflict: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | undefined>();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelFields, setCancelFields] = useState<Record<string, string>>({});
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: PENDING_APPROVALS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["daily"] });
  };

  const decide = useMutation({
    mutationFn: ({
      action,
      note,
      reasonCode,
    }: {
      action: ApprovalAction;
      note?: string;
      reasonCode?: CancelReturnReason;
    }) => approvalsApi.decide(item.id, action, note ?? null, reasonCode ?? null),
    onSuccess: (_data, { action }) => {
      setNoteOpen(false);
      setCancelOpen(false);
      toast(ACTION_DONE[action]);
      refresh();
    },
    onError: (e) => {
      if (!isApiError(e)) return setError(COPY.error);
      if (e.code === "ALREADY_RESOLVED") {
        onConflict(alreadyResolvedText(e.details as AlreadyResolvedDetails));
        return refresh();
      }
      // item 03: hủy phiên hoàn — lỗi dưới ô lý do / ghi chú của CancelReturnDialog.
      if (e.code === "VALIDATION_ERROR" && cancelOpen && isReturn) return setCancelFields(e.fieldErrors);
      if (e.code === "VALIDATION_ERROR" && e.fieldErrors.note) return setNoteError(e.fieldErrors.note);
      setNoteOpen(false);
      setCancelOpen(false);
      if (e.code === "TRAY_STILL_DIFFERENT") {
        setError(COPY.trayStillDifferent);
        return refresh();
      }
      if (e.code === "FORBIDDEN") return toast(COPY.forbidden);
      setError(e.message);
    },
  });

  function run(action: ApprovalAction) {
    setError(null);
    if (action === "CLOSE_WITH_NOTE") {
      setNote("");
      setNoteError(undefined);
      return setNoteOpen(true);
    }
    if (action === "CANCEL_SESSION") {
      setCancelFields({});
      return setCancelOpen(true);
    }
    decide.mutate({ action });
  }

  function submitNote(e: FormEvent) {
    e.preventDefault();
    const value = note.trim();
    if (value.length < 1 || value.length > NOTE_MAX) return setNoteError(COPY.noteRequired);
    setNoteError(undefined);
    decide.mutate({ action: "CLOSE_WITH_NOTE", note: value });
  }

  const [typeLabel, tone] = APPROVAL_TYPE[item.type];
  const isReturn = item.session_type === "RETURN";
  const minutes = Math.max(0, Math.floor((now - Date.parse(item.created_at)) / 60_000));
  const ctx = item.context;
  const other = ctx?.actual && ctx.actual !== item.tracking_number ? ctx.actual : null;
  const blocked = trayStillWrong(item);
  const headingId = `apr-${item.id}`;

  return (
    <article className="card p-4 sm:p-5" aria-labelledby={headingId}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="text-title-md text-on-surface">
          {item.station.name}
        </h2>
        <StatusChip tone={tone}>{typeLabel}</StatusChip>
        {item.session_type === "RETURN" && <StatusChip tone="info">{SESSION_TYPE.RETURN}</StatusChip>}
        <span className="flex-1" />
        <span className="text-body-md text-on-surface-variant tabular-nums">{COPY.waiting(minutes)}</span>
      </div>
      <dl className="mb-3 grid gap-x-6 gap-y-1 text-body-md sm:grid-cols-[auto_1fr]">
        <dt className="text-on-surface-variant">{COPY.trackingLabel}</dt>
        <dd>
          <TrackingNumber value={item.tracking_number} />
        </dd>
        {item.operator_name && (
          <>
            <dt className="text-on-surface-variant">{COPY.operatorLabel}</dt>
            <dd className="text-on-surface">{item.operator_name}</dd>
          </>
        )}
        {item.return_summary && (
          <>
            <dt className="text-on-surface-variant">{COPY.summaryLabel}</dt>
            <dd className="text-on-surface tabular-nums">
              {COPY.summary(
                item.return_summary.conclusion ? CONCLUSION_LABEL[item.return_summary.conclusion] : null,
                item.return_summary.snapshot_count,
                Math.max(0, Math.floor((now - Date.parse(item.return_summary.opened_at)) / 60_000)),
              )}
            </dd>
          </>
        )}
        {other && (
          <>
            <dt className="text-on-surface-variant">
              {ctx?.source === "CAM2" ? COPY.cam2Saw : COPY.scanned}
            </dt>
            <dd>
              <TrackingNumber value={other} />
            </dd>
          </>
        )}
      </dl>
      {blocked && <Alert kind="warning">{COPY.trayWarning}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {liveHref && (
          <Link to={liveHref} className="md-link mr-auto inline-flex items-center gap-1">
            {COPY.live}
          </Link>
        )}
        {/* Phiên hoàn: không có "Đóng phiên có ghi chú" — đóng bằng quét + kết luận (01 §10.5 D13 EXTEND). */}
        {actionsFor(item).map((action) => (
          <Button
            key={action}
            variant={VARIANT[action]}
            size="sm"
            disabled={decide.isPending || (action === "CLOSE_WITH_NOTE" && blocked)}
            onClick={() => run(action)}
          >
            {ACTION_LABEL[action]}
          </Button>
        ))}
      </div>

      <Dialog
        open={noteOpen}
        title={COPY.noteTitle}
        onClose={() => setNoteOpen(false)}
        actions={
          <Button type="submit" form={`${headingId}-note`} disabled={decide.isPending}>
            {COPY.noteConfirm}
          </Button>
        }
      >
        <form id={`${headingId}-note`} onSubmit={submitNote} noValidate>
          <p className="mb-4">
            {item.station.name} · {item.tracking_number}
          </p>
          <TextAreaField
            label={COPY.noteLabel}
            name={`${headingId}-note-text`}
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={noteError}
            hint={COPY.noteHint}
          />
        </form>
      </Dialog>

      {isReturn ? (
        cancelOpen && (
          <CancelReturnDialog
            open
            trackingNumber={item.tracking_number}
            busy={decide.isPending}
            fieldErrors={cancelFields}
            onSubmit={(reasonCode, note) => decide.mutate({ action: "CANCEL_SESSION", reasonCode, note })}
            onClose={() => setCancelOpen(false)}
          />
        )
      ) : (
        <Dialog
          open={cancelOpen}
          title={COPY.cancelTitle}
          onClose={() => setCancelOpen(false)}
          actions={
            <Button
              variant="danger"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ action: "CANCEL_SESSION" })}
            >
              {COPY.cancelConfirm}
            </Button>
          }
        >
          {COPY.cancelBody(item.tracking_number)}
        </Dialog>
      )}
    </article>
  );
}
