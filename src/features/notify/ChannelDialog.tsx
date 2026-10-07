import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { isApiError } from "@/lib/api/errors";
import {
  notifyApi,
  type ChannelInput,
  type NotifyChannel,
  type NotifyChannels,
  type NotifyEventCode,
} from "@/lib/api/notify";
import { NOTIFY_CHANNEL_TYPE, NOTIFY_SEVERITY, type NotifyChannelType } from "@/shared/labels";
import { Alert, Button, Dialog, SegmentedButtons, StatusChip, TextField, toast } from "@/shared/ui";

import { COPY, DIALOG } from "./copy";
import { channelErrors, changedFields, NOTIFY_KEY, type ChannelErrors } from "./rules";

const TYPES: NotifyChannelType[] = ["TELEGRAM", "ZALO_OA"];

/**
 * "Thêm kênh" / "Sửa kênh" (01 §10.5 D22, FR-06.04 / 06.07; API-171 / 172): Tên kênh* 2–40, Loại* (`SegmentedButtons`,
 * loại chưa cấu hình khóa — EX-N1), Chat ID* / Zalo user ID* + hướng dẫn, N01..N10 dạng checkbox kèm mức (nhãn + mức
 * do server trả), công tắc "Bật". Không có ô token: bot / OA cấu hình trên máy chủ (DEC-408, DEC-760). Sửa → PATCH chỉ
 * trường đổi. Lỗi: 422 `fields.*` / 409 `CHANNEL_NAME_EXISTS` dưới ô; 409 `PROVIDER_NOT_CONFIGURED` → Alert + tải lại
 * (loại bị khóa); 404 → Toast + đóng.
 */
export function ChannelDialog({
  data,
  channel,
  onClose,
}: {
  data: NotifyChannels;
  /** Có → sửa kênh này; không → thêm. */
  channel?: NotifyChannel;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const locked = TYPES.filter((t) => !data.providers[t]?.configured && t !== channel?.type);
  const [form, setForm] = useState<ChannelInput>(() =>
    channel
      ? {
          name: channel.name,
          type: channel.type,
          target: channel.target,
          events: channel.events,
          enabled: channel.enabled,
        }
      : {
          name: "",
          type: TYPES.find((t) => data.providers[t]?.configured) ?? "TELEGRAM",
          target: "",
          events: [],
          enabled: true,
        },
  );
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<ChannelErrors>({});
  const [error, setError] = useState<string | null>(null);
  const clientErrors = touched ? channelErrors(form) : {};
  const errors = { ...serverErrors, ...clientErrors };
  const set = <K extends keyof ChannelInput>(key: K, value: ChannelInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setServerErrors((e) => ({ ...e, [key]: undefined }));
  };

  const save = useMutation({
    mutationFn: (body: ChannelInput) =>
      channel ? notifyApi.update(channel.id, changedFields(channel, body)) : notifyApi.create(body),
    onMutate: () => setError(null),
    onSuccess: (saved) => {
      toast(channel ? DIALOG.saved(saved.name) : DIALOG.added(saved.name));
      void qc.invalidateQueries({ queryKey: NOTIFY_KEY });
      onClose();
    },
    onError: (e) => {
      if (!isApiError(e)) return setError(COPY.generic);
      if (e.code === "NOT_FOUND") {
        toast(e.message);
        void qc.invalidateQueries({ queryKey: NOTIFY_KEY });
        return onClose();
      }
      if (e.code === "CHANNEL_NAME_EXISTS") return setServerErrors({ name: DIALOG.nameExists });
      if (e.code === "PROVIDER_NOT_CONFIGURED") void qc.invalidateQueries({ queryKey: NOTIFY_KEY });
      const fields = e.fieldErrors;
      if (Object.keys(fields).length > 0) return setServerErrors(fields);
      setError(e.message);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const body = { ...form, name: form.name.trim(), target: form.target.trim() };
    if (Object.keys(channelErrors(body)).length > 0) return;
    save.mutate(body);
  }

  const toggleEvent = (code: NotifyEventCode, on: boolean) =>
    set("events", on ? [...form.events, code] : form.events.filter((c) => c !== code));
  const formId = "notify-channel-form";

  return (
    <Dialog
      open
      wide
      title={channel ? DIALOG.editTitle : DIALOG.addTitle}
      onClose={onClose}
      closeLabel={DIALOG.cancel}
      actions={
        <Button type="submit" form={formId} disabled={save.isPending || locked.includes(form.type)}>
          {DIALOG.save}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        {locked.map((t) => (
          <Alert key={t} kind="info">
            {COPY.notConfigured[t]}
          </Alert>
        ))}
        <TextField
          name="notify-name"
          label={DIALOG.name}
          value={form.name}
          maxLength={60}
          autoComplete="off"
          error={errors.name}
          onChange={(e) => set("name", e.target.value)}
          className="mt-2"
        />
        <div className="mb-5">
          <p className="mb-2 text-label-lg text-on-surface-variant">{DIALOG.type}</p>
          <SegmentedButtons
            label={DIALOG.type}
            options={TYPES.map((t) => [t, NOTIFY_CHANNEL_TYPE[t]])}
            value={form.type}
            disabled={locked}
            onChange={(t) => set("type", t)}
          />
          {errors.type && <p className="mt-1 px-4 text-body-sm text-error">{errors.type}</p>}
        </div>
        <TextField
          name="notify-target"
          label={DIALOG.target[form.type]}
          value={form.target}
          inputMode={form.type === "TELEGRAM" ? "text" : "numeric"}
          maxLength={70}
          autoComplete="off"
          hint={DIALOG.targetHint[form.type]}
          error={errors.target}
          onChange={(e) => set("target", e.target.value)}
        />
        <fieldset className="mb-5" aria-describedby={errors.events ? "notify-events-error" : undefined}>
          <legend className="mb-2 text-label-lg text-on-surface-variant">{DIALOG.events}</legend>
          <ul className="grid gap-1 sm:grid-cols-2">
            {data.events.map((ev) => {
              const [sev, tone] = NOTIFY_SEVERITY[ev.severity] ?? [ev.severity, "neutral"];
              return (
                <li key={ev.code}>
                  <label className="flex items-start gap-2 py-1 text-body-md text-on-surface">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.events.includes(ev.code)}
                      onChange={(e) => toggleEvent(ev.code, e.target.checked)}
                    />
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {ev.label}
                      <StatusChip tone={tone}>{sev}</StatusChip>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {errors.events && (
            <p id="notify-events-error" className="mt-1 px-4 text-body-sm text-error">
              {errors.events}
            </p>
          )}
        </fieldset>
        <label className="flex items-center gap-3 text-body-lg text-on-surface">
          <input
            type="checkbox"
            role="switch"
            checked={form.enabled}
            aria-checked={form.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          {DIALOG.enabled}
        </label>
      </form>
    </Dialog>
  );
}
