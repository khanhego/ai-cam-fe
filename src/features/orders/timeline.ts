import type { PackageDetail } from "@/lib/api/packages";
import { platformStatus, WAREHOUSE_STATUS } from "@/shared/labels";

import { COPY } from "./copy";

/** Một dòng thời gian kiện (D4, D15 "Lịch sử gần nhất"): "Kho: Đã đóng gói · Station 01" / "Shopee: Chờ lấy hàng". */
export function timelineText(t: PackageDetail["timeline"][number]) {
  const status =
    t.source === "PLATFORM"
      ? `${COPY.detail.platform}: ${platformStatus(t.to_status)}`
      : `${COPY.detail.warehouse}: ${WAREHOUSE_STATUS[t.to_status as keyof typeof WAREHOUSE_STATUS]?.[0] ?? "—"}`;
  return t.actor ? `${status} · ${t.actor}` : status;
}
