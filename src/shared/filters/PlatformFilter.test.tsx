import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createQueryClient } from "@/app/queryClient";
import { login } from "@/lib/api/auth";
import type { ShopBrief } from "@/lib/api/shops";

import { PlatformFilter } from "./PlatformFilter";
import { nextPlatformFilter, type PlatformFilterValue } from "./platformFilterValue";
import { isSingleShop } from "./useShopsBrief";

/** 02b-admin §3 `PlatformFilter` (API-156 cho mọi vai — DEC-484) — TC-07.40. */
const SHOPS: ShopBrief[] = [
  { id: "a", platform: "SHOPEE", name: "TST Shop A", auth_status: "CONNECTED" },
  { id: "b", platform: "SHOPEE", name: "TST B", auth_status: "CONNECTED" },
  { id: "t", platform: "TIKTOK", name: "TST TikTok A (mock)", auth_status: "CONNECTED" },
  { id: "x", platform: "TIKTOK", name: "TST TikTok B (mock)", auth_status: "DISCONNECTED" },
];

test("nextPlatformFilter: đổi sàn bỏ shop khác sàn; chọn shop đặt sàn của shop", () => {
  expect(nextPlatformFilter({ platform: null, shopId: "a" }, { platform: "TIKTOK" }, SHOPS)).toEqual({
    platform: "TIKTOK",
    shopId: null,
  });
  expect(nextPlatformFilter({ platform: null, shopId: "a" }, { platform: "SHOPEE" }, SHOPS)).toEqual({
    platform: "SHOPEE",
    shopId: "a",
  });
  expect(nextPlatformFilter({ platform: null, shopId: null }, { shopId: "t" }, SHOPS)).toEqual({
    platform: "TIKTOK",
    shopId: "t",
  });
  expect(nextPlatformFilter({ platform: "TIKTOK", shopId: "t" }, { platform: "" }, SHOPS)).toEqual({
    platform: null,
    shopId: "t",
  });
});

test("isSingleShop: không tính shop đã ngắt", () => {
  expect(isSingleShop("TIKTOK", SHOPS)).toBe(true);
  expect(isSingleShop("SHOPEE", SHOPS)).toBe(false);
  expect(isSingleShop(null, SHOPS)).toBe(false);
  expect(isSingleShop("SHOPEE", undefined)).toBe(false);
});

function Harness({ onChange }: { onChange: (v: PlatformFilterValue) => void }) {
  const [v, setV] = useState<PlatformFilterValue>({ platform: null, shopId: null });
  return (
    <PlatformFilter
      {...v}
      onChange={(next) => {
        setV(next);
        onChange(next);
      }}
    />
  );
}

test("CSKH: danh sách shop từ API-156; chọn TikTok Shop → shop chỉ của TikTok, shop đã ngắt ở nhóm cuối (RF-41)", async () => {
  await login("tst_cskh", "matkhau123", "DASHBOARD");
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={createQueryClient({ retryDelay: 0 })}>
      <Harness onChange={onChange} />
    </QueryClientProvider>,
  );
  const shop = screen.getByLabelText("Shop");
  expect(await within(shop).findByRole("option", { name: "TST B (Shopee)" })).toBeInTheDocument();
  // Shop đã ngắt (RF-41) nằm ở nhóm cuối.
  const gone = within(shop).getByRole("group", { name: "Đã ngắt" });
  expect(within(gone).getByRole("option", { name: "TST Shop cũ (Shopee)" })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Sàn"), "TIKTOK");
  expect(onChange).toHaveBeenLastCalledWith({ platform: "TIKTOK", shopId: null });
  const names = within(shop)
    .getAllByRole("option")
    .map((o) => o.textContent);
  expect(names).toEqual(["Tất cả shop", "TST TikTok A (mock)", "TST TikTok B (mock)"]);
  await user.selectOptions(shop, "shop-tt-a");
  expect(onChange).toHaveBeenLastCalledWith({ platform: "TIKTOK", shopId: "shop-tt-a" });
});
