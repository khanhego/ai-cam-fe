import { useState } from "react";

import { isApiError } from "@/lib/api/errors";
import { fmtDate } from "@/shared/format";
import { WRONG_SCAN_CODE, type WrongScanCode } from "@/shared/labels";
import { Button, Dialog, TextAreaField } from "@/shared/ui";

import { COPY } from "./copy";
import type { ReviewVars } from "./useReviewSession";

const R = COPY.review;
const NOTE_MIN = 5;
const NOTE_MAX = 500;

export type ReviewMode = "MARK" | "UNMARK" | "REVIEW" | "OVERRIDE";

/**
 * Dialog API-189 (01 §10.5 D17 v0.4; 02b-admin §3 `WrongScanDialog` / `ConfirmReturnDialog` v0.3): MARK = "Đánh dấu phiên
 * quét nhầm?" (radio lý do không chọn sẵn + ghi chú + ngày giữ video), UNMARK = "Bỏ đánh dấu quét nhầm?", REVIEW = "Xác nhận
 * là phiên hoàn thật?" (phiên "Cần soát"). Ghi chú 5–500 mọi chế độ; lỗi server `fields.reason_code` / `fields.note` dưới ô.
 * T-266 (v0.4 — DEC-529): OVERRIDE = "Gỡ lý do hủy, xác nhận là phiên hoàn thật?" (phiên bị loại theo lý do hủy — ADMIN /
 * SUPERVISOR; cùng `CONFIRM_RETURN`, 403 → Toast `message` ở `useReviewSession`).
 */
export function ReviewSessionDialog({
  mode,
  sessionId,
  label,
  keepUntil,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  mode: ReviewMode;
  sessionId: string;
  /** "Phiên mở hoàn 06/10 09:10". */
  label: string;
  keepUntil?: string | null;
  busy: boolean;
  error: unknown;
  onSubmit: (vars: ReviewVars) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<WrongScanCode | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const text = note.trim();
  const noteErr = text.length < NOTE_MIN || text.length > NOTE_MAX ? R.noteRule : undefined;
  const reasonErr = mode === "MARK" && !reason ? R.reasonRequired : undefined;
  const fields = isApiError(error) && error.code === "VALIDATION_ERROR" ? error.fieldErrors : {};
  const title = {
    MARK: R.markTitle,
    UNMARK: R.unmarkTitle,
    REVIEW: R.confirmTitle,
    OVERRIDE: R.overrideTitle,
  }[mode];
  const submit = () => {
    setTouched(true);
    if (noteErr || reasonErr) return;
    onSubmit({
      sessionId,
      ...(mode === "OVERRIDE" ? { override: true } : {}),
      action:
        mode === "MARK" ? "MARK_WRONG_SCAN" : mode === "UNMARK" ? "UNMARK_WRONG_SCAN" : "CONFIRM_RETURN",
      ...(mode === "MARK" ? { reason_code: reason } : {}),
      note: text,
    });
  };
  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      closeLabel={R.cancel}
      actions={
        <Button variant={mode === "MARK" ? "danger" : "filled"} disabled={busy} onClick={submit}>
          {mode === "MARK" ? R.mark : mode === "UNMARK" ? R.unmarkConfirm : R.confirm}
        </Button>
      }
    >
      <p className="mb-3 text-on-surface">{label}</p>
      {mode === "MARK" && (
        <fieldset className="mb-4">
          <legend className="mb-2 text-label-lg text-on-surface">{R.reason}</legend>
          <div className="flex flex-col gap-2">
            {(Object.keys(WRONG_SCAN_CODE) as WrongScanCode[]).map((k) => (
              <label key={k} className="flex items-center gap-3 text-body-lg text-on-surface">
                <input
                  type="radio"
                  name="wrong-scan-reason"
                  checked={reason === k}
                  onChange={() => setReason(k)}
                />
                {WRONG_SCAN_CODE[k]}
              </label>
            ))}
          </div>
          {((touched && reasonErr) || fields.reason_code) && (
            <p role="alert" className="mt-1 text-body-sm text-error">
              {(touched && reasonErr) || fields.reason_code}
            </p>
          )}
        </fieldset>
      )}
      <TextAreaField
        name="review-note"
        label={R.note}
        hint={R.noteHint}
        rows={2}
        maxLength={NOTE_MAX + 50}
        value={note}
        error={(touched ? noteErr : undefined) ?? fields.note}
        onChange={(e) => setNote(e.target.value)}
      />
      <p>
        {mode === "MARK"
          ? R.markText(keepUntil ? fmtDate(keepUntil) : "—")
          : mode === "UNMARK"
            ? R.unmarkText
            : mode === "OVERRIDE"
              ? R.overrideText
              : R.confirmText}
      </p>
    </Dialog>
  );
}
