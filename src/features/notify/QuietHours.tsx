import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { isApiError } from "@/lib/api/errors";
import { notifyApi, type NotifyChannels, type QuietHours } from "@/lib/api/notify";
import { Alert, Button, Dialog, TextField, toast } from "@/shared/ui";

import { COPY, QUIET } from "./copy";
import { CHANNELS_KEY, quietErrors, type QuietErrors } from "./rules";

/**
 * Dialog giờ yên lặng (01 §10.5 D22, FR-06.08 / BR-36; API-176): 2 ô giờ + "Tắt giờ yên lặng". Tắt vẫn gửi 2 giờ cũ
 * (contract cần đủ). 422 `fields.start` / `fields.end` → dưới ô.
 */
function QuietHoursDialog({ value, onClose }: { value: QuietHours; onClose: () => void }) {
  const qc = useQueryClient();
  const [start, setStart] = useState(value.start);
  const [end, setEnd] = useState(value.end);
  const [off, setOff] = useState(!value.enabled);
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<QuietErrors>({});
  const [error, setError] = useState<string | null>(null);
  const errors = { ...serverErrors, ...(touched ? quietErrors(start, end) : {}) };
  const save = useMutation({
    mutationFn: (body: QuietHours) => notifyApi.quietHours(body),
    onMutate: () => setError(null),
    onSuccess: (quiet) => {
      qc.setQueryData<NotifyChannels>(CHANNELS_KEY, (d) => (d ? { ...d, quiet_hours: quiet } : d));
      void qc.invalidateQueries({ queryKey: CHANNELS_KEY });
      toast(QUIET.saved);
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && (e.fieldErrors.start || e.fieldErrors.end))
        return setServerErrors({ start: e.fieldErrors.start, end: e.fieldErrors.end });
      setError(isApiError(e) ? e.message : COPY.generic);
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerErrors({});
    if (Object.keys(quietErrors(start, end)).length > 0) return;
    save.mutate({ enabled: !off, start, end });
  }
  const formId = "notify-quiet-form";
  return (
    <Dialog
      open
      title={QUIET.title}
      onClose={onClose}
      closeLabel={QUIET.cancel}
      actions={
        <Button type="submit" form={formId} disabled={save.isPending}>
          {QUIET.save}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <p className="mb-4">{QUIET.hint}</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            name="quiet-start"
            type="time"
            label={QUIET.start}
            value={start}
            disabled={off}
            error={errors.start}
            onChange={(e) => setStart(e.target.value)}
          />
          <TextField
            name="quiet-end"
            type="time"
            label={QUIET.end}
            value={end}
            disabled={off}
            error={errors.end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-3 text-body-lg text-on-surface">
          <input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} />
          {QUIET.off}
        </label>
      </form>
    </Dialog>
  );
}

/** Dòng "Giờ yên lặng: 22:00 – 07:00 (chỉ gửi mức Cao) [Sửa]" (01 §10.5 D22). */
export function QuietHoursCard({ value }: { value: QuietHours }) {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label={QUIET.title}
      className="card mb-6 flex flex-wrap items-center justify-between gap-2 px-4 py-3"
    >
      <p className="text-body-lg text-on-surface">
        {value.enabled ? QUIET.summary(value.start, value.end) : QUIET.summaryOff}
      </p>
      <Button variant="text" size="sm" icon="edit" aria-label={QUIET.editLabel} onClick={() => setOpen(true)}>
        {QUIET.edit}
      </Button>
      {open && <QuietHoursDialog value={value} onClose={() => setOpen(false)} />}
    </section>
  );
}
