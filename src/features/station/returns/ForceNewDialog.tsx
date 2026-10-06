import { useState } from "react";

import { Button, Dialog, TextAreaField } from "@/shared/ui";

import { COPY } from "../copy";

const A = COPY.returnAlert;

/**
 * R4 "Đây là kiện khác — vẫn ghi hình" (EX-R11, DEC-265): ghi chú bắt buộc 5–200 → API-105
 * `{unidentified_code, force_new: true, note}` (02 §6.4 #2, §6.5 #1).
 */
export function ForceNewDialog({
  code,
  onSubmit,
  onClose,
}: {
  code: string | null;
  onSubmit: (note: string) => Promise<string | null>;
  onClose: () => void;
}) {
  return (
    <Dialog open={code !== null} title={A.recordOtherTitle} onClose={onClose}>
      {code !== null && <NoteForm key={code} code={code} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function NoteForm({ code, onSubmit }: { code: string; onSubmit: (note: string) => Promise<string | null> }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  async function submit() {
    const value = note.trim();
    if (value.length < 5 || value.length > 200) return setError(A.recordOtherNoteError);
    setBusy(true);
    setError((await onSubmit(value)) ?? undefined);
    setBusy(false);
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-title-lg text-on-surface">{code}</p>
      <TextAreaField
        label={A.recordOtherNote}
        name="force_new_note"
        autoFocus
        maxLength={200}
        rows={3}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setError(undefined);
        }}
        error={error}
      />
      <div className="flex justify-end">
        <Button className="h-14 px-8" disabled={busy} onClick={() => void submit()}>
          {A.recordOtherConfirm}
        </Button>
      </div>
    </div>
  );
}
