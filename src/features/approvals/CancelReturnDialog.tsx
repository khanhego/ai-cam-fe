import { useState } from "react";

import type { CancelReturnReason } from "@/lib/api/approvals";
import { Button, Dialog, TextAreaField } from "@/shared/ui";

import { COPY } from "./copy";

const C = COPY.cancelReturn;
const NOTE_MIN = 5;
const NOTE_MAX = 500;
const REASONS = Object.keys(C.reasons) as CancelReturnReason[];

/**
 * D13 "Hủy phiên mở hoàn?" (01 §10.5 D13 v0.4, FR-04.14, DEC-514 / 525): radio "Lý do*" không chọn sẵn + "Ghi chú*" 5–500;
 * chữ dưới đổi theo lý do; [Hủy phiên] khóa tới khi hợp lệ → API-21 `{action: CANCEL_SESSION, reason_code, note}`. Lỗi
 * server `fields.reason_code` / `fields.note` dưới ô.
 */
export function CancelReturnDialog({
  open,
  trackingNumber,
  busy,
  fieldErrors,
  onSubmit,
  onClose,
}: {
  open: boolean;
  trackingNumber: string;
  busy: boolean;
  fieldErrors: Record<string, string>;
  onSubmit: (reason: CancelReturnReason, note: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<CancelReturnReason | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const text = note.trim();
  const noteBad = text.length < NOTE_MIN || text.length > NOTE_MAX;
  const valid = Boolean(reason) && !noteBad;
  const hint = reason === "OTHER" ? C.other : reason ? C.excluded : null;
  const reasonError = fieldErrors.reason_code;
  return (
    <Dialog
      open={open}
      title={C.title}
      onClose={onClose}
      closeLabel={C.back}
      actions={
        <Button variant="danger" disabled={busy || !valid} onClick={() => reason && onSubmit(reason, text)}>
          {C.confirm}
        </Button>
      }
    >
      <p className="mb-3 text-on-surface">{COPY.cancelReturnBody(trackingNumber)}</p>
      <fieldset className="mb-4" aria-describedby={reasonError ? "cancel-return-reason-err" : undefined}>
        <legend className="mb-2 text-label-lg text-on-surface">{C.reason}</legend>
        <div className="flex flex-col gap-2">
          {REASONS.map((k) => (
            <label key={k} className="flex items-center gap-3 text-body-lg text-on-surface">
              <input
                type="radio"
                name="cancel-return-reason"
                checked={reason === k}
                onChange={() => setReason(k)}
              />
              {C.reasons[k]}
            </label>
          ))}
        </div>
        {reasonError && (
          <p id="cancel-return-reason-err" role="alert" className="mt-1 text-body-sm text-error">
            {reasonError}
          </p>
        )}
      </fieldset>
      <TextAreaField
        name="cancel-return-note"
        label={C.note}
        placeholder={C.notePlaceholder}
        rows={2}
        maxLength={NOTE_MAX + 50}
        value={note}
        onBlur={() => setTouched(true)}
        onChange={(e) => setNote(e.target.value)}
        error={(touched && noteBad ? C.noteRule : undefined) ?? fieldErrors.note}
      />
      {hint && <p aria-live="polite">{hint}</p>}
    </Dialog>
  );
}
