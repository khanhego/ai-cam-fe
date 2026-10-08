import type { PackageDetail } from "@/lib/api/packages";
import { platformStatus, WAREHOUSE_STATUS, type Platform } from "@/shared/labels";

import { COPY } from "./copy";

const PLATFORM_SHORT: Record<Platform, string> = { SHOPEE: "Shopee", TIKTOK: "TikTok" };

/** Một dòng thời gian kiện (D4, D15 "Lịch sử gần nhất"): "Kho: Đã đóng gói · Station 01" / "Shopee: Chờ lấy hàng". */
export function timelineText(t: PackageDetail["timeline"][number]) {
  // item 03 (BR-32, TC-05.93): "Mã có ở 2 shop: TST B (Shopee), TST TikTok B (mock) (TikTok)".
  if (t.shops?.length) {
    const text = COPY.detail.ambiguousShop(
      t.shops.length,
      t.shops.map((s) => `${s.name} (${PLATFORM_SHORT[s.platform]})`).join(", "),
    );
    return t.actor ? `${text} · ${t.actor}` : text;
  }
  const status =
    t.source === "PLATFORM"
      ? `${COPY.detail.platform}: ${platformStatus(t.to_status)}`
      : `${COPY.detail.warehouse}: ${WAREHOUSE_STATUS[t.to_status as keyof typeof WAREHOUSE_STATUS]?.[0] ?? "—"}`;
  return t.actor ? `${status} · ${t.actor}` : status;
}
