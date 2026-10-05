import { Link } from "react-router-dom";

import type { AttentionItem } from "@/lib/api/reports";
import { Icon } from "@/shared/ui";

import { attentionText, COPY } from "./copy";

const ICON: Record<AttentionItem["kind"], string> = {
  CANCELLED_AFTER_PACK: "warning",
  CAMERA_OFFLINE: "videocam_off",
  CLOCK_DRIFT: "schedule",
  APPROVAL_PENDING: "pending_actions",
  SYNC_ERROR: "cloud_off",
  DISK_USAGE: "storage",
};

/**
 * Khối "Cần xử lý" của D2. `canOpen(path)`: chỉ hiện nút tới màn mà vai này có và đã xây (DEC-51) —
 * vd. "Duyệt" chỉ có khi D13 có trong menu.
 */
export function AttentionList({
  items,
  canOpen,
}: {
  items: AttentionItem[];
  canOpen: (path: string) => boolean;
}) {
  if (items.length === 0) return <p className="text-body-md text-on-surface-variant">{COPY.noAttention}</p>;
  const action = (item: AttentionItem): [string, string] | null => {
    if (item.kind === "CANCELLED_AFTER_PACK")
      return [COPY.view, "/admin/packages?warehouse_status=CANCELLED_AFTER_PACK"];
    if (item.kind === "APPROVAL_PENDING") return [COPY.approve, "/admin/approvals"];
    if (item.kind === "CAMERA_OFFLINE" || item.kind === "CLOCK_DRIFT")
      return [COPY.view, "/admin/settings/stations"];
    if (item.kind === "SYNC_ERROR") return [COPY.view, "/admin/settings/shopee"];
    if (item.kind === "DISK_USAGE") return [COPY.view, "/admin/settings/storage"];
    return null;
  };
  return (
    <ul className="flex flex-col divide-y divide-outline-variant">
      {items.map((item, i) => {
        const link = action(item);
        const path = link?.[1].split("?")[0];
        return (
          <li key={`${item.kind}-${i}`} className="flex items-center gap-3 py-3 text-body-md text-on-surface">
            <Icon name={ICON[item.kind]} className="text-warning" />
            <span className="flex-1">{attentionText(item)}</span>
            {link && path && canOpen(path) && (
              <Link to={link[1]} className="md-link shrink-0">
                {link[0]}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
