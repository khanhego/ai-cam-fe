import { cx } from "./cx";
import { platformChipLabel, platformChipText, SHOP_NAME_MAX } from "./platformChipText";
import type { Platform } from "@/shared/labels";
import { StatusChip } from "./ui";

const SIZE = {
  /** Dashboard (bảng, tiêu đề D4). */
  sm: "",
  /** Station R3: chữ ≥ 20 px. */
  md: "h-auto px-3 py-1 text-[20px] leading-7",
  /** Station S2 / R2: chữ ≥ 24 px. */
  lg: "h-auto px-3 py-1 text-[24px] leading-8",
} as const;

/**
 * Chip sàn · shop dùng chung dashboard + station (DEC-479; 02b-admin §3, 02b-station §3). `platform = null` (kiện chưa
 * xác minh / đơn chưa gắn shop) → "Chưa rõ sàn" (tone cảnh báo); `single` (sàn chỉ có một shop) → chỉ tên sàn.
 */
export function PlatformChip({
  platform,
  shopName,
  single = false,
  size = "sm",
  className,
}: {
  platform: Platform | null | undefined;
  shopName?: string | null;
  single?: boolean;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const text = platformChipText(platform, shopName, single);
  const label = platformChipLabel(platform, shopName);
  return (
    <span
      role="img"
      aria-label={label}
      title={shopName && shopName.length > SHOP_NAME_MAX ? shopName : undefined}
    >
      <StatusChip tone={platform ? "neutral" : "warning"} className={cx(SIZE[size], className)}>
        <span aria-hidden="true">{text}</span>
      </StatusChip>
    </span>
  );
}
