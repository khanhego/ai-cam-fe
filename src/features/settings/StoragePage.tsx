import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { isApiError } from "@/lib/api/errors";
import {
  settingsApi,
  THRESHOLD_KEYS,
  type RetentionImpact,
  type SettingsPutBody,
  type SystemSettings,
} from "@/lib/api/settings";
import { Alert, Button, PageHeader, Skeleton, TextField, toast } from "@/shared/ui";

import { COPY } from "./copy";
import { HealthPanel } from "./HealthPanel";
import { RetentionConfirmDialog } from "./RetentionConfirmDialog";
import {
  isReduction,
  PHASE1_KEYS,
  PHASE3_NUMBER_KEYS,
  SETTINGS_KEYS,
  validateSettings,
  type SettingsForm,
  type SettingsKey,
} from "./rules";

const toForm = (s: SystemSettings): SettingsForm =>
  Object.fromEntries(SETTINGS_KEYS.map((k) => [k, String(s[k])])) as SettingsForm;

type Body = Omit<SettingsPutBody, "confirm_reduction">;

/**
 * Form D8 (01 §10.5 D8, FR-02.10): retention + chữ sàn tối thiểu, ngưỡng phiên, 6 ngưỡng item 02. Giảm số ngày giữ →
 * `RetentionConfirmDialog` trước khi gửi (API-82); server vẫn trả `409 RETENTION_REDUCTION_UNCONFIRMED` (giá trị trên
 * máy chủ đã đổi) → mở Dialog với `details.impact`; "Giảm và lưu" gửi lại `confirm_reduction: true`.
 * `RETENTION_BELOW_MINIMUM` → lỗi dưới ô clip theo `details.min`.
 */
function SettingsEditor({ initial }: { initial: SystemSettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SettingsForm>(() => toForm(initial));
  const [packer, setPacker] = useState(initial.packer_name_required);
  const [errors, setErrors] = useState<Partial<Record<SettingsKey, string>>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ body: Body; impact: RetentionImpact | null } | null>(null);
  const dirty =
    SETTINGS_KEYS.some((k) => form[k] !== String(initial[k])) || packer !== initial.packer_name_required;
  const min = initial.retention_clip_min_days;

  const save = useMutation({
    mutationFn: (body: SettingsPutBody) => settingsApi.put(body),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      setForm(toForm(data));
      setPacker(data.packer_name_required);
      setConfirm(null);
      toast(COPY.saved);
    },
    onError: (e, body) => {
      if (isApiError(e) && e.code === "RETENTION_REDUCTION_UNCONFIRMED") {
        const impact = (e.details.impact as RetentionImpact | undefined) ?? null;
        return setConfirm({ body, impact });
      }
      setConfirm(null);
      if (isApiError(e) && e.code === "RETENTION_BELOW_MINIMUM")
        return setErrors({
          retention_clip_days: COPY.belowMin(typeof e.details.min === "number" ? e.details.min : min),
        });
      if (isApiError(e) && Object.keys(e.fieldErrors).length > 0) setErrors(e.fieldErrors);
      else setAlert(isApiError(e) ? e.message : COPY.generic);
    },
  });

  function submit(ev: FormEvent) {
    ev.preventDefault();
    setAlert(null);
    const { errors: errs, value } = validateSettings(form, min);
    setErrors(errs);
    if (!value) return;
    const body = { ...value, packer_name_required: packer };
    if (isReduction(value, initial)) setConfirm({ body, impact: null });
    else save.mutate(body);
  }

  const field = (k: SettingsKey) => (
    <TextField
      key={k}
      name={k}
      label={COPY.field[k]}
      hint={k === "retention_clip_days" ? `${COPY.hint[k]} ${COPY.minClip(min)}` : COPY.hint[k]}
      error={errors[k]}
      inputMode="numeric"
      value={form[k]}
      onChange={(e) => {
        setForm({ ...form, [k]: e.target.value });
        if (errors[k]) setErrors({ ...errors, [k]: undefined });
      }}
    />
  );

  return (
    <form noValidate onSubmit={submit} className="card p-4 sm:p-6" aria-label={COPY.title}>
      {alert && <Alert kind="error">{alert}</Alert>}
      <h2 className="mb-4 text-title-md text-on-surface">{COPY.retentionTitle}</h2>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {field("retention_raw_days")}
        {field("retention_clip_days")}
      </div>
      <h2 className="mb-4 text-title-md text-on-surface">{COPY.sessionTitle}</h2>
      <div className="grid gap-x-4 sm:grid-cols-2">{PHASE1_KEYS.slice(2).map(field)}</div>
      <h2 className="mb-4 text-title-md text-on-surface">{COPY.thresholdTitle}</h2>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {[...THRESHOLD_KEYS, ...PHASE3_NUMBER_KEYS].map(field)}
      </div>
      <h2 className="mb-2 text-title-md text-on-surface">{COPY.stationTitle}</h2>
      <label className="flex items-center gap-3 text-body-lg text-on-surface">
        <input
          type="checkbox"
          role="switch"
          name="packer_name_required"
          checked={packer}
          aria-checked={packer}
          onChange={(e) => setPacker(e.target.checked)}
        />
        {COPY.packerRequired}
      </label>
      <p className="mt-1 mb-5 ml-8 text-body-sm text-on-surface-variant">{COPY.packerRequiredHint}</p>
      <div className="flex justify-end gap-2">
        <Button
          variant="text"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setForm(toForm(initial));
            setPacker(initial.packer_name_required);
            setErrors({});
          }}
        >
          {COPY.reset}
        </Button>
        <Button type="submit" disabled={!dirty || save.isPending}>
          {COPY.save}
        </Button>
      </div>
      {confirm && (
        <RetentionConfirmDialog
          retention={confirm.body}
          impact={confirm.impact}
          saving={save.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => save.mutate({ ...confirm.body, confirm_reduction: true })}
        />
      )}
    </form>
  );
}

/** D8 — Lưu trữ và ngưỡng + sức khỏe hệ thống (01 §10.5, FR-02.06, 02.10; API-80, API-81, API-82). */
export default function StoragePage() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
  return (
    <>
      <PageHeader title={COPY.title} subtitle={COPY.subtitle} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          {settings.isPending && (
            <div className="card p-6">
              <Skeleton lines={4} className="h-10" />
            </div>
          )}
          {settings.isError && (
            <Alert
              kind="error"
              action={
                <Button variant="text" onClick={() => settings.refetch()}>
                  {COPY.retry}
                </Button>
              }
            >
              {COPY.loadError}
            </Alert>
          )}
          {settings.data && <SettingsEditor key={settings.data.updated_at ?? "s"} initial={settings.data} />}
        </div>
        <HealthPanel />
      </div>
    </>
  );
}
