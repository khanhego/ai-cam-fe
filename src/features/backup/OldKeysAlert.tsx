import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { backupApi, type BackupStatus } from "@/lib/api/backup";
import { isApiError } from "@/lib/api/errors";
import { Alert, Button, Dialog, toast } from "@/shared/ui";

import { COPY } from "./copy";
import { fmtGb, n } from "./format";
import { writeLockTip } from "./rules";

const K = COPY.oldKeys;

/**
 * Còn bản mã hóa bằng khóa cũ (01 §10.5 D23 v0.3, EX-K7; API-180 `key.old_keys[]`). Chỉ hiện sau khi khóa hiện tại đã
 * xác nhận (`state` không phải `KEY_UNCONFIRMED` / `KEY_CHANGED` — DEC-638). Một Alert vàng mỗi khóa cũ; một nút
 * "Tải lại bằng chứng bằng khóa mới" (API-187 xếp mọi khóa cũ một lần) khi tổng `reuploadable > 0` — khóa theo `state`
 * (tooltip `DISABLED` "Sao lưu đang tắt. Bật sao lưu trước."). Dialog nói số tệp + GB + tệp đã xóa tại kho vẫn cần khóa
 * cũ → [Tải lại] → Toast "Đã xếp {queued} tệp vào hàng chờ." (số từ response).
 */
export function OldKeysAlert({ s }: { s: BackupStatus }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const reupload = useMutation({
    mutationFn: backupApi.reuploadOldKey,
    onSuccess: (r) => {
      setOpen(false);
      toast(K.queued(n(r.queued)));
      void qc.invalidateQueries({ queryKey: ["backup"] });
    },
    onError: (e) => {
      setOpen(false);
      toast(isApiError(e) ? e.message : COPY.generic);
      void qc.invalidateQueries({ queryKey: ["backup"] });
    },
  });

  const keys = s.key.old_keys;
  if (keys.length === 0 || s.state === "KEY_UNCONFIRMED" || s.state === "KEY_CHANGED") return null;
  const files = keys.reduce((a, k) => a + k.reuploadable, 0);
  const bytes = keys.reduce((a, k) => a + k.reuploadable_bytes, 0);
  const tip = writeLockTip(s);

  return (
    <div className="mb-4">
      {keys.map((k) => (
        <Alert key={k.fingerprint} kind="warning">
          {K.alert(n(k.evidence_objects), n(k.db_runs), k.fingerprint)}
        </Alert>
      ))}
      {files > 0 ? (
        <span title={tip ?? undefined} className="inline-flex">
          <Button variant="tonal" icon="cloud_sync" disabled={tip !== null} onClick={() => setOpen(true)}>
            {K.button}
          </Button>
        </span>
      ) : (
        <p className="text-body-sm text-on-surface-variant">{K.nothing}</p>
      )}
      {open && (
        <Dialog
          open
          title={K.dialogTitle}
          onClose={() => setOpen(false)}
          closeLabel={K.cancel}
          actions={
            <Button disabled={reupload.isPending} onClick={() => reupload.mutate()}>
              {K.confirm}
            </Button>
          }
        >
          <p className="mb-2 text-on-surface">{K.dialogBody(n(files), fmtGb(bytes))}</p>
          <p>{K.dialogNote}</p>
        </Dialog>
      )}
    </div>
  );
}
