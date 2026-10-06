import type { ShopBrief } from "@/lib/api/shops";
import { PLATFORM_LABEL, PLATFORMS } from "@/shared/labels";
import { SelectField } from "@/shared/ui";

import { nextPlatformFilter, PLATFORM_FILTER_COPY, type PlatformFilterValue } from "./platformFilterValue";

import { useShopsBrief } from "./useShopsBrief";

/**
 * Bộ lọc Sàn + Shop dùng ở D3, D14, D15, D16, D20 (02b-admin §3). Danh sách shop từ API-156 (mọi vai); shop đã ngắt
 * xếp cuối nhóm "Đã ngắt" (RF-41). Giá trị ghi URL do màn gọi (`platform`, `shop`).
 */
export function PlatformFilter({
  platform,
  shopId,
  onChange,
  idPrefix = "pf",
}: PlatformFilterValue & { onChange: (next: PlatformFilterValue) => void; idPrefix?: string }) {
  const { data: shops = [] } = useShopsBrief();
  const visible = shops.filter((s) => !platform || s.platform === platform);
  const active = visible.filter((s) => s.auth_status !== "DISCONNECTED");
  const gone = visible.filter((s) => s.auth_status === "DISCONNECTED");
  const option = (s: ShopBrief) => (
    <option key={s.id} value={s.id}>
      {platform ? s.name : `${s.name} (${PLATFORM_LABEL[s.platform]})`}
    </option>
  );
  const value = { platform, shopId };
  return (
    <>
      <SelectField
        id={`${idPrefix}-platform`}
        name="platform"
        label={PLATFORM_FILTER_COPY.platform}
        value={platform ?? ""}
        onChange={(e) => onChange(nextPlatformFilter(value, { platform: e.target.value }, shops))}
      >
        <option value="">{PLATFORM_FILTER_COPY.allPlatforms}</option>
        {PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {PLATFORM_LABEL[p]}
          </option>
        ))}
      </SelectField>
      <SelectField
        id={`${idPrefix}-shop`}
        name="shop"
        label={PLATFORM_FILTER_COPY.shop}
        value={shopId ?? ""}
        onChange={(e) => onChange(nextPlatformFilter(value, { shopId: e.target.value }, shops))}
      >
        <option value="">{PLATFORM_FILTER_COPY.allShops}</option>
        {active.map(option)}
        {gone.length > 0 && <optgroup label={PLATFORM_FILTER_COPY.disconnected}>{gone.map(option)}</optgroup>}
      </SelectField>
    </>
  );
}
