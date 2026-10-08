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

/** URL của màn danh sách (DEC-488): `platform` (`SHOPEE` / `TIKTOK`), `shop` (id shop). API dùng `shop_id`. */
export function platformFromParams(p: URLSearchParams): PlatformFilterValue {
  const platform = p.get("platform");
  return { platform: isPlatform(platform) ? platform : null, shopId: p.get("shop")?.trim() || null };
}

export function platformToParams(v: PlatformFilterValue): Record<string, string> {
  const out: Record<string, string> = {};
  if (v.platform) out.platform = v.platform;
  if (v.shopId) out.shop = v.shopId;
  return out;
}

/** Tham số API-30 / 110 / 120 / 130 (02 §6.2 "lọc sàn / shop"). */
export function platformToApi(v: PlatformFilterValue): { platform?: Platform; shop_id?: string } {
  return { ...(v.platform ? { platform: v.platform } : {}), ...(v.shopId ? { shop_id: v.shopId } : {}) };
}

/** Trường `platform` / `shop` cho object bộ lọc màn (không có → bỏ trường, không đặt null). */
export function platformUrlFields(p: URLSearchParams): { platform?: Platform; shop?: string } {
  const v = platformFromParams(p);
  return { ...(v.platform ? { platform: v.platform } : {}), ...(v.shopId ? { shop: v.shopId } : {}) };
}
