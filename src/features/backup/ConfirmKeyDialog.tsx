import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { backupApi } from "@/lib/api/backup";
import { isApiError } from "@/lib/api/errors";
import { Alert, Button, Dialog, toast } from "@/shared/ui";

import { COPY } from "./copy";

const C = COPY.confirmKey;

/**
 * "Đã cất khóa giải mã?" (01 §10.5 D23, FR-02.17, API-182). Gửi đúng dấu vân tay đang hiện; [Bật sao lưu] khóa tới khi
 * tick. `409 BACKUP_KEY_MISMATCH` (khóa vừa đổi) → Alert + tải lại API-180; dấu vân tay mới hiện ra thì bỏ tick để
 * Admin đọc lại (DEC-634).
 */
export function ConfirmKeyDialog({ fingerprint, onClose }: { fingerprint: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownFp, setShownFp] = useState(fingerprint);
  if (shownFp !== fingerprint) {
    setShownFp(fingerprint);
    setChecked(false);
  }
  const confirm = useMutation({
    mutationFn: () => backupApi.confirmKey(fingerprint),
    onSuccess: (data) => {
      qc.setQueryData(["backup"], data);
      void qc.invalidateQueries({ queryKey: ["health"] });
      toast(COPY.enabledToast);
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && e.code === "BACKUP_KEY_MISMATCH") {
        setError(C.mismatch);
        void qc.invalidateQueries({ queryKey: ["backup"] });
        return;
      }
      setError(isApiError(e) ? e.message : COPY.generic);
    },
  });
  const [before, after] = C.body(fingerprint).split(C.bodyStrong);
  return (
    <Dialog
      open
      title={C.title}
      onClose={onClose}
      closeLabel={C.cancel}
      actions={
        <Button disabled={!checked || confirm.isPending} onClick={() => confirm.mutate()}>
          {C.submit}
        </Button>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <p className="mb-4">
        {before}
        <strong className="text-on-surface">{C.bodyStrong}</strong>
        {after}
      </p>
      <label className="flex items-start gap-3 text-body-lg text-on-surface">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        {C.check}
      </label>
    </Dialog>
  );
}
