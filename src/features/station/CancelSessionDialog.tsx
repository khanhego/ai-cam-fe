import { useState } from "react";

import { isApiError } from "@/lib/api/errors";
import type { CancelReason } from "@/lib/api/station";
import { Button, Dialog, TextAreaField } from "@/shared/ui";

import { COPY } from "./copy";
import { useStationStore } from "./stationStore";

/** Hủy phiên kèm lý do (FR-03.08, API-12). "Khác" bắt buộc ghi chú ≤ 200 ký tự. */
export function CancelSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cancel = useStationStore((s) => s.cancel);
  const [reason, setReason] = useState<CancelReason>("OUT_OF_STOCK");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (reason === "OTHER" && !note.trim()) {
      setError(COPY.cancelDialog.noteRequired);
      return;
    }
    setBusy(true);
    try {
      await cancel(reason, reason === "OTHER" ? note.trim() : undefined);
      onClose();
    } catch (e) {
      setError(isApiError(e) ? (e.fieldErrors.note ?? e.message) : COPY.cancelDialog.noteRequired);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={COPY.cancelDialog.title}
      onClose={onClose}
      actions={
        <Button variant="danger" onClick={confirm} disabled={busy}>
          {COPY.cancelDialog.confirm}
        </Button>
      }
    >
      <fieldset className="mb-4 flex flex-col gap-3">
        {(Object.keys(COPY.cancelDialog.reasons) as CancelReason[]).map((key) => (
          <label key={key} className="flex items-center gap-3 text-body-lg text-on-surface">
            <input type="radio" name="reason" checked={reason === key} onChange={() => setReason(key)} />
            {COPY.cancelDialog.reasons[key]}
          </label>
        ))}
      </fieldset>
      {reason === "OTHER" && (
        <TextAreaField
          label={COPY.cancelDialog.note}
          name="note"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={error}
        />
      )}
    </Dialog>
  );
}
