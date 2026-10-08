import { Link } from "react-router-dom";

import { isKnownAttention, type AnyAttentionItem } from "@/lib/api/reports";
import { vnDay } from "@/shared/format";
import { Icon } from "@/shared/ui";

import { attentionText, COPY } from "./copy";
import { droppedPath } from "./links";

const ICON: Record<AnyAttentionItem["kind"], string> = {
  CANCELLED_AFTER_PACK: "warning",
  CAMERA_OFFLINE: "videocam_off",
  CLOCK_DRIFT: "schedule",
  APPROVAL_PENDING: "pending_actions",
  CLIP_FAILED: "error",
  SYNC_ERROR: "cloud_off",
  DISK_USAGE: "storage",
  RETURN_MISSING: "warning",
  RECON_HIGH: "rule",
  CLAIM_DUE_SOON: "timer",
  RETURN_UNIDENTIFIED: "help",
  RETURN_SESSION_ABANDONED: "assignment_late",
  RETURN_FORCE_NEW: "link_off",
  REFUND_ONLY_PENDING: "timer",
  CLAIM_OVERDUE: "warning",
  RETURN_SESSION_DROPPED: "assignment_return",
  BACKUP_STALE: "cloud_off",
  CANCEL_REVERT_PENDING: "settings_backup_restore",
};

/** Nút của từng dòng → màn lọc sẵn (01 §10.5 D2). */
function action(item: AnyAttentionItem, today: string): [string, string] | null {
  switch (item.kind) {
    case "CANCELLED_AFTER_PACK":
      return [COPY.view, "/admin/packages?warehouse_status=CANCELLED_AFTER_PACK"];
    case "APPROVAL_PENDING":
      return [COPY.approve, "/admin/approvals"];
    case "CAMERA_OFFLINE":
    case "CLOCK_DRIFT":
      return [COPY.view, "/admin/settings/stations"];
    // API-30 chưa có bộ lọc trạng thái clip → mở D3 không lọc (02b-admin DEC-171).
    case "CLIP_FAILED":
      return [COPY.view, "/admin/packages"];
    case "SYNC_ERROR":
      return [COPY.view, "/admin/settings/platforms"];
    case "DISK_USAGE":
      return [COPY.view, "/admin/settings/storage"];
    case "RETURN_MISSING":
      return [COPY.view, "/admin/returns?tab=MISSING"];
    case "RECON_HIGH":
      return [COPY.view, "/admin/recon?severity=HIGH"];
    case "CLAIM_DUE_SOON":
      return [COPY.view, "/admin/claims?status=ALL&due=soon"];
    case "RETURN_UNIDENTIFIED":
    case "RETURN_FORCE_NEW":
      return [COPY.link, "/admin/returns?tab=UNIDENTIFIED"];
    case "RETURN_SESSION_ABANDONED":
      return [COPY.view, "/admin/packages?session_type=RETURN&session_status=ABANDONED"];
    // item 03 (02 §6.2 API-32 mở rộng).
    case "REFUND_ONLY_PENDING":
      return [COPY.view, "/admin/returns?tab=NO_PARCEL&pending_only=true"];
    case "CLAIM_OVERDUE":
      return [COPY.view, "/admin/claims?status=NEW&due=overdue"];
    case "RETURN_SESSION_DROPPED":
      return [COPY.view, droppedPath(today)];
    // D23 (T-259) — `canOpen` theo vai (chỉ ADMIN thấy mục này — DEC-452).
    case "BACKUP_STALE":
      return [COPY.view, "/admin/settings/backup"];
    // Việc ở dòng lệnh máy chủ — không có màn để mở.
    case "CANCEL_REVERT_PENDING":
      return null;
  }
}

/**
 * Khối "Cần xử lý" của D2 (kind lạ bị bỏ qua). `canOpen(path)`: chỉ hiện nút tới màn mà vai này có và đã xây (DEC-51) —
 * vd. "Duyệt" chỉ có khi D13 có trong menu. `missingDays`: ngưỡng hàng hoàn chưa về (API-80) cho chữ `RETURN_MISSING`.
 */
export function AttentionList({
  items: all,
  canOpen,
  missingDays,
  today = vnDay(),
}: {
  items: { kind: string }[];
  canOpen: (path: string) => boolean;
  missingDays?: number;
  /** Ngày hôm nay giờ VN (link "7 ngày"). */
  today?: string;
}) {
  // Contract API-32: client bỏ qua kind không biết (không render dòng trống — review G3 F12).
  const items = all.filter(isKnownAttention);
  if (items.length === 0) return <p className="text-body-md text-on-surface-variant">{COPY.noAttention}</p>;
  return (
    <ul className="flex flex-col divide-y divide-outline-variant">
      {items.map((item, i) => {
        const link = action(item, today);
        const path = link?.[1].split("?")[0];
        return (
          <li key={`${item.kind}-${i}`} className="flex items-center gap-3 py-3 text-body-md text-on-surface">
            <Icon name={ICON[item.kind]} className="text-warning" />
            <span className="flex-1">{attentionText(item, missingDays)}</span>
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
