import { useQuery } from "@tanstack/react-query";

import { shopsApi, type ShopBrief } from "@/lib/api/shops";
import type { Platform } from "@/shared/labels";

/** Query `["shopsBrief"]` (API-156, mọi vai dashboard — DEC-484): `staleTime` 5 phút; WS `shop.updated` invalidate. */
export const SHOPS_BRIEF_KEY = ["shopsBrief"] as const;

export function useShopsBrief() {
  return useQuery({
    queryKey: SHOPS_BRIEF_KEY,
    queryFn: async () => (await shopsApi.brief()).items,
    staleTime: 5 * 60_000,
  });
}

/**
 * Sàn chỉ có một shop (không tính shop đã ngắt) → chip chỉ hiện tên sàn (01 §10.5 chung). Chưa có danh sách → false
 * (hiện đủ tên shop cho an toàn).
 */
export function isSingleShop(platform: Platform | null | undefined, shops: ShopBrief[] | undefined): boolean {
  if (!platform || !shops) return false;
  return shops.filter((s) => s.platform === platform && s.auth_status !== "DISCONNECTED").length === 1;
}
