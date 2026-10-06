import { PLATFORM_LABEL, PLATFORM_SHORT, PLATFORM_UNKNOWN, type Platform } from "@/shared/labels";

/** Tên shop dài cắt sau 28 ký tự, `title` giữ tên đầy đủ (02b-station RF-31). */
export const SHOP_NAME_MAX = 28;

const truncate = (name: string) => (name.length > SHOP_NAME_MAX ? `${name.slice(0, SHOP_NAME_MAX)}…` : name);

/** Chữ hiển thị của chip (01 §10.5 chung, 02b-station §3) — dùng cả ở test / chỗ cần chuỗi. */
export function platformChipText(
  platform: Platform | null | undefined,
  shopName?: string | null,
  single = false,
) {
  if (!platform) return PLATFORM_UNKNOWN;
  if (single || !shopName) return PLATFORM_SHORT[platform];
  return `${PLATFORM_SHORT[platform]} · ${truncate(shopName)}`;
}

/** `aria-label` "Sàn: TikTok Shop, shop Áo Đẹp Official" (02b-station §9). */
export function platformChipLabel(platform: Platform | null | undefined, shopName?: string | null) {
  if (!platform) return PLATFORM_UNKNOWN;
  return shopName ? `Sàn: ${PLATFORM_LABEL[platform]}, shop ${shopName}` : `Sàn: ${PLATFORM_LABEL[platform]}`;
}
