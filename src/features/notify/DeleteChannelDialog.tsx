import { useMutation, useQueryClient } from "@tanstack/react-query";

import { isApiError } from "@/lib/api/errors";
import { notifyApi, type NotifyChannel } from "@/lib/api/notify";
import { Button, Dialog, toast } from "@/shared/ui";

import { COPY, REMOVE } from "./copy";
import { NOTIFY_KEY } from "./rules";

/**
 * Menu ⋮ "Xóa kênh" → "Xóa kênh {tên}? Tin đang chờ của kênh này bị bỏ." (01 §10.5 D22; API-173 → 204, tin chờ →
 * `DROPPED`). Xong → Toast + làm mới kênh và nhật ký. 404 → Toast `message` + tải lại.
 */
export function DeleteChannelDialog({ channel, onClose }: { channel: NotifyChannel; onClose: () => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => notifyApi.remove(channel.id),
    onSuccess: () => toast(REMOVE.done(channel.name)),
    onError: (e) => toast(isApiError(e) ? e.message : COPY.generic),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: NOTIFY_KEY });
      onClose();
    },
  });
  return (
    <Dialog
      open
      title={REMOVE.title(channel.name)}
      onClose={onClose}
      closeLabel={REMOVE.cancel}
      actions={
        <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
          {REMOVE.confirm}
        </Button>
      }
    >
      <p className="text-on-surface">{REMOVE.body}</p>
    </Dialog>
  );
}
