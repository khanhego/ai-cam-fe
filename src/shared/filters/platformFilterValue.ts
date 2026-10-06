import type { ShopBrief } from "@/lib/api/shops";
import { isPlatform, type Platform } from "@/shared/labels";

export const PLATFORM_FILTER_COPY = {
  platform: "Sàn",
  allPlatforms: "Tất cả",
  shop: "Shop",
  allShops: "Tất cả shop",
  disconnected: "Đã ngắt",
};

export type PlatformFilterValue = { platform: Platform | null; shopId: string | null };

/** Đổi sàn → bỏ shop không thuộc sàn mới; chọn shop → đặt luôn sàn của shop (URL nhất quán). */
export function nextPlatformFilter(
  prev: PlatformFilterValue,
  change: { platform?: string; shopId?: string },
  shops: ShopBrief[] = [],
): PlatformFilterValue {
  if (change.platform !== undefined) {
    const platform = isPlatform(change.platform) ? change.platform : null;
    const shop = shops.find((s) => s.id === prev.shopId);
    return { platform, shopId: shop && (!platform || shop.platform === platform) ? prev.shopId : null };
  }
  const shopId = change.shopId || null;
  const shop = shops.find((s) => s.id === shopId);
  return { platform: shop ? shop.platform : prev.platform, shopId };
}
