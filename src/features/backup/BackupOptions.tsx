import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { backupApi, type BackupSettingsInput, type BackupStatus } from "@/lib/api/backup";
import { isApiError } from "@/lib/api/errors";
import { Alert, Button, TextField, toast } from "@/shared/ui";

import { COPY } from "./copy";
import { parseUploadMbps } from "./rules";

const O = COPY.options;
const SIZE = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function useSaveSettings(onFieldError?: (fields: Record<string, string>) => void) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: BackupSettingsInput) => backupApi.updateSettings(body),
    onMutate: () => setError(null),
    onSuccess: (data) => {
      qc.setQueryData(["backup"], data);
      toast(O.saved);
    },
    onError: (e) => {
      if (isApiError(e) && Object.keys(e.fieldErrors).length > 0 && onFieldError)
        return onFieldError(e.fieldErrors);
      if (isApiError(e) && e.code === "BACKUP_NOT_CONFIGURED")
        void qc.invalidateQueries({ queryKey: ["backup"] });
      setError(isApiError(e) ? e.message : COPY.generic);
    },
  });
  return { save, error };
}

/** FR-02.18 (C): công tắc "Sao lưu thêm mọi clip đóng gói" + ước tính GB / ngày (API-181 `all_pack_clips`). */
function AllPackClipsSwitch({ status }: { status: BackupStatus }) {
  const { save, error } = useSaveSettings();
  const { all_pack_clips: on, all_pack_clips_estimate_gb_per_day: gb } = status.settings;
  return (
    <div className="mb-4">
      {error && <Alert kind="error">{error}</Alert>}
      <label className="flex items-center gap-3 text-body-lg text-on-surface">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          aria-checked={on}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ all_pack_clips: e.target.checked })}
        />
        {O.allPackClips}
      </label>
      {gb !== null && (
        <p className="mt-1 ml-8 text-body-sm text-on-surface-variant">{O.estimate(SIZE.format(gb))}</p>
      )}
    </div>
  );
}

/** "Nâng cao" thu gọn (DEC-486): "Giới hạn tốc độ tải lên (Mbit/s)" 1–1000. */
function AdvancedSettings({ status }: { status: BackupStatus }) {
  const current = String(status.settings.upload_mbps);
  const [value, setValue] = useState(current);
  const [shown, setShown] = useState(current);
  const [fieldError, setFieldError] = useState<string | undefined>();
  if (shown !== current) {
    // Giá trị server đổi (WS / tab khác) → nạp lại ô.
    setShown(current);
    setValue(current);
  }
  const { save, error } = useSaveSettings((f) => setFieldError(f.upload_mbps ?? O.uploadRule));
  function submit(e: FormEvent) {
    e.preventDefault();
    const v = parseUploadMbps(value);
    if (v === null) return setFieldError(O.uploadRule);
    setFieldError(undefined);
    save.mutate({ upload_mbps: v });
  }
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-title-sm text-on-surface">{O.advanced}</summary>
      <form noValidate onSubmit={submit} className="mt-4 flex flex-wrap items-start gap-3">
        {error && (
          <div className="w-full">
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        <TextField
          name="upload_mbps"
          label={O.uploadMbps}
          hint={O.uploadHint}
          error={fieldError}
          inputMode="numeric"
          className="mb-0 max-w-md flex-1"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (fieldError) setFieldError(undefined);
          }}
        />
        <Button type="submit" variant="tonal" className="mt-2" disabled={value === current || save.isPending}>
          {O.save}
        </Button>
      </form>
    </details>
  );
}

export function BackupOptions({ status }: { status: BackupStatus }) {
  return (
    <section aria-labelledby="backup-options" className="card mb-6 p-4 sm:p-6">
      <h2 id="backup-options" className="mb-3 text-title-md text-on-surface">
        {O.title}
      </h2>
      <AllPackClipsSwitch status={status} />
      <AdvancedSettings status={status} />
    </section>
  );
}
