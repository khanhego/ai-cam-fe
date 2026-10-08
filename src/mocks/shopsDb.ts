import type { Platform } from "@/shared/labels";

/**
 * Shop giả dùng chung station (`StationSim`) và dashboard (API-70, API-156, lọc sàn / shop) — bám seed Phase 3
 * (04-test-cases §1): Shopee `990001` "TST Shop A" giữ mọi dữ liệu Phase 1 / 2, `990002` "TST B", TikTok `TTMOCKA` /
 * `TTMOCKB`.
 */
export type MockShopRef = { id: string; platform: Platform; name: string };

export const SHOP = {
  A: { id: "shop-1", platform: "SHOPEE", name: "TST Shop A" },
  B: { id: "shop-2", platform: "SHOPEE", name: "TST B" },
  TT_A: { id: "shop-tt-a", platform: "TIKTOK", name: "TST TikTok A (mock)" },
  TT_B: { id: "shop-tt-b", platform: "TIKTOK", name: "TST TikTok B (mock)" },
} as const satisfies Record<string, MockShopRef>;

/**
 * Tham số kịch bản mock lấy từ query của trang (`pnpm dev:mock` — vd `?packerRequired=1`, `?backupState=KEY_CHANGED`);
 * ngoài trình duyệt / không có → null. Test đặt trạng thái trực tiếp trên db mock thay vì qua URL.
 */
export function mockParam(name: string): string | null {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get(name);
  } catch {
    return null;
  }
}
export const mockFlag = (name: string): boolean => mockParam(name) === "1";
