import type { Platform } from "@/shared/labels";
import { PlatformChip } from "@/shared/ui";

import { isSingleShop, useShopsBrief } from "./useShopsBrief";

/**
 * Chip sàn · shop trên một dòng danh sách / tiêu đề dashboard (01 §10.5 chung, FR-03.03 / 07.01): sàn chỉ có một shop
 * đang kết nối → chỉ tên sàn (API-156 `["shopsBrief"]`, DEC-548); `platform = null` → "Chưa rõ sàn".
 */
export function ShopChip({
  platform,
  shop,
  className,
}: {
  platform: Platform | null | undefined;
  shop: { name: string } | null | undefined;
  className?: string;
}) {
  const { data: shops } = useShopsBrief();
  return (
    <PlatformChip
      platform={platform ?? null}
      shopName={shop?.name ?? null}
      single={isSingleShop(platform, shops)}
      className={className}
    />
  );
}
