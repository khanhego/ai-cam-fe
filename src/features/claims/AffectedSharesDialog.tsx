import { useState } from "react";

import type { AffectedShare } from "@/lib/api/claims";
import { fmtShort } from "@/shared/format";
import { Button, cx, Dialog, StatusChip } from "@/shared/ui";

import { RevokeShareDialog } from "../shares/RevokeShareDialog";
import { COPY } from "./copy";

const A = COPY.affected;

/**
 * "Phiên này đang có trong {n} link chia sẻ còn hiệu lực" (01 §10.5 D17 v0.5, FR-07.05, 08.07; 02b-admin §3 v0.4 —
 * DEC-531): mở thay Toast sau `MARK_WRONG_SCAN` khi API-189 trả `affected_shares` khác rỗng. Mỗi dòng: gửi cho · hết hạn ·
 * [Thu hồi link] khi `can_revoke` (xác nhận qua `RevokeShareDialog` → API-163 → Toast "Đã thu hồi link.", dòng gạch
 * ngang), không thì chữ "Nhờ Admin / Supervisor thu hồi". Không tự thu hồi.
 */
export function AffectedSharesDialog({ shares, onClose }: { shares: AffectedShare[]; onClose: () => void }) {
  const [revoking, setRevoking] = useState<AffectedShare | null>(null);
  const [revoked, setRevoked] = useState<Set<string>>(() => new Set());
  return (
    <>
      <Dialog open title={A.title(shares.length)} onClose={onClose} closeLabel={A.close}>
        <ul className="mb-3 flex flex-col divide-y divide-outline-variant">
          {shares.map((s) => {
            const done = revoked.has(s.id);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body-md">
                <span className={cx("min-w-0 flex-1 break-words", done && "line-through opacity-70")}>
                  <span className="text-on-surface">{s.recipient}</span>
                  <span className="text-on-surface-variant">
                    {" · "}
                    {A.expires(fmtShort(s.expires_at))}
                    {s.created_by ? ` · ${A.createdBy(s.created_by.display_name)}` : ""}
                  </span>
                </span>
                {done ? (
                  <StatusChip>{A.revoked}</StatusChip>
                ) : s.can_revoke ? (
                  <Button
                    variant="outlined-danger"
                    size="sm"
                    icon="link_off"
                    aria-label={A.revokeFor(s.recipient)}
                    onClick={() => setRevoking(s)}
                  >
                    {A.revoke}
                  </Button>
                ) : (
                  <span className="text-body-sm text-on-surface-variant">{A.askAdmin}</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-on-surface">{A.text}</p>
      </Dialog>
      {revoking && (
        <RevokeShareDialog
          shareId={revoking.id}
          onDone={() => setRevoked((prev) => new Set(prev).add(revoking.id))}
          onClose={() => setRevoking(null)}
        />
      )}
    </>
  );
}
