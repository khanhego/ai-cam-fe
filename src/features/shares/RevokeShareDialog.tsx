import { useMutation, useQueryClient } from "@tanstack/react-query";

import { isApiError } from "@/lib/api/errors";
import { sharesApi, type Share } from "@/lib/api/shares";
import { Button, Dialog, toast } from "@/shared/ui";

import { REVOKE } from "./copy";

/** Query cần làm mới sau thu hồi: D21, chi tiết link, khối Link ở D4 / D17 (02b-admin §4). */
const SHARE_KEYS = [["shares"], ["share"], ["claim"], ["package"]] as const;

/**
 * "Thu hồi link?" (01 §10.5 D21, FR-07.08; API-163): [Thu hồi link] (error) [Hủy] → Toast "Đã thu hồi link.". 409
 * `SHARE_NOT_ACTIVE` / 403 / 404 → Toast `message` + tải lại (02b-admin §8). Dùng ở D21, `SharesBlock` (D4 / D17) và
 * `AffectedSharesDialog`.
 */
export function RevokeShareDialog({
  shareId,
  onDone,
  onClose,
}: {
  shareId: string;
  /** Thu hồi thành công (item mới — `status = REVOKED`, `revoke_pending`). */
  onDone?: (share: Share) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const refresh = () => {
    for (const k of SHARE_KEYS) void qc.invalidateQueries({ queryKey: k });
  };
  const revoke = useMutation({
    mutationFn: () => sharesApi.revoke(shareId),
    onSuccess: (share) => {
      toast(REVOKE.done);
      refresh();
      onDone?.(share);
      onClose();
    },
    onError: (e) => {
      toast(isApiError(e) ? e.message : REVOKE.failed);
      refresh();
      onClose();
    },
  });
  return (
    <Dialog
      open
      title={REVOKE.title}
      onClose={onClose}
      closeLabel={REVOKE.cancel}
      actions={
        <Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
          {REVOKE.confirm}
        </Button>
      }
    >
      <p className="text-on-surface">{REVOKE.body}</p>
    </Dialog>
  );
}
