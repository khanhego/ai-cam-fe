import { useState } from "react";

import type { Share, ShareBrief } from "@/lib/api/shares";
import { Button } from "@/shared/ui";

import { LIST } from "./copy";
import { copyLink } from "./copyLink";
import { RevokeShareDialog } from "./RevokeShareDialog";

/**
 * [Sao chép] (chỉ khi Đang hoạt động, có `url`) + [Thu hồi] (theo `can_revoke` của server — CSKH chỉ link mình tạo) —
 * 01 §10.5 D21, 02b-admin §7. Không hiện chuỗi URL (DEC-489).
 */
export function ShareActions({ share }: { share: Share | ShareBrief }) {
  const [revoking, setRevoking] = useState(false);
  const url = share.status === "ACTIVE" ? share.url : null;
  if (!url && !share.can_revoke) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {url && (
        <Button
          variant="text"
          size="sm"
          icon="content_copy"
          aria-label={LIST.copyAria(share.recipient)}
          onClick={() => void copyLink(url)}
        >
          {LIST.copy}
        </Button>
      )}
      {share.can_revoke && (
        <Button
          variant="text-danger"
          size="sm"
          icon="link_off"
          aria-label={LIST.revokeAria(share.recipient)}
          onClick={() => setRevoking(true)}
        >
          {LIST.revoke}
        </Button>
      )}
      {revoking && <RevokeShareDialog shareId={share.id} onClose={() => setRevoking(false)} />}
    </span>
  );
}
