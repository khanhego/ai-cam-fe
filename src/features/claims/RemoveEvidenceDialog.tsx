import { useState } from "react";

import { fmtDate } from "@/shared/format";
import { Alert, Button, Dialog, TextAreaField } from "@/shared/ui";

import { COPY } from "./copy";

const E = COPY.evidence;
export const REASON_MIN = 5;
export const REASON_MAX = 500;

/**
 * "Bỏ bằng chứng?" cho **mọi** bằng chứng (01 §10.5 D17, BR-38, FR-08.09 — API-134 `note` 5–500): ô "Lý do*" + chữ ngày
 * giữ (`removal_keep_until` của dòng). Lỗi server (`fields.note`, mã khác) hiện trong dialog.
 */
export function RemoveEvidenceDialog({
  label,
  kind,
  keepUntil,
  busy,
  serverError,
  fieldError,
  onConfirm,
  onClose,
}: {
  /** Tên dòng ("Phiên mở hoàn 06/10 08:51", "Ảnh 06/10 10:16"). */
  label: string;
  kind: "SESSION" | "SNAPSHOT";
  keepUntil: string | null;
  busy: boolean;
  serverError?: string | null;
  fieldError?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const text = reason.trim();
  const invalid = text.length < REASON_MIN || text.length > REASON_MAX;
  return (
    <Dialog
      open
      title={E.removeDialogTitle}
      onClose={onClose}
      closeLabel={E.cancel}
      actions={
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            setTouched(true);
            if (!invalid) onConfirm(text);
          }}
        >
          {E.removeConfirm}
        </Button>
      }
    >
      <p className="mb-2 text-on-surface">{label}</p>
      {keepUntil && (
        <p className="mb-3">{(kind === "SESSION" ? E.keepSession : E.keepSnapshot)(fmtDate(keepUntil))}</p>
      )}
      <TextAreaField
        name="evidence-remove-reason"
        label={`${E.removeReason}*`}
        hint={E.removeReasonHint}
        rows={2}
        maxLength={REASON_MAX + 50}
        value={reason}
        error={(touched && invalid ? E.removeReasonRule : undefined) ?? fieldError}
        onChange={(e) => setReason(e.target.value)}
      />
      {serverError && <Alert kind="error">{serverError}</Alert>}
    </Dialog>
  );
}
