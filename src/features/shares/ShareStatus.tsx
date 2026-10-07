import type { Share, ShareBrief } from "@/lib/api/shares";
import { fmtShort } from "@/shared/format";
import { SHARE_STATUS } from "@/shared/labels";
import { cx, Icon, StatusChip } from "@/shared/ui";

import { LIST } from "./copy";

const DAY_MS = 86_400_000;

/** Link còn hiệu lực sắp hết hạn (≤ 24 giờ) → chữ đỏ (01 §10.5 D21 cột "hết hạn"). */
const expiresSoon = (s: Pick<Share, "status" | "expires_at">, now = Date.now()) =>
  (s.status === "ACTIVE" || s.status === "CREATING") && Date.parse(s.expires_at) - now <= DAY_MS;

export function ShareExpires({
  share,
  prefix,
}: {
  share: Pick<Share, "status" | "expires_at">;
  prefix?: boolean;
}) {
  const text = fmtShort(share.expires_at);
  return (
    <span className={cx("tabular-nums", expiresSoon(share) && "text-error")}>
      {prefix ? LIST.expiresShort(text) : text}
    </span>
  );
}

/**
 * Chip trạng thái link (01 §10.5 D21): Đang tạo / Đang hoạt động / Đã thu hồi — người, lúc / Hết hạn / Lỗi; thu hồi chưa
 * xóa xong trên cloud (EX-S7, `revoke_pending`) → chip "Đang thu hồi — chờ Internet" + ⓘ (nút có `aria-describedby`).
 */
export function ShareStatusChip({ share }: { share: Share | ShareBrief }) {
  if (share.status === "REVOKED" && share.revoke_pending) {
    const tipId = `share-pending-${share.id}`;
    return (
      <span className="inline-flex items-center gap-1">
        <StatusChip tone="warning" icon="cloud_off">
          {LIST.revokePending}
        </StatusChip>
        <button
          type="button"
          className="text-on-surface-variant"
          aria-label={LIST.revokePendingInfo}
          aria-describedby={tipId}
          title={LIST.revokePendingInfo}
        >
          <Icon name="info" size={18} />
        </button>
        <span id={tipId} className="sr-only">
          {LIST.revokePendingInfo}
        </span>
      </span>
    );
  }
  const [label, tone] = SHARE_STATUS[share.status];
  const revoked =
    share.status === "REVOKED" && "revoked_at" in share && share.revoked_at
      ? LIST.revokedBy(share.revoked_by?.display_name ?? null, fmtShort(share.revoked_at))
      : null;
  const failed = share.status === "FAILED" && "error" in share ? share.error?.message : undefined;
  return (
    <StatusChip tone={tone} title={failed}>
      {revoked ? `${label} — ${revoked}` : label}
    </StatusChip>
  );
}
