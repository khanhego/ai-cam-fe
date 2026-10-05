import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { isApiError } from "@/lib/api/errors";
import { settingsApi, type SystemSettings } from "@/lib/api/settings";
import { Alert, Button, PageHeader, Skeleton, TextField, toast } from "@/shared/ui";

import { COPY } from "./copy";
import { HealthPanel } from "./HealthPanel";
import { SETTINGS_KEYS, validateSettings, type SettingsForm } from "./rules";

const toForm = (s: SystemSettings): SettingsForm =>
  Object.fromEntries(SETTINGS_KEYS.map((k) => [k, String(s[k])])) as SettingsForm;

function SettingsEditor({ initial }: { initial: SystemSettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SettingsForm>(() => toForm(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsForm, string>>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const dirty = SETTINGS_KEYS.some((k) => form[k] !== String(initial[k]));

  const save = useMutation({
    mutationFn: settingsApi.put,
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      setForm(toForm(data));
      toast(COPY.saved);
    },
    onError: (e) => {
      if (isApiError(e) && Object.keys(e.fieldErrors).length > 0) setErrors(e.fieldErrors);
      else setAlert(isApiError(e) ? e.message : COPY.generic);
    },
  });

  function submit(ev: FormEvent) {
    ev.preventDefault();
    setAlert(null);
    const { errors: errs, value } = validateSettings(form);
    setErrors(errs);
    if (value) save.mutate(value);
  }

  const field = (k: keyof SettingsForm) => (
    <TextField
      name={k}
      label={COPY.field[k]}
      hint={COPY.hint[k]}
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
      <div className="grid gap-x-4 sm:grid-cols-2">
        {field("session_warn_minutes")}
        {field("session_abandon_minutes")}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="text"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setForm(toForm(initial));
            setErrors({});
          }}
        >
          {COPY.reset}
        </Button>
        <Button type="submit" disabled={!dirty || save.isPending}>
          {COPY.save}
        </Button>
      </div>
    </form>
  );
}

/** D8 — Lưu trữ video + sức khỏe hệ thống (01 §10.5, FR-02.06; API-80, API-81). */
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
